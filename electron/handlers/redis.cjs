const {ipcMain} = require('electron');
const {spawn} = require('child_process');
const path = require('path');
const fs = require('fs');
const {exec} = require('child_process');
const axios = require('axios');
const AdmZip = require('adm-zip');
const {promisify} = require('util');
const execPromise = promisify(exec);

const redisVersions = {
    '3.2': {
        suffix: '32',
        defaultPort: 6379,
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v4.0.0/Redis-3.2.1.zip'
    },
    '4.0': {
        suffix: '40',
        defaultPort: 6380,
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v4.0.0/Redis-4.0.14.zip'
    },
    '5.0': {
        suffix: '50',
        defaultPort: 6381,
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v4.0.0/Redis-5.0.14.zip'
    },
    '6.0': {
        suffix: '60',
        defaultPort: 6382,
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v4.0.0/Redis-6.0.19.zip'
    },
    '6.2': {
        suffix: '62',
        defaultPort: 6383,
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v4.0.0/Redis-6.2.21.zip'
    },
    '7.0': {
        suffix: '70',
        defaultPort: 6384,
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v4.0.0/Redis-7.0.15.zip'
    },
    '7.2': {
        suffix: '72',
        defaultPort: 6385,
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v4.0.0/Redis-7.2.13.zip'
    },
    '7.4': {
        suffix: '74',
        defaultPort: 6386,
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v4.0.0/Redis-7.4.8.zip'
    },
    '8.0': {
        suffix: '80',
        defaultPort: 6387,
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v4.0.0/Redis-8.0.6.zip'
    },
    '8.2': {
        suffix: '82',
        defaultPort: 6388,
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v4.0.0/Redis-8.2.5.zip'
    },
    '8.4': {
        suffix: '84',
        defaultPort: 6389,
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v4.0.0/Redis-8.4.2.zip'
    },
    '8.6': {
        suffix: '86',
        defaultPort: 6390,
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v4.0.0/Redis-8.6.2.zip'
    }
};

module.exports = function registerRedisHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'redis_install.log');

    function logToFile(message) {
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
    }

    let currentAbortController = null;
    let pendingLocalFile = null;
    // 存储每个版本的进程 PID (文件方式，以便重启后恢复)
    const pidDir = path.join(userDataPath, 'redis_pids');
    if (!fs.existsSync(pidDir)) fs.mkdirSync(pidDir, {recursive: true});

    async function downloadFile(url, destPath, onProgress, signal) {
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
        response.data.on('data', (chunk) => {
            downloaded += chunk.length;
            if (onProgress && totalLength) onProgress(downloaded / totalLength);
        });
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            signal.addEventListener('abort', () => {
                writer.destroy();
                reject(new Error('下载已取消'));
            });
        });
    }

    function installZip(zipPath, installDir) {
        return new Promise((resolve, reject) => {
            try {
                if (fs.existsSync(installDir)) fs.rmSync(installDir, {recursive: true, force: true});
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
                if (!/^%REDIS_HOME\d+%$/i.test(p)) newParts.push(p);
            }
            newParts.unshift(targetEntry);
            const newPath = newParts.join(';');
            const setxCmd = `C:\\Windows\\System32\\setx.exe /M PATH "${newPath}"`;
            logToFile(`执行 setx PATH: ${setxCmd}`);
            exec(setxCmd, {windowsHide: true}, (err) => {
                if (err) reject(new Error(`设置 PATH 失败: ${err.message}`));
                else {
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

    async function findAvailablePort(defaultPort) {
        return new Promise((resolve) => {
            const netstatCmd = `netstat -ano | findstr :${defaultPort}`;
            exec(netstatCmd, {windowsHide: true}, (error, stdout) => {
                if (error || !stdout.trim()) resolve(defaultPort);
                else {
                    let port = defaultPort + 1;
                    const tryPort = (p) => {
                        exec(`netstat -ano | findstr :${p}`, {windowsHide: true}, (err, out) => {
                            if (err || !out.trim()) resolve(p);
                            else tryPort(p + 1);
                        });
                    };
                    tryPort(port);
                }
            });
        });
    }

    async function generateRedisConf(installDir, port, password, maxmemory) {
        const confPath = path.join(installDir, 'redis.windows.conf');
        let content = `port ${port}\n`;
        if (password && password.trim() !== '') content += `requirepass ${password}\n`;
        if (maxmemory && maxmemory > 0) {
            content += `maxmemory ${maxmemory}mb\n`;
            content += `maxmemory-policy allkeys-lru\n`;
        }
        content += `bind 127.0.0.1\nprotected-mode yes\ndaemonize no\nloglevel notice\nlogfile ""\ndatabases 16\nsave ""\nappendonly no\n`;
        fs.writeFileSync(confPath, content, 'utf8');
        logToFile(`生成配置文件: ${confPath}`);
        return confPath;
    }

    // ----- 进程管理 -----
    function getPidFile(version, suffix) {
        return path.join(pidDir, `redis_${suffix}.pid`);
    }

    async function getRedisPid(version, suffix) {
        const pidFile = getPidFile(version, suffix);
        try {
            const pid = fs.readFileSync(pidFile, 'utf8').trim();
            if (pid && !isNaN(parseInt(pid))) return parseInt(pid);
        } catch (e) {
        }
        return null;
    }

    async function isProcessRunning(pid) {
        if (!pid) return false;
        try {
            const {stdout} = await execPromise(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
            return stdout.includes(`"${pid}"`);
        } catch (err) {
            return false;
        }
    }

    async function getRedisProcessStatus(version, suffix) {
        const pid = await getRedisPid(version, suffix);
        if (pid && await isProcessRunning(pid)) return 'running';
        return 'stopped';
    }

    async function startRedisProcess(installDir, version, suffix, port, password) {
        const redisServerPath = path.join(installDir, 'redis-server.exe');
        const confPath = path.join(installDir, 'redis.windows.conf');
        if (!fs.existsSync(redisServerPath)) throw new Error('未找到 redis-server.exe');
        // 先检查是否已经运行
        const status = await getRedisProcessStatus(version, suffix);
        if (status === 'running') throw new Error('Redis 已经在运行');
        // 启动进程
        const args = [confPath];
        const proc = spawn(redisServerPath, args, {detached: true, stdio: 'ignore'});
        proc.unref(); // 允许进程独立于 Electron 运行
        const pid = proc.pid;
        const pidFile = getPidFile(version, suffix);
        fs.writeFileSync(pidFile, pid.toString(), 'utf8');
        logToFile(`Redis ${version} 已启动，PID: ${pid}`);
        // 等待几秒确认启动成功
        await new Promise(resolve => setTimeout(resolve, 2000));
        // 检查端口监听
        const {stdout} = await execPromise(`netstat -ano | findstr :${port} | findstr LISTENING`);
        if (!stdout.includes(`${pid}`)) {
            // 可能启动失败，清理 PID 文件
            fs.unlinkSync(pidFile);
            throw new Error('Redis 进程启动失败，未监听指定端口');
        }
        return pid;
    }

    async function stopRedisProcess(version, suffix) {
        const pid = await getRedisPid(version, suffix);
        if (!pid) throw new Error('未找到运行中的 Redis 进程');
        const running = await isProcessRunning(pid);
        if (!running) {
            // 进程已不存在，清理 PID 文件
            const pidFile = getPidFile(version, suffix);
            if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
            throw new Error('Redis 进程未运行');
        }
        // 使用 taskkill 终止进程
        await execPromise(`taskkill /PID ${pid} /F`);
        const pidFile = getPidFile(version, suffix);
        if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
        logToFile(`Redis ${version} 已停止，PID: ${pid}`);
    }

    // ----- 检测已安装版本 -----
    async function getAllInstalledVersions() {
        const versions = new Set();
        for (const [ver, cfg] of Object.entries(redisVersions)) {
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
        const baseDir = 'C:\\Program Files\\Redis';
        if (fs.existsSync(baseDir)) {
            const dirs = fs.readdirSync(baseDir);
            for (const dir of dirs) {
                const fullPath = path.join(baseDir, dir);
                if (fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, 'redis-server.exe'))) {
                    const match = dir.match(/redis-(\d+\.\d+)/);
                    if (match && redisVersions[match[1]]) versions.add(match[1]);
                }
            }
        }
        return Array.from(versions).sort((a, b) => {
            const order = ['3.2', '4.0', '5.0', '6.0', '6.2', '7.0', '7.2', '7.4', '8.0', '8.2', '8.4', '8.6'];
            return order.indexOf(a) - order.indexOf(b);
        });
    }

    async function findRedisHome(version) {
        const cfg = redisVersions[version];
        if (!cfg) return null;
        const varName = `REDIS_HOME${cfg.suffix}`;
        try {
            const {stdout} = await execPromise(`echo %${varName}%`);
            const home = stdout.trim();
            if (home && fs.existsSync(home)) return home;
        } catch (err) {
        }
        const installDir = `C:\\Program Files\\Redis\\redis-${version}`;
        if (fs.existsSync(installDir) && fs.existsSync(path.join(installDir, 'redis-server.exe'))) return installDir;
        return null;
    }

    async function getCurrentDefaultVersion() {
        try {
            const systemPath = await getSystemPath();
            const match = systemPath.match(/%REDIS_HOME(\d+)%/);
            if (match && match[1]) {
                const suffix = match[1];
                for (const [ver, cfg] of Object.entries(redisVersions)) {
                    if (cfg.suffix === suffix) return ver;
                }
            }
            const {stdout, stderr} = await execPromise('redis-cli --version 2>&1');
            const output = stdout + stderr;
            const verMatch = output.match(/redis-cli (\d+\.\d+\.\d+)/i);
            if (verMatch) {
                const majorMinor = verMatch[1].split('.')[0] + '.' + verMatch[1].split('.')[1];
                if (redisVersions[majorMinor]) return majorMinor;
            }
            return null;
        } catch (err) {
            return null;
        }
    }

    // ----- IPC 处理 -----
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

    ipcMain.handle('install-redis', async (event, version, password = '', maxmemory = 0) => {
        const cfg = redisVersions[version];
        if (!cfg) return {success: false, message: `不支持的 Redis 版本: ${version}`};
        const {url, suffix, defaultPort} = cfg;
        const fileName = url.split('/').pop();
        const installerPath = path.join(downloadDir, fileName);
        const installPath = `C:\\Program Files\\Redis\\redis-${version}`;
        const sendProgress = (progress, stage = '') => {
            mainWindow.webContents.send('redis-progress', {type: 'redis', version, progress, stage});
        };
        const abortController = new AbortController();
        currentAbortController = abortController;
        try {
            if (!fs.existsSync(installerPath)) {
                sendProgress(0, '下载安装包');
                await downloadFile(url, installerPath, (p) => sendProgress(p, '下载安装包'), abortController.signal);
                sendProgress(0.3, '解压中');
            } else {
                sendProgress(0.3, '解压中');
            }
            await installZip(installerPath, installPath);
            sendProgress(0.5, '生成配置');
            const availablePort = await findAvailablePort(defaultPort);
            await generateRedisConf(installPath, availablePort, password, maxmemory);
            sendProgress(0.7, '配置环境变量');
            await setSystemEnvVariable(`REDIS_HOME${suffix}`, installPath);
            await setPathForRedis(suffix);
            await refreshCurrentProcessEnv();
            // 不再安装服务，也不自动启动
            sendProgress(1, '安装完成');
            mainWindow.webContents.send('redis-changed');
            return {success: true, message: `Redis ${version} 安装成功，端口: ${availablePort}`};
        } catch (err) {
            if (err.message === '下载已取消') return {success: false, message: '下载已取消'};
            logToFile(`安装失败: ${err.message}`);
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

    ipcMain.handle('install-from-local-redis', async (event, version, password = '', maxmemory = 0) => {
        if (!pendingLocalFile) return {success: false, message: '没有已导入的 Redis 安装包，请先导入'};
        const cfg = redisVersions[version];
        if (!cfg) return {success: false, message: `不支持的 Redis 版本: ${version}`};
        const {suffix, defaultPort} = cfg;
        const zipPath = pendingLocalFile;
        const installPath = `C:\\Program Files\\Redis\\redis-${version}`;
        const sendProgress = (progress, stage = '') => {
            mainWindow.webContents.send('redis-progress', {type: 'redis', version, progress, stage});
        };
        try {
            sendProgress(0.3, '解压中');
            await installZip(zipPath, installPath);
            sendProgress(0.5, '生成配置');
            const availablePort = await findAvailablePort(defaultPort);
            await generateRedisConf(installPath, availablePort, password, maxmemory);
            sendProgress(0.7, '配置环境变量');
            await setSystemEnvVariable(`REDIS_HOME${suffix}`, installPath);
            await setPathForRedis(suffix);
            await refreshCurrentProcessEnv();
            sendProgress(1, '安装完成');
            mainWindow.webContents.send('redis-changed');
            return {success: true, message: `Redis ${version} 安装成功，端口: ${availablePort}`};
        } catch (err) {
            logToFile(`安装失败: ${err.message}`);
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
            const cfg = redisVersions[version];
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const home = await findRedisHome(version);
            if (!home) return {success: false, message: `未找到 Redis ${version} 的安装目录`};
            await setPathForRedis(cfg.suffix);
            await refreshCurrentProcessEnv();
            mainWindow.webContents.send('redis-changed');
            return {success: true, message: `已切换到 Redis ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('delete-redis', async (event, version) => {
        try {
            const cfg = redisVersions[version];
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const home = await findRedisHome(version);
            if (!home) return {success: false, message: `未找到 Redis ${version} 的安装目录`};
            // 停止进程
            try {
                await stopRedisProcess(version, cfg.suffix);
            } catch (err) {
                // 忽略停止失败（可能未运行）
                logToFile(`停止进程时出错: ${err.message}`);
            }
            const currentDefault = await getCurrentDefaultVersion();
            if (currentDefault === version) {
                const allVersions = await getAllInstalledVersions();
                const other = allVersions.find(v => v !== version);
                if (other) {
                    const otherCfg = redisVersions[other];
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
            // 删除 PID 文件
            const pidFile = getPidFile(version, cfg.suffix);
            if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
            fs.rmSync(home, {recursive: true, force: true});
            mainWindow.webContents.send('redis-changed');
            return {success: true, message: `已删除 Redis ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('start-redis', async (event, version) => {
        try {
            const cfg = redisVersions[version];
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const home = await findRedisHome(version);
            if (!home) return {success: false, message: `未找到 Redis ${version} 的安装目录`};
            const confPath = path.join(home, 'redis.windows.conf');
            if (!fs.existsSync(confPath)) return {success: false, message: '配置文件不存在'};
            // 从配置中读取端口（简单解析）
            let port = cfg.defaultPort;
            const confContent = fs.readFileSync(confPath, 'utf8');
            const portMatch = confContent.match(/^port\s+(\d+)/m);
            if (portMatch) port = parseInt(portMatch[1], 10);
            await startRedisProcess(home, version, cfg.suffix, port, '');
            mainWindow.webContents.send('redis-changed');
            return {success: true, message: `Redis ${version} 已启动`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('stop-redis', async (event, version) => {
        try {
            const cfg = redisVersions[version];
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            await stopRedisProcess(version, cfg.suffix);
            mainWindow.webContents.send('redis-changed');
            return {success: true, message: `Redis ${version} 已停止`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('restart-redis', async (event, version) => {
        try {
            const cfg = redisVersions[version];
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            await stopRedisProcess(version, cfg.suffix);
            const home = await findRedisHome(version);
            if (!home) return {success: false, message: `未找到 Redis ${version} 的安装目录`};
            const confPath = path.join(home, 'redis.windows.conf');
            let port = cfg.defaultPort;
            const confContent = fs.readFileSync(confPath, 'utf8');
            const portMatch = confContent.match(/^port\s+(\d+)/m);
            if (portMatch) port = parseInt(portMatch[1], 10);
            await startRedisProcess(home, version, cfg.suffix, port, '');
            mainWindow.webContents.send('redis-changed');
            return {success: true, message: `Redis ${version} 已重启`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('get-redis-status', async (event, version) => {
        try {
            const cfg = redisVersions[version];
            if (!cfg) return {success: false, status: 'unknown', message: '不支持的版本'};
            const status = await getRedisProcessStatus(version, cfg.suffix);
            return {success: true, status};
        } catch (err) {
            return {success: false, status: 'error', message: err.message};
        }
    });

    ipcMain.handle('change-redis-password', async (event, version, oldPassword, newPassword) => {
        try {
            const cfg = redisVersions[version];
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const home = await findRedisHome(version);
            if (!home) return {success: false, message: `未找到 Redis ${version} 的安装目录`};
            const confPath = path.join(home, 'redis.windows.conf');
            if (!fs.existsSync(confPath)) throw new Error('未找到配置文件 redis.windows.conf');
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
            // 重启进程使配置生效
            await stopRedisProcess(version, cfg.suffix);
            let port = cfg.defaultPort;
            const portMatch = content.match(/^port\s+(\d+)/m);
            if (portMatch) port = parseInt(portMatch[1], 10);
            await startRedisProcess(home, version, cfg.suffix, port, newPassword);
            logToFile(`Redis ${version} 密码修改成功`);
            return {success: true, message: `Redis ${version} 密码已修改，服务已重启`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });
};