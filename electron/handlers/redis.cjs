const {ipcMain} = require('electron');
const {spawn, exec} = require('child_process');
const path = require('path');
const fs = require('fs');
const {promisify} = require('util');
const execPromise = promisify(exec);
const configManager = require('../configManager.cjs');
const {createLogger} = require('../utils/logger.cjs');
const {downloadFile} = require('../utils/download.cjs');
const {installZip, zipProgress} = require('../utils/zip.cjs');
const sandbox = require('../utils/sandbox.cjs');
const portUtils = require('../utils/port.cjs');
const servicePorts = require('../utils/servicePorts.cjs');

module.exports = function registerRedisHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'redis_install.log');
    const logToFile = createLogger(logFile);

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

    let currentAbortController = null;
    const processes = new Map();

    async function isPortInUse(port) {
        return portUtils.isPortInUse(port);
    }

    async function findAvailablePort(defaultPort) {
        const found = await portUtils.findAvailablePort(defaultPort);
        return found === null ? defaultPort : found;
    }

    async function resolvePort(customPort, defaultPort, version) {
        // 端口固定：显式传入的优先，其次是用户在卡片上选的，最后才是版本默认端口；被占用就报错不顺延。
        const preferred = servicePorts.getPort(userDataPath, 'redis', version) || defaultPort;
        const requested = customPort && !isNaN(customPort) ? Number(customPort) : preferred;
        return portUtils.resolvePort(requested, {strict: true, defaultPort: preferred});
    }

    function readConfPort(installDir) {
        const confPath = path.join(installDir, 'redis.windows.conf');
        if (!fs.existsSync(confPath)) return null;
        const content = fs.readFileSync(confPath, 'utf8');
        const match = content.match(/^\s*port\s+(\d+)\s*$/im);
        return match ? parseInt(match[1], 10) : null;
    }

    function patchConfPort(installDir, port) {
        const confPath = path.join(installDir, 'redis.windows.conf');
        if (!fs.existsSync(confPath)) return false;
        const content = fs.readFileSync(confPath, 'utf8');
        const next = /^\s*port\s+/im.test(content)
            ? content.replace(/^\s*port\s+\d+\s*$/im, `port ${port}`)
            : `port ${port}\n${content}`;
        fs.writeFileSync(confPath, next, 'utf8');
        logToFile(`端口变更，已更新 ${confPath} -> ${port}`);
        return true;
    }

    async function ensureConfigPort(installDir, fallbackPort, version) {
        // 与 MySQL 一致：不再自动顺延，端口被占用就报错让用户改。
        const preferred = servicePorts.getPort(userDataPath, 'redis', version);
        const current = readConfPort(installDir) || preferred || fallbackPort;
        const target = preferred || current;
        if (target !== current && patchConfPort(installDir, target)) {
            logToFile(`按用户设置把 Redis 端口改为 ${target}`);
        }
        if (await portUtils.isPortAvailable(target)) {
            return {port: target, changed: target !== current, original: current};
        }
        throw new Error(
            `端口 ${target} 已被占用：请在版本卡片上点端口改成别的（比如 ${target + 1}），或先关掉占用它的程序。`
        );
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
            // 同 mysql：不能用 detached，否则 DETACHED_PROCESS 会盖掉 windowsHide，弹出控制台窗口
            windowsHide: true,
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
            const pidPath = path.join(installDir, 'redis.pid');
            if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
        });
        processes.set(versionKey, proc);
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
                process.kill(proc.pid, 'SIGTERM');
                await new Promise((resolve) => {
                    proc.once('exit', resolve);
                    setTimeout(resolve, 3000);
                });
                if (!proc.killed) {
                    exec(`taskkill /PID ${proc.pid} /F`, {windowsHide: true}, (err) => {
                        if (err) logToFile(`强制终止失败: ${err.message}`);
                        else logToFile(`Redis ${versionKey} 进程已强制终止`);
                    });
                } else {
                    logToFile(`Redis ${versionKey} 进程已优雅终止`);
                }
            } catch (err) {
                logToFile(`终止 Redis ${versionKey} 进程时出错: ${err.message}`);
                exec(`taskkill /PID ${proc.pid} /F`, {windowsHide: true}, (err2) => {
                    if (err2) logToFile(`taskkill 失败: ${err2.message}`);
                    else logToFile(`Redis ${versionKey} 进程已终止`);
                });
            }
            processes.delete(versionKey);
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
        return false;
    }

    function findRedisHome(version) {
        const hit = sandbox.listInstalled('redis').find(item => item.version === version);
        if (hit && fs.existsSync(hit.dir)) return hit.dir;
        const dir = sandbox.installDir('redis', version);
        return fs.existsSync(dir) ? dir : null;
    }

    async function installInto(version, zipPath, password, maxmemory, customPort, sendProgress) {
        const cfg = getRedisVersionConfig(version);
        if (!cfg) return {success: false, message: `不支持的 Redis 版本: ${version}`};
        const {defaultPort} = cfg;

        const portResult = await resolvePort(customPort, defaultPort, version);
        if (portResult.error) return {success: false, message: portResult.error};
        const targetPort = portResult.port;

        // 沙箱模式：统一装到 %LOCALAPPDATA%\Muling\env\redis\redis-<version>
        const installPath = sandbox.installDir('redis', version);

        sendProgress(0.3, '解压中');
        await installZip(zipPath, installPath, {onProgress: zipProgress(sendProgress, 0.3, 0.48)});
        sendProgress(0.5, '生成配置');
        await generateRedisConf(installPath, targetPort, password, maxmemory);
        sendProgress(0.9, '加入沙箱环境');
        sandbox.register('redis', version, installPath, {activate: true});
        sendProgress(1, '安装完成');
        mainWindow.webContents.send('redis-changed');
        return {
            success: true,
            port: targetPort,
            defaultPort,
            portChanged: portResult.changed,
            message: portResult.changed
                ? `Redis ${version} 安装成功，端口 ${defaultPort} 被占用，已自动改用 ${targetPort}`
                : `Redis ${version} 安装成功，端口: ${targetPort}`,
        };
    }

    ipcMain.on('cancel-redis-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    ipcMain.handle('check-port', async (event, port) => {
        const inUse = await isPortInUse(port);
        return {success: true, available: !inUse};
    });

    ipcMain.handle('install-redis', async (event, version, password = '', maxmemory = 0, customPort = null) => {
        const cfg = getRedisVersionConfig(version);
        if (!cfg) return {success: false, message: `不支持的 Redis 版本: ${version}`};

        const {url} = cfg;
        const fileName = url.split('/').pop().split('?')[0];
        const installerPath = path.join(downloadDir, fileName);
        const sendProgress = (progress, stage = '', meta = {}) => {
            mainWindow.webContents.send('redis-progress', {
                type: 'redis',
                version,
                progress,
                stage,
                speed: meta.speed || 0,
                eta: typeof meta.eta === 'number' ? meta.eta : null,
                received: meta.received || 0,
                total: meta.total || null,
            });
        };
        const abortController = new AbortController();
        currentAbortController = abortController;
        try {
            if (!fs.existsSync(installerPath)) {
                sendProgress(0, '下载安装包');
                await downloadFile({
                    url,
                    destPath: installerPath,
                    signal: abortController.signal,
                    onProgress: (info) => sendProgress((info.percent ?? 0) * 0.3, info.retrying ? `网络中断，正在重试（${info.attempt}/3）` : '下载安装包', info),
                    log: logToFile,
                    label: `Redis ${version} 下载`,
                    timeout: 600000,
                });
            }
            return await installInto(version, installerPath, password, maxmemory, customPort, sendProgress);
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

    ipcMain.handle('check-redis', async () => {
        try {
            const items = sandbox.listInstalled('redis');
            return {
                versions: items.map(item => item.version),
                default: sandbox.getActive('redis'),
                items
            };
        } catch (err) {
            return {versions: [], default: null, items: []};
        }
    });

    ipcMain.handle('switch-redis', async (event, version) => {
        try {
            const cfg = getRedisVersionConfig(version);
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const home = findRedisHome(version);
            if (!home) return {success: false, message: `未找到 Redis ${version} 的安装目录`};
            const currentDefault = sandbox.getActive('redis');
            if (currentDefault && currentDefault !== version) {
                await stopRedisProcess(currentDefault);
            }
            sandbox.setActive('redis', version);
            await startRedisProcess(home, path.join(home, 'redis.windows.conf'), version);
            mainWindow.webContents.send('redis-changed');
            return {success: true, message: `已切换到 Redis ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('delete-redis', async (event, version) => {
        try {
            const home = findRedisHome(version);
            if (!home) return {success: false, message: `未找到 Redis ${version} 的安装目录`};
            await stopRedisProcess(version);
            const removal = sandbox.removeDirIfSandboxed(home);
            sandbox.unregister('redis', version);
            mainWindow.webContents.send('redis-changed');
            if (!removal.sandboxed) {
                return {success: true, message: `已解除 Redis ${version} 的登记，文件仍保留在 ${removal.dir}`};
            }
            return {success: true, message: `已删除 Redis ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('start-redis-service', async (event, version) => {
        try {
            logToFile(`收到启动 Redis ${version} 的请求`);
            const home = findRedisHome(version);
            if (!home) return {success: false, message: `未找到 Redis ${version} 的安装目录`};
            const confPath = path.join(home, 'redis.windows.conf');
            if (!fs.existsSync(confPath)) throw new Error('未找到配置文件');
            const running = await isRedisRunning(version, home);
            if (running) return {success: false, message: `Redis ${version} 已经在运行`};
            const cfg = getRedisVersionConfig(version);
            const portInfo = await ensureConfigPort(home, cfg ? cfg.defaultPort : 6379, version);
            await startRedisProcess(home, confPath, version);
            sandbox.setActive('redis', version);
            mainWindow.webContents.send('redis-changed');
            return {
                success: true,
                port: portInfo.port,
                defaultPort: portInfo.original,
                portChanged: portInfo.changed,
                message: portInfo.changed
                    ? `端口 ${portInfo.original} 被占用，已自动改用 ${portInfo.port} 启动 Redis ${version}`
                    : `Redis ${version} 已启动并设为默认，端口: ${portInfo.port}`,
            };
        } catch (err) {
            logToFile(`启动 Redis ${version} 时出错: ${err.message}`);
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('stop-redis-service', async (event, version) => {
        try {
            logToFile(`收到停止 Redis ${version} 的请求`);
            const home = findRedisHome(version);
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
            const home = findRedisHome(version);
            if (!home) return {success: false, message: `未找到 Redis ${version} 的安装目录`};
            const confPath = path.join(home, 'redis.windows.conf');
            if (!fs.existsSync(confPath)) throw new Error('未找到配置文件');
            await stopRedisProcess(version);
            await new Promise(resolve => setTimeout(resolve, 1000));
            const cfg = getRedisVersionConfig(version);
            const portInfo = await ensureConfigPort(home, cfg ? cfg.defaultPort : 6379, version);
            await startRedisProcess(home, confPath, version);
            sandbox.setActive('redis', version);
            mainWindow.webContents.send('redis-changed');
            return {
                success: true,
                port: portInfo.port,
                defaultPort: portInfo.original,
                portChanged: portInfo.changed,
                message: portInfo.changed
                    ? `端口 ${portInfo.original} 被占用，已自动改用 ${portInfo.port} 重启 Redis ${version}`
                    : `Redis ${version} 已重启并设为默认，端口: ${portInfo.port}`,
            };
        } catch (err) {
            logToFile(`重启 Redis ${version} 时出错: ${err.message}`);
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('get-redis-service-status', async (event, version) => {
        try {
            const home = findRedisHome(version);
            const running = await isRedisRunning(version, home);
            return {success: true, status: running ? 'running' : 'stopped'};
        } catch (err) {
            return {success: false, status: 'error', message: err.message};
        }
    });

    ipcMain.handle('get-redis-config', async (event, version) => {
        try {
            const home = findRedisHome(version);
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

    ipcMain.handle('get-redis-password', async (event, version) => {
        try {
            const home = findRedisHome(version);
            if (!home) return {success: false, message: '未找到安装目录'};
            const confPath = path.join(home, 'redis.windows.conf');
            if (!fs.existsSync(confPath)) return {success: false, message: '配置文件不存在'};
            const content = fs.readFileSync(confPath, 'utf8');
            const match = content.match(/^requirepass\s+(.+)$/m);
            return {success: true, password: match ? match[1].trim() : '', installed: true};
        } catch (err) {
            logToFile(`读取 Redis ${version} 密码失败: ${err.message}`);
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('change-redis-password', async (event, version, oldPassword, newPassword) => {
        try {
            const home = findRedisHome(version);
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
            sandbox.setActive('redis', version);
            mainWindow.webContents.send('redis-changed');
            logToFile(`Redis ${version} 密码修改成功`);
            return {success: true, message: `Redis ${version} 密码已修改，服务已重启并设为默认`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });
};
