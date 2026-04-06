const {ipcMain} = require('electron');
const {spawn, exec} = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const AdmZip = require('adm-zip');
const {promisify} = require('util');
const execPromise = promisify(exec);
const configManager = require('../configManager.cjs');

module.exports = function registerRedisHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'redis_install.log');

    // 辅助函数：获取 Redis 版本配置
    function getRedisVersionConfig(version) {
        const cfg = configManager.getToolConfig('redis', version);
        if (!cfg) return null;
        
        // 根据版本设置默认端口（从6379开始递增）
        const versionNum = parseFloat(version);
        const defaultPort = 6379 + Math.floor((versionNum - 3.2) / 0.2) * 1;
        
        return {
            ...cfg,
            defaultPort
        };
    }

    function logToFile(message) {
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
    }

    let currentAbortController = null;
    let pendingLocalFile = null;
    const processes = new Map();

    async function downloadFile(url, destPath, onProgress, signal, onSlowSpeed = null) {
        const writer = fs.createWriteStream(destPath);
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            timeout: 60000,
            signal
        });
        const totalLength = response.headers['content-length'];
        let downloaded = 0;
        let speedCheckInterval = null;
        let lastDownloaded = 0;
        let lastCheckTime = Date.now();
        let slowSpeedNotified = false;
        
        speedCheckInterval = setInterval(() => {
            const currentTime = Date.now();
            const timeDiff = (currentTime - lastCheckTime) / 1000;
            const bytesDiff = downloaded - lastDownloaded;
            const speedBps = bytesDiff / timeDiff;
            const speedKbps = speedBps / 1024;
            
            logToFile(`[Redis下载] 速度: ${speedKbps.toFixed(2)} KB/s, 已下载: ${(downloaded / 1024 / 1024).toFixed(2)} MB`);
            
            if (onSlowSpeed && speedKbps < 50 && downloaded > 1024 * 1024 && !slowSpeedNotified) {
                slowSpeedNotified = true;
                mainWindow.webContents.send('download-speed-warning', {
                    type: 'redis',
                    speed: speedKbps.toFixed(2),
                    message: `当前下载速度较慢 (${speedKbps.toFixed(1)} KB/s),建议在设置中更换代理节点` 
                });
            }
            
            lastDownloaded = downloaded;
            lastCheckTime = currentTime;
        }, 3000);
        
        response.data.on('data', (chunk) => {
            downloaded += chunk.length;
            if (onProgress && totalLength) {
                onProgress(downloaded / totalLength);
            }
        });
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                clearInterval(speedCheckInterval);
                resolve();
            });
            writer.on('error', (err) => {
                clearInterval(speedCheckInterval);
                reject(err);
            });
            signal.addEventListener('abort', () => {
                clearInterval(speedCheckInterval);
                writer.destroy();
                reject(new Error('下载已取消'));
            });
        });
    }

    function installZip(zipPath, installDir) {
        return new Promise((resolve, reject) => {
            try {
                if (fs.existsSync(installDir)) {
                    fs.rmSync(installDir, {recursive: true, force: true});
                    logToFile(`已删除旧目录: ${installDir}`);
                }
                fs.mkdirSync(installDir, {recursive: true});
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(installDir, true);
                logToFile(`解压成功: ${zipPath} -> ${installDir}`);
                resolve();
            } catch (err) {
                logToFile(`解压失败: ${err.message}`);
                reject(err);
            }
        });
    }

    function setSystemEnvVariable(name, value) {
        return new Promise((resolve, reject) => {
            const setxCmd = `C:\\Windows\\System32\\setx.exe /M "${name}" "${value}"`;
            logToFile(`执行 setx: ${setxCmd}`);
            exec(setxCmd, {windowsHide: true}, (error, stdout, stderr) => {
                if (error) {
                    logToFile(`setx 失败: ${stderr || error.message}`);
                    reject(new Error(`设置系统变量失败: ${stderr || error.message}`));
                } else {
                    logToFile(`setx 成功: ${name}=${value}`);
                    const psRefresh = `$env:${name} = "${value}"`;
                    exec(`powershell -NoProfile -Command "${psRefresh.replace(/"/g, '\\"')}"`, (err) => {
                        if (err) logToFile(`刷新当前进程 ${name} 失败: ${err.message}`);
                        resolve();
                    });
                }
            });
        });
    }

    function removeSystemEnvVariable(name) {
        return new Promise((resolve, reject) => {
            const setxCmd = `C:\\Windows\\System32\\setx.exe /M "${name}" ""`;
            exec(setxCmd, {windowsHide: true}, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    async function getSystemPath() {
        try {
            const regCmd = `C:\\Windows\\System32\\reg.exe query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path`;
            const {stdout} = await execPromise(regCmd);
            const match = stdout.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
            if (match && match[1]) return match[1].trim();
        } catch (err) {
        }
        return '';
    }

    function setPathForRedis(suffix) {
        return new Promise(async (resolve, reject) => {
            const targetVar = `REDIS_HOME${suffix}`;
            const targetEntry = `%${targetVar}%`;

            const currentPath = await getSystemPath();
            const parts = currentPath.split(';');
            const newParts = [];
            for (const p of parts) {
                if (!/^%REDIS_HOME\d+%$/i.test(p)) {
                    newParts.push(p);
                }
            }
            newParts.unshift(targetEntry);
            const newPath = newParts.join(';');

            const setxCmd = `C:\\Windows\\System32\\setx.exe /M PATH "${newPath}"`;
            logToFile(`执行 setx PATH: ${setxCmd}`);
            exec(setxCmd, {windowsHide: true}, (err) => {
                if (err) {
                    reject(new Error(`设置 PATH 失败: ${err.message}`));
                } else {
                    logToFile(`PATH 设置成功: ${newPath}`);
                    resolve();
                }
            });
        });
    }

    async function refreshCurrentProcessEnv() {
        try {
            const systemPath = await getSystemPath();
            process.env.Path = systemPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
        } catch (err) {
            logToFile(`刷新环境变量失败: ${err.message}`);
        }
    }

    async function isPortInUse(port) {
        return new Promise((resolve) => {
            const netstatCmd = `netstat -ano | findstr :${port}`;
            exec(netstatCmd, {windowsHide: true}, (error, stdout) => {
                resolve(!error && stdout.trim().length > 0);
            });
        });
    }

    async function findAvailablePort(defaultPort) {
        let port = defaultPort;
        while (await isPortInUse(port)) {
            port++;
        }
        return port;
    }

    async function generateRedisConf(installDir, port, password, maxmemory) {
        const confPath = path.join(installDir, 'redis.windows.conf');
        let content = `port ${port}\n`;
        if (password && password.trim() !== '') {
            content += `requirepass ${password}\n`;
        }
        if (maxmemory && maxmemory > 0) {
            content += `maxmemory ${maxmemory}mb\n`;
            content += `maxmemory-policy allkeys-lru\n`;
        }
        content += `bind 127.0.0.1\n`;
        content += `protected-mode yes\n`;
        content += `daemonize no\n`;
        content += `loglevel notice\n`;
        content += `logfile ""\n`;
        content += `databases 16\n`;
        content += `save ""\n`;
        content += `appendonly no\n`;
        fs.writeFileSync(confPath, content, 'utf8');
        logToFile(`生成配置文件: ${confPath}`);
        return confPath;
    }

    async function startRedisProcess(installDir, confPath, versionKey) {
        const redisServerPath = path.join(installDir, 'redis-server.exe');
        if (!fs.existsSync(redisServerPath)) throw new Error('未找到 redis-server.exe');
        const relativeConfPath = path.basename(confPath);
        logToFile(`准备启动 Redis ${versionKey}，命令: "${redisServerPath}" "${relativeConfPath}" 工作目录: ${installDir}`);
        const proc = spawn(redisServerPath, [relativeConfPath], {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: installDir
        });
        proc.unref();
        let stderrBuffer = '';
        proc.stderr.on('data', (data) => {
            const str = data.toString();
            stderrBuffer += str;
            logToFile(`[Redis ${versionKey} stderr] ${str.trim()}`);
        });
        proc.stdout.on('data', (data) => {
            logToFile(`[Redis ${versionKey} stdout] ${data.toString().trim()}`);
        });
        proc.on('error', (err) => {
            logToFile(`启动 Redis ${versionKey} 进程时出错: ${err.message}`);
        });
        proc.on('exit', (code, signal) => {
            logToFile(`Redis ${versionKey} 进程退出，代码: ${code}，信号: ${signal}`);
            if (code !== 0 && code !== null && stderrBuffer) {
                logToFile(`退出时的 stderr 内容: ${stderrBuffer}`);
            } else if (code !== 0 && !stderrBuffer) {
                logToFile(`进程退出但未捕获到 stderr，可能配置文件错误或端口冲突`);
            }
            processes.delete(versionKey);
            // 删除 PID 文件
            const pidPath = path.join(installDir, 'redis.pid');
            if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
        });
        processes.set(versionKey, proc);
        // 写入 PID 文件以备后用
        const pidPath = path.join(installDir, 'redis.pid');
        fs.writeFileSync(pidPath, proc.pid.toString(), 'utf8');
        logToFile(`Redis ${versionKey} 进程已启动，PID: ${proc.pid}`);
        return proc;
    }

    async function stopRedisProcess(versionKey) {
        const proc = processes.get(versionKey);
        if (proc) {
            logToFile(`准备终止 Redis ${versionKey} 进程 PID: ${proc.pid}`);
            try {
                // 尝试优雅终止
                process.kill(proc.pid, 'SIGTERM');
                // 等待进程退出
                await new Promise((resolve) => {
                    proc.once('exit', resolve);
                    setTimeout(resolve, 3000); // 最多等待3秒
                });
                if (!proc.killed) {
                    // 强制终止
                    exec(`taskkill /PID ${proc.pid} /F`, {windowsHide: true}, (err) => {
                        if (err) logToFile(`强制终止失败: ${err.message}`);
                        else logToFile(`Redis ${versionKey} 进程已强制终止`);
                    });
                } else {
                    logToFile(`Redis ${versionKey} 进程已优雅终止`);
                }
            } catch (err) {
                logToFile(`终止 Redis ${versionKey} 进程时出错: ${err.message}`);
                // 回退到 taskkill
                exec(`taskkill /PID ${proc.pid} /F`, {windowsHide: true}, (err2) => {
                    if (err2) logToFile(`taskkill 失败: ${err2.message}`);
                    else logToFile(`Redis ${versionKey} 进程已终止`);
                });
            }
            processes.delete(versionKey);
        } else {
            const home = await findRedisHome(versionKey);
            if (home) {
                const pidPath = path.join(home, 'redis.pid');
                if (fs.existsSync(pidPath)) {
                    const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
                    if (!isNaN(pid)) {
                        logToFile(`通过 PID 文件终止 Redis ${versionKey} PID: ${pid}`);
                        exec(`taskkill /PID ${pid} /F`, {windowsHide: true}, (err) => {
                            if (err) logToFile(`通过 PID 文件终止失败: ${err.message}`);
                            else logToFile(`Redis ${versionKey} 进程已终止`);
                        });
                        fs.unlinkSync(pidPath);
                    }
                }
            }
        }
    }

    async function isRedisRunning(versionKey, installDir) {
        const proc = processes.get(versionKey);
        if (proc && !proc.killed) return true;
        if (installDir) {
            const pidPath = path.join(installDir, 'redis.pid');
            if (fs.existsSync(pidPath)) {
                try {
                    const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
                    if (!isNaN(pid)) {
                        const {stdout} = await execPromise(`tasklist /FI "PID eq ${pid}"`);
                        const running = stdout.includes(pid.toString());
                        if (!running) fs.unlinkSync(pidPath);
                        return running;
                    }
                } catch (e) {
                }
            }
        }
        // 兜底：检查是否有 redis-server 进程监听该版本端口（可选项，此处简化）
        return false;
    }

    async function getAllInstalledVersions() {
        const versions = new Set();
        // 从配置中获取所有 Redis 版本
        const config = configManager.getConfig();
        if (config && config.tools && config.tools.redis && config.tools.redis.versions) {
            for (const [ver, cfg] of Object.entries(config.tools.redis.versions)) {
                const varName = `REDIS_HOME${cfg.suffix}`;
                try {
                    const {stdout} = await execPromise(`echo %${varName}%`);
                    const home = stdout.trim();
                    if (home && fs.existsSync(home) && fs.existsSync(path.join(home, 'redis-server.exe'))) {
                        versions.add(ver);
                    }
                } catch (err) {
                }
            }
        }
        const baseDirs = [
            'C:\\Program Files\\Redis',
            'C:\\Program Files\\muling\\muling-env-box\\Redis'
        ];
        for (const baseDir of baseDirs) {
            if (fs.existsSync(baseDir)) {
                const dirs = fs.readdirSync(baseDir);
                for (const dir of dirs) {
                    const fullPath = path.join(baseDir, dir);
                    if (fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, 'redis-server.exe'))) {
                        const match = dir.match(/redis-(\d+\.\d+)/);
                        if (match && getRedisVersionConfig(match[1])) {
                            versions.add(match[1]);
                        }
                    }
                }
            }
        }
        return Array.from(versions).sort((a, b) => {
            const order = ['3.2', '4.0', '5.0', '6.0', '6.2', '7.0', '7.2', '7.4', '8.0', '8.2', '8.4', '8.6'];
            return order.indexOf(a) - order.indexOf(b);
        });
    }

    async function findRedisHome(version) {
        const cfg = getRedisVersionConfig(version);
        if (!cfg) return null;
        const varName = `REDIS_HOME${cfg.suffix}`;
        try {
            const {stdout} = await execPromise(`echo %${varName}%`);
            const home = stdout.trim();
            if (home && fs.existsSync(home)) return home;
        } catch (err) {
        }
        const installDirs = [
            `C:\\Program Files\\Redis\\redis-${version}`,
            `C:\\Program Files\\muling\\muling-env-box\\Redis\\redis-${version}`
        ];
        for (const installDir of installDirs) {
            if (fs.existsSync(installDir) && fs.existsSync(path.join(installDir, 'redis-server.exe'))) {
                return installDir;
            }
        }
        return null;
    }

    async function getCurrentDefaultVersion() {
        try {
            const systemPath = await getSystemPath();
            const match = systemPath.match(/%REDIS_HOME(\d+)%/);
            if (match && match[1]) {
                const suffix = match[1];
                for (const [ver, cfg] of Object.entries(config.tools.redis.versions)) {
                    if (cfg.suffix === suffix) return ver;
                }
            }
            const {stdout, stderr} = await execPromise('redis-cli --version 2>&1');
            const output = stdout + stderr;
            const verMatch = output.match(/redis-cli (\d+\.\d+\.\d+)/i);
            if (verMatch) {
                const majorMinor = verMatch[1].split('.')[0] + '.' + verMatch[1].split('.')[1];
                if (getRedisVersionConfig(majorMinor)) return majorMinor;
            }
            return null;
        } catch (err) {
            return null;
        }
    }

    ipcMain.on('cancel-redis-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    ipcMain.handle('import-local-redis', async (event, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.zip') return {success: false, message: '只支持 .zip 文件'};
        const fileName = path.basename(filePath);
        const destPath = path.join(downloadDir, fileName);
        fs.copyFileSync(filePath, destPath);
        pendingLocalFile = destPath;
        return {success: true, message: 'Redis 安装包已导入，请选择版本后点击“开始安装”'};
    });

    ipcMain.handle('check-port', async (event, port) => {
        const inUse = await isPortInUse(port);
        return {success: true, available: !inUse};
    });

    ipcMain.handle('install-redis', async (event, version, password = '', maxmemory = 0, customPort = null) => {
        const cfg = getRedisVersionConfig(version);
        if (!cfg) return {success: false, message: `不支持的 Redis 版本: ${version}`};
        
        // 获取配置中的 baseDir
        const toolConfig = configManager.getToolConfig('redis', version);
        const baseDir = toolConfig?.baseDir || 'C:\\Program Files\\Redis';
        
        const {url, suffix, defaultPort} = cfg;
        let targetPort = customPort && !isNaN(customPort) ? customPort : defaultPort;
        if (await isPortInUse(targetPort)) {
            if (!customPort) {
                targetPort = await findAvailablePort(targetPort);
            } else {
                return {success: false, message: `端口 ${targetPort} 已被占用，请选择其他端口`};
            }
        }
        const fileName = url.split('/').pop();
        const installerPath = path.join(downloadDir, fileName);
        const installPath = path.join(baseDir, `redis-${version}`);
        const sendProgress = (progress, stage = '') => {
            mainWindow.webContents.send('redis-progress', {type: 'redis', version, progress, stage});
        };
        const abortController = new AbortController();
        currentAbortController = abortController;
        try {
            if (!fs.existsSync(installerPath)) {
                sendProgress(0, '下载安装包');
                await downloadFile(url, installerPath, (p) => sendProgress(p, '下载安装包'), abortController.signal, true);
                sendProgress(0.3, '解压中');
            } else {
                sendProgress(0.3, '解压中');
            }
            await installZip(installerPath, installPath);
            sendProgress(0.5, '生成配置');
            await generateRedisConf(installPath, targetPort, password, maxmemory);
            sendProgress(0.9, '配置环境变量');
            await setSystemEnvVariable(`REDIS_HOME${suffix}`, installPath);
            await setPathForRedis(suffix);
            await refreshCurrentProcessEnv();
            sendProgress(1, '安装完成');
            mainWindow.webContents.send('redis-changed');
            return {success: true, message: `Redis ${version} 安装成功，端口: ${targetPort}`};
        } catch (err) {
            if (err.message === '下载已取消') return {success: false, message: '下载已取消'};
            logToFile(`安装失败: ${err.message}`);
            // 检查是否是权限错误
            if (err.code === 'EPERM' || err.code === 'EACCES') {
                return {
                    success: false,
                    message: '安装失败：没有权限写入该目录。请右键点击应用，选择“以管理员身份运行”后重试。'
                };
            }
            return {success: false, message: `安装失败: ${err.message}`};
        } finally {
            if (currentAbortController === abortController) currentAbortController = null;
            if (fs.existsSync(installerPath)) {
                try {
                    fs.unlinkSync(installerPath);
                } catch (e) {
                }
            }
        }
    });

    ipcMain.handle('install-from-local-redis', async (event, version, password = '', maxmemory = 0, customPort = null) => {
        if (!pendingLocalFile) return {success: false, message: '没有已导入的 Redis 安装包，请先导入'};
        const cfg = getRedisVersionConfig(version);
        if (!cfg) return {success: false, message: `不支持的 Redis 版本: ${version}`};
        
        // 获取配置中的 baseDir，与在线安装保持一致
        const toolConfig = configManager.getToolConfig('redis', version);
        const baseDir = toolConfig?.baseDir || 'C:\\Program Files\\Redis';
        
        const {suffix, defaultPort} = cfg;
        let targetPort = customPort && !isNaN(customPort) ? customPort : defaultPort;
        if (await isPortInUse(targetPort)) {
            if (!customPort) {
                targetPort = await findAvailablePort(targetPort);
            } else {
                return {success: false, message: `端口 ${targetPort} 已被占用，请选择其他端口`};
            }
        }
        const zipPath = pendingLocalFile;
        const installPath = path.join(baseDir, `redis-${version}`);
        const sendProgress = (progress, stage = '') => {
            mainWindow.webContents.send('redis-progress', {type: 'redis', version, progress, stage});
        };
        try {
            sendProgress(0.3, '解压中');
            await installZip(zipPath, installPath);
            sendProgress(0.5, '生成配置');
            await generateRedisConf(installPath, targetPort, password, maxmemory);
            sendProgress(0.9, '配置环境变量');
            await setSystemEnvVariable(`REDIS_HOME${suffix}`, installPath);
            await setPathForRedis(suffix);
            await refreshCurrentProcessEnv();
            sendProgress(1, '安装完成');
            mainWindow.webContents.send('redis-changed');
            return {success: true, message: `Redis ${version} 安装成功，端口: ${targetPort}`};
        } catch (err) {
            logToFile(`安装失败: ${err.message}`);
            // 检查是否是权限错误
            if (err.code === 'EPERM' || err.code === 'EACCES') {
                return {
                    success: false,
                    message: '安装失败：没有权限写入该目录。请右键点击应用，选择“以管理员身份运行”后重试。'
                };
            }
            return {success: false, message: `安装失败: ${err.message}`};
        } finally {
            if (fs.existsSync(zipPath)) {
                try {
                    fs.unlinkSync(zipPath);
                } catch (e) {
                }
            }
            pendingLocalFile = null;
        }
    });

    ipcMain.handle('check-redis', async () => {
        try {
            const versions = await getAllInstalledVersions();
            const defaultVersion = await getCurrentDefaultVersion();
            return {versions, default: defaultVersion};
        } catch (err) {
            return {versions: [], default: null};
        }
    });

    ipcMain.handle('switch-redis', async (event, version) => {
        try {
            const cfg = getRedisVersionConfig(version);
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const home = await findRedisHome(version);
            if (!home) return {success: false, message: `未找到 Redis ${version} 的安装目录`};
            const currentDefault = await getCurrentDefaultVersion();
            if (currentDefault) {
                await stopRedisProcess(currentDefault);
            }
            await setPathForRedis(cfg.suffix);
            await refreshCurrentProcessEnv();
            await startRedisProcess(home, path.join(home, 'redis.windows.conf'), version);
            mainWindow.webContents.send('redis-changed');
            return {success: true, message: `已切换到 Redis ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('delete-redis', async (event, version) => {
        try {
            const cfg = getRedisVersionConfig(version);
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const home = await findRedisHome(version);
            if (!home) return {success: false, message: `未找到 Redis ${version} 的安装目录`};
            await stopRedisProcess(version);
            const currentDefault = await getCurrentDefaultVersion();
            if (currentDefault === version) {
                const allVersions = await getAllInstalledVersions();
                const other = allVersions.find(v => v !== version);
                if (other) {
                    const otherCfg = getRedisVersionConfig(other);
                    await setPathForRedis(otherCfg.suffix);
                } else {
                    const systemPath = await getSystemPath();
                    const parts = systemPath.split(';');
                    const newParts = parts.filter(p => !/^%REDIS_HOME\d+%$/i.test(p));
                    const newPath = newParts.join(';');
                    const setxCmd = `C:\\Windows\\System32\\setx.exe /M PATH "${newPath}"`;
                    await execPromise(setxCmd);
                }
            }
            await removeSystemEnvVariable(`REDIS_HOME${cfg.suffix}`);
            fs.rmSync(home, {recursive: true, force: true});
            mainWindow.webContents.send('redis-changed');
            return {success: true, message: `已删除 Redis ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('start-redis-service', async (event, version) => {
        try {
            logToFile(`收到启动 Redis ${version} 的请求`);
            const cfg = getRedisVersionConfig(version);
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const home = await findRedisHome(version);
            if (!home) return {success: false, message: `未找到 Redis ${version} 的安装目录`};
            const confPath = path.join(home, 'redis.windows.conf');
            if (!fs.existsSync(confPath)) throw new Error('未找到配置文件');
            const running = await isRedisRunning(version, home);
            if (running) return {success: false, message: `Redis ${version} 已经在运行`};
            await startRedisProcess(home, confPath, version);
            await setPathForRedis(cfg.suffix);
            await refreshCurrentProcessEnv();
            mainWindow.webContents.send('redis-changed');
            return {success: true, message: `Redis ${version} 已启动并设为默认`};
        } catch (err) {
            logToFile(`启动 Redis ${version} 时出错: ${err.message}`);
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('stop-redis-service', async (event, version) => {
        try {
            logToFile(`收到停止 Redis ${version} 的请求`);
            const cfg = getRedisVersionConfig(version);
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const home = await findRedisHome(version);
            if (!home) return {success: false, message: `未找到 Redis ${version} 的安装目录`};
            const running = await isRedisRunning(version, home);
            if (!running) return {success: false, message: `Redis ${version} 未运行`};
            await stopRedisProcess(version);
            return {success: true, message: `Redis ${version} 已停止`};
        } catch (err) {
            logToFile(`停止 Redis ${version} 时出错: ${err.message}`);
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('restart-redis-service', async (event, version) => {
        try {
            logToFile(`收到重启 Redis ${version} 的请求`);
            const cfg = getRedisVersionConfig(version);
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const home = await findRedisHome(version);
            if (!home) return {success: false, message: `未找到 Redis ${version} 的安装目录`};
            const confPath = path.join(home, 'redis.windows.conf');
            if (!fs.existsSync(confPath)) throw new Error('未找到配置文件');
            await stopRedisProcess(version);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await startRedisProcess(home, confPath, version);
            await setPathForRedis(cfg.suffix);
            await refreshCurrentProcessEnv();
            mainWindow.webContents.send('redis-changed');
            return {success: true, message: `Redis ${version} 已重启并设为默认`};
        } catch (err) {
            logToFile(`重启 Redis ${version} 时出错: ${err.message}`);
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('get-redis-service-status', async (event, version) => {
        try {
            const cfg = getRedisVersionConfig(version);
            if (!cfg) return {success: false, status: 'unknown', message: '不支持的版本'};
            const home = await findRedisHome(version);
            const running = await isRedisRunning(version, home);
            return {success: true, status: running ? 'running' : 'stopped'};
        } catch (err) {
            return {success: false, status: 'error', message: err.message};
        }
    });

    ipcMain.handle('get-redis-config', async (event, version) => {
        try {
            const cfg = getRedisVersionConfig(version);
            if (!cfg) return {success: false, message: '不支持的版本'};
            const home = await findRedisHome(version);
            if (!home) return {success: false, message: '未找到安装目录'};
            const confPath = path.join(home, 'redis.windows.conf');
            if (!fs.existsSync(confPath)) return {success: false, message: '配置文件不存在'};
            const content = fs.readFileSync(confPath, 'utf8');
            const portMatch = content.match(/^port\s+(\d+)/m);
            const port = portMatch ? parseInt(portMatch[1], 10) : 6379;
            const hasPassword = /^requirepass\s+\S+/m.test(content);
            return {success: true, port, hasPassword};
        } catch (err) {
            logToFile(`获取 Redis ${version} 配置失败: ${err.message}`);
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('change-redis-password', async (event, version, oldPassword, newPassword) => {
        try {
            const cfg = getRedisVersionConfig(version);
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const home = await findRedisHome(version);
            if (!home) return {success: false, message: `未找到 Redis ${version} 的安装目录`};
            const confPath = path.join(home, 'redis.windows.conf');
            if (!fs.existsSync(confPath)) throw new Error('未找到配置文件');
            let content = fs.readFileSync(confPath, 'utf8');
            if (newPassword && newPassword.trim() !== '') {
                if (content.match(/^requirepass\s+.*/m)) {
                    content = content.replace(/^requirepass\s+.*$/m, `requirepass ${newPassword}`);
                } else {
                    content += `\nrequirepass ${newPassword}\n`;
                }
            } else {
                content = content.replace(/^requirepass\s+.*$/m, '');
            }
            fs.writeFileSync(confPath, content, 'utf8');
            await stopRedisProcess(version);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await startRedisProcess(home, confPath, version);
            await setPathForRedis(cfg.suffix);
            await refreshCurrentProcessEnv();
            mainWindow.webContents.send('redis-changed');
            logToFile(`Redis ${version} 密码修改成功`);
            return {success: true, message: `Redis ${version} 密码已修改，服务已重启并设为默认`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });
};