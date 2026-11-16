const {ipcMain} = require('electron');
const {spawn, exec} = require('child_process');
const {spawnHidden} = require('../utils/hiddenSpawn.cjs');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const {promisify} = require('util');
const execPromise = promisify(exec);
const configManager = require('../configManager.cjs');
const {downloadFile} = require('../utils/download.cjs');
const {installZip, zipProgress} = require('../utils/zip.cjs');
const {createLogger} = require('../utils/logger.cjs');
const sandbox = require('../utils/sandbox.cjs');
const portUtils = require('../utils/port.cjs');
const servicePorts = require('../utils/servicePorts.cjs');

module.exports = function registerMySQLHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'mysql_install.log');
    const logToFile = createLogger(logFile);

    function getMySQLVersionConfig(version) {
        const cfg = configManager.getToolConfig('mysql', version);
        const defaultPort = version === '5.7' ? 3306 : (version === '8.0' ? 3307 : 3308);
        if (!cfg) {
            // 接管来的版本（比如本机的 9.3）不在下载清单里，但也得能看端口、改密码
            return {defaultPort: 3306, adopted: true, url: null};
        }
        return {...cfg, defaultPort};
    }

    let currentAbortController = null;
    const processes = new Map();

    function readPort(home) {
        const candidates = [path.join(home, 'my.ini')];
        // 官方安装器把 my.ini 放在 C:\ProgramData\MySQL\MySQL Server X.Y\ 下，接管的环境也在那儿
        try {
            const programData = process.env.ProgramData || process.env.PROGRAMDATA || 'C:\\ProgramData';
            const root = path.join(programData, 'MySQL');
            if (fs.existsSync(root)) {
                for (const entry of fs.readdirSync(root)) {
                    const conf = path.join(root, entry, 'my.ini');
                    if (fs.existsSync(conf)) candidates.push(conf);
                }
            }
        } catch (err) {
            // 读不到 ProgramData 就只看安装目录
        }
        for (const confPath of candidates) {
            if (!fs.existsSync(confPath)) continue;
            try {
                const content = fs.readFileSync(confPath, 'utf8');
                const portMatch = content.match(/^\s*port\s*=\s*(\d+)/im);
                if (portMatch) return parseInt(portMatch[1], 10);
            } catch (err) {
                // 换下一个候选
            }
        }
        return null;
    }

    // 找一下「从当前目录启动、但不是我们拉起来的」mysqld（官方安装的 Windows 服务就是这种）
    async function findForeignMysqld(home) {
        const wanted = path.resolve(home).toLowerCase();
        try {
            const {stdout} = await execPromise('tasklist /FI "IMAGENAME eq mysqld.exe" /FO CSV /NH', {
                windowsHide: true,
                timeout: 5000,
            });
            const pids = Array.from(stdout.matchAll(/"mysqld\.exe","(\d+)"/gi)).map((m) => m[1]);
            for (const pid of pids) {
                try {
                    const {stdout: exeOut} = await execPromise(
                        `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Path"`,
                        {windowsHide: true, timeout: 5000}
                    );
                    const exe = String(exeOut || '').trim();
                    if (exe && path.resolve(exe).toLowerCase().startsWith(wanted)) {
                        return {pid: Number(pid), exe};
                    }
                } catch (err) {
                    // 拿不到路径就跳过这个 pid
                }
            }
        } catch (err) {
            // tasklist 跑不了就当没有
        }
        return null;
    }

    function patchMyIniPort(home, port) {
        const confPath = path.join(home, 'my.ini');
        if (!fs.existsSync(confPath)) return false;
        const content = fs.readFileSync(confPath, 'utf8');
        const next = /^\s*port\s*=/im.test(content)
            ? content.replace(/^\s*port\s*=.*$/im, `port=${port}`)
            : `${content.trimEnd()}\nport=${port}\n`;
        fs.writeFileSync(confPath, next, 'utf8');
        logToFile(`端口变更，已更新 ${confPath} -> ${port}`);
        return true;
    }

    async function ensureConfigPort(home, fallbackPort, version) {
        // 端口不再自动顺延：先用用户选定/已配置的端口，不可用就明确报错，让用户改端口。
        const preferred = servicePorts.getPort(userDataPath, 'mysql', version);
        const current = readPort(home) || preferred || fallbackPort;
        const target = preferred || current;
        if (target !== current && patchMyIniPort(home, target)) {
            logToFile(`按用户设置把 MySQL 端口改为 ${target}`);
        }
        if (await portUtils.isPortAvailable(target)) {
            return {port: target, changed: target !== current, original: current};
        }
        throw new Error(
            `端口 ${target} 已被占用：请在版本卡片上点端口改成别的（比如 ${target + 1}），或先关掉占用它的程序。`
        );
    }

    async function generateMyCnf(installDir, port) {
        const myCnfPath = path.join(installDir, 'my.ini');
        const content = `[mysqld]
basedir=${installDir.replace(/\\/g, '\\\\')}
datadir=${installDir.replace(/\\/g, '\\\\')}\\\\data
port=${port}
`;
        fs.writeFileSync(myCnfPath, content, 'utf8');
        logToFile(`生成配置文件: ${myCnfPath}`);
        return myCnfPath;
    }

    async function initializeDataDir(installDir, onTick = null) {
        const mysqldPath = path.join(installDir, 'bin', 'mysqld.exe');
        if (!fs.existsSync(mysqldPath)) throw new Error('未找到 mysqld.exe');
        const initCmd = `"${mysqldPath}" --initialize-insecure --basedir="${installDir}" --datadir="${installDir}\\data"`;
        logToFile(`初始化数据目录: ${initCmd}`);
        const startedAt = Date.now();
        const timer = onTick
            ? setInterval(() => {
                const seconds = Math.round((Date.now() - startedAt) / 1000);
                try {
                    onTick(seconds);
                } catch (err) {
                    /* 忽略 */
                }
            }, 1000)
            : null;
        try {
            await execPromise(initCmd);
        } finally {
            if (timer) clearInterval(timer);
        }
        logToFile(`数据目录初始化完成（root 密码为空），耗时 ${Math.round((Date.now() - startedAt) / 1000)} 秒`);
    }

    async function waitForMySQL(port, timeoutMs = 30000) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const ok = await new Promise((resolve) => {
                const socket = net.connect({port, host: '127.0.0.1'});
                socket.setTimeout(1000);
                socket.once('connect', () => {
                    socket.destroy();
                    resolve(true);
                });
                socket.once('error', () => resolve(false));
                socket.once('timeout', () => {
                    socket.destroy();
                    resolve(false);
                });
            });
            if (ok) return true;
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        return false;
    }

    async function setRootPassword(installDir, password, port) {
        if (!password || password.trim() === '') return;
        logToFile(`准备设置 root 密码，端口: ${port}`);
        const mysqlPath = path.join(installDir, 'bin', 'mysql.exe');
        if (!fs.existsSync(mysqlPath)) throw new Error('未找到 mysql.exe');
        const tmpFile = path.join(os.tmpdir(), `muling_set_root_pwd_${Date.now()}.sql`);
        // 把 SQL 写入临时文件并从 stdin 输入执行，避免密码出现在命令行/进程列表中
        const escaped = String(password).replace(/'/g, "''");
        fs.writeFileSync(tmpFile, `ALTER USER 'root'@'localhost' IDENTIFIED BY '${escaped}'; FLUSH PRIVILEGES;\n`, 'utf8');
        try {
            await execPromise(`"${mysqlPath}" -u root -P ${port} < "${tmpFile}"`);
            logToFile(`root 密码设置成功`);
        } catch (err) {
            logToFile(`SQL 方式设置密码失败: ${err.message}`);
            throw err;
        } finally {
            try { fs.unlinkSync(tmpFile); } catch (e) {}
        }
    }

    // ---- 进程管理（沙箱模式：不再注册 Windows 服务）----
    function getPidPath(installDir) {
        return path.join(installDir, 'mysql.pid');
    }

    async function isMySQLRunning(installDir) {
        const key = installDir;
        const proc = processes.get(key);
        if (proc && !proc.killed && proc.exitCode === null) return true;
        const pidPath = getPidPath(installDir);
        if (!fs.existsSync(pidPath)) return false;
        const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
        if (isNaN(pid)) return false;
        try {
            const {stdout} = await execPromise(`tasklist /FI "PID eq ${pid}" /NH`);
            const running = stdout.includes(String(pid));
            if (!running) {
                try { fs.unlinkSync(pidPath); } catch (e) {}
            }
            return running;
        } catch (err) {
            return false;
        }
    }

    async function startMySQLProcess(installDir) {
        const mysqldPath = path.join(installDir, 'bin', 'mysqld.exe');
        if (!fs.existsSync(mysqldPath)) throw new Error('未找到 mysqld.exe');
        const foreign = await findForeignMysqld(installDir);
        if (foreign) {
            throw new Error(
                `这个 MySQL 已经在跑了（PID ${foreign.pid}，多半是官方安装的 Windows 服务），` +
                '环境盒不会再起第二个。要用环境盒管理，先在「服务」里停掉它；或者不管它，直接用系统里那个。'
            );
        }
        const confPath = path.join(installDir, 'my.ini');
        if (!fs.existsSync(confPath)) throw new Error('未找到 my.ini');
        if (await isMySQLRunning(installDir)) return null;

        const errLog = path.join(installDir, 'mysql-error.log');
        logToFile(`启动 MySQL 进程: "${mysqldPath}" --defaults-file="${confPath}"`);

        // mysqld.exe 拿不到控制台时会自己 AllocConsole()，所以 spawn({windowsHide:true}) 仍会弹黑窗口。
        // 这里用 Start-Process -WindowStyle Hidden 启动，窗口处于 SW_HIDE 状态，服务安静跑在后台。
        let pid = 0;
        try {
            pid = await spawnHidden(mysqldPath, [`--defaults-file=${confPath}`], installDir);
            logToFile(`MySQL 已按隐藏窗口方式启动，PID: ${pid}，日志: ${errLog}`);
        } catch (err) {
            logToFile(`隐藏方式启动失败（${err.message}），回退到普通启动`);
            const fd = fs.openSync(errLog, 'a');
            const fallback = spawn(mysqldPath, [`--defaults-file=${confPath}`], {
                windowsHide: true,
                stdio: ['ignore', fd, fd],
                cwd: installDir
            });
            fs.closeSync(fd);
            fallback.unref();
            fallback.on('exit', (code) => {
                logToFile(`MySQL 进程退出，代码: ${code}`);
                processes.delete(installDir);
                const pidPath = getPidPath(installDir);
                if (fs.existsSync(pidPath)) {
                    try { fs.unlinkSync(pidPath); } catch (e) {}
                }
            });
            processes.set(installDir, fallback);
            pid = fallback.pid;
        }

        fs.writeFileSync(getPidPath(installDir), String(pid), 'utf8');
        const port = readPort(installDir);
        if (port) await waitForMySQL(port, 20000);
        logToFile(`MySQL 进程已启动，PID: ${pid}`);
        return pid;
    }

    async function stopMySQLProcess(installDir) {
        const pidPath = getPidPath(installDir);
        if (!fs.existsSync(pidPath)) {
            processes.delete(installDir);
            return false;
        }
        const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
        if (isNaN(pid)) return false;
        logToFile(`停止 MySQL 进程 PID: ${pid}`);
        try {
            await execPromise(`taskkill /PID ${pid} /T /F`);
        } catch (err) {
            logToFile(`taskkill 失败: ${err.message}`);
        }
        processes.delete(installDir);
        try { fs.unlinkSync(pidPath); } catch (e) {}
        return true;
    }

    function findMySQLHome(version) {
        const hit = sandbox.listInstalled('mysql').find(item => item.version === version);
        if (hit && fs.existsSync(hit.dir)) return hit.dir;
        const dir = sandbox.installDir('mysql', version);
        return fs.existsSync(dir) ? dir : null;
    }

    function getActiveDir() {
        return sandbox.getActiveDir('mysql');
    }

    async function installInto(version, zipPath, password, sendProgress) {
        const cfg = getMySQLVersionConfig(version);
        if (!cfg) return {success: false, message: `不支持的 MySQL 版本: ${version}`};
        const installPath = sandbox.installDir('mysql', version);
        try {
            sendProgress(0.3, '解压中');
            await installZip(zipPath, installPath, {log: logToFile, onProgress: zipProgress(sendProgress, 0.3, 0.39)});
            sendProgress(0.4, '初始化配置');
            const requestedPort = servicePorts.getPort(userDataPath, 'mysql', version) || cfg.defaultPort;
            const portResult = await portUtils.resolvePort(requestedPort, {strict: true, defaultPort: cfg.defaultPort});
            if (portResult.error) return {success: false, message: portResult.error};
            const targetPort = portResult.port;
            await generateMyCnf(installPath, targetPort);
            sendProgress(0.45, '初始化数据目录（首次初始化需要 10~20 秒）');
            await initializeDataDir(installPath, (seconds) => {
                sendProgress(0.45, `初始化数据目录 · 已用 ${seconds}s`);
            });
            sendProgress(0.6, '启动数据库进程');
            await startMySQLProcess(installPath);
            if (password && password.trim() !== '') {
                sendProgress(0.8, '设置 root 密码');
                await setRootPassword(installPath, password, targetPort);
            }
            sendProgress(0.9, '加入沙箱环境');
            sandbox.register('mysql', version, installPath, {activate: true});
            sandbox.setToolPassword('mysql', version, password && password.trim() !== '' ? password : '');
            sendProgress(1, '安装完成');
            setTimeout(() => {
                mainWindow.webContents.send('mysql-changed');
            }, 500);
            return {
                success: true,
                port: targetPort,
                defaultPort: cfg.defaultPort,
                portChanged: portResult.changed,
                message: portResult.changed
                    ? `MySQL ${version} 安装成功，端口 ${cfg.defaultPort} 被占用，已自动改用 ${targetPort}`
                    : `MySQL ${version} 安装成功，端口: ${targetPort}`,
            };
        } catch (err) {
            logToFile(`安装失败: ${err.message}`);
            return {success: false, message: `安装失败: ${err.message}`};
        }
    }

    ipcMain.on('cancel-mysql-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    ipcMain.handle('install-mysql', async (event, version, password = '') => {
        const cfg = getMySQLVersionConfig(version);
        if (!cfg) return {success: false, message: `不支持的 MySQL 版本: ${version}`};

        const {url} = cfg;
        const fileName = url.split('/').pop().split('?')[0];
        const installerPath = path.join(downloadDir, fileName);
        const sendProgress = (progress, stage = '', meta = {}) => {
            setImmediate(() => {
                mainWindow.webContents.send('mysql-progress', {
                    type: 'mysql',
                    version,
                    progress,
                    stage,
                    speed: meta.speed || 0,
                    eta: typeof meta.eta === 'number' ? meta.eta : null,
                    received: meta.received || 0,
                    total: meta.total || null,
                });
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
                    label: 'MySQL下载',
                    timeout: 600000,
                });
                sendProgress(0.3, '解压中');
            }
            return await installInto(version, installerPath, password, sendProgress);
        } catch (err) {
            if (err.message === '下载已取消') return {success: false, message: '下载已取消'};
            logToFile(`安装失败: ${err.message}`);
            return {success: false, message: `安装失败: ${err.message}`};
        } finally {
            if (currentAbortController === abortController) currentAbortController = null;
            if (fs.existsSync(installerPath)) {
                try { fs.unlinkSync(installerPath); } catch (e) {}
            }
        }
    });

    ipcMain.handle('check-mysql', async () => {
        try {
            const items = sandbox.listInstalled('mysql');
            return {
                versions: items.map(item => item.version),
                default: sandbox.getActive('mysql'),
                items
            };
        } catch (err) {
            return {versions: [], default: null, items: []};
        }
    });

    ipcMain.handle('switch-mysql', async (event, version) => {
        try {
            const home = findMySQLHome(version);
            if (!home) return {success: false, message: `未找到 MySQL ${version} 的安装目录`};
            const current = getActiveDir();
            if (current && current !== home) {
                await stopMySQLProcess(current);
            }
            sandbox.setActive('mysql', version);
            const cfg = getMySQLVersionConfig(version);
            const portInfo = await ensureConfigPort(home, cfg ? cfg.defaultPort : 3306, version);
            await startMySQLProcess(home);
            mainWindow.webContents.send('mysql-changed');
            return {
                success: true,
                port: portInfo.port,
                defaultPort: portInfo.original,
                portChanged: portInfo.changed,
                message: portInfo.changed
                    ? `已切换到 MySQL ${version}，端口 ${portInfo.original} 被占用，改用 ${portInfo.port}`
                    : `已切换到 MySQL ${version}`,
            };
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('delete-mysql', async (event, version) => {
        try {
            const home = findMySQLHome(version);
            if (!home) return {success: false, message: `未找到 MySQL ${version} 的安装目录`};
            await stopMySQLProcess(home);
            const removal = sandbox.removeDirIfSandboxed(home);
            sandbox.unregister('mysql', version);
            mainWindow.webContents.send('mysql-changed');
            if (!removal.sandboxed) {
                return {success: true, message: `已解除 MySQL ${version} 的登记，文件仍保留在 ${removal.dir}`};
            }
            return {success: true, message: `已删除 MySQL ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('start-mysql-service', async (event, version) => {
        try {
            const home = findMySQLHome(version);
            if (!home) return {success: false, message: `未找到 MySQL ${version} 的安装目录`};
            if (await isMySQLRunning(home)) return {success: false, message: `MySQL ${version} 已经在运行`};
            const cfg = getMySQLVersionConfig(version);
            const portInfo = await ensureConfigPort(home, cfg ? cfg.defaultPort : 3306, version);
            await startMySQLProcess(home);
            sandbox.setActive('mysql', version);
            return {
                success: true,
                port: portInfo.port,
                defaultPort: portInfo.original,
                portChanged: portInfo.changed,
                message: portInfo.changed
                    ? `端口 ${portInfo.original} 被占用，已自动改用 ${portInfo.port} 启动`
                    : `MySQL ${version} 已启动，端口: ${portInfo.port}`,
            };
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('stop-mysql-service', async (event, version) => {
        try {
            const home = findMySQLHome(version);
            if (!home) return {success: false, message: `未找到 MySQL ${version} 的安装目录`};
            const stopped = await stopMySQLProcess(home);
            if (!stopped) {
                const foreign = await findForeignMysqld(home);
                if (foreign) {
                    return {
                        success: false,
                        message: `这个 MySQL 是系统服务在跑（PID ${foreign.pid}），请到「服务」里停它，环境盒不替你停别人的服务`,
                    };
                }
                return {success: false, message: `MySQL ${version} 未在运行`};
            }
            return {success: true, message: `MySQL ${version} 已停止`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('restart-mysql-service', async (event, version) => {
        try {
            const home = findMySQLHome(version);
            if (!home) return {success: false, message: `未找到 MySQL ${version} 的安装目录`};
            await stopMySQLProcess(home);
            await new Promise(resolve => setTimeout(resolve, 800));
            const cfg = getMySQLVersionConfig(version);
            const portInfo = await ensureConfigPort(home, cfg ? cfg.defaultPort : 3306, version);
            await startMySQLProcess(home);
            sandbox.setActive('mysql', version);
            return {
                success: true,
                port: portInfo.port,
                defaultPort: portInfo.original,
                portChanged: portInfo.changed,
                message: portInfo.changed
                    ? `端口 ${portInfo.original} 被占用，已自动改用 ${portInfo.port} 重启`
                    : `MySQL ${version} 已重启，端口: ${portInfo.port}`,
            };
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('get-mysql-service-status', async (event, version) => {
        try {
            const home = findMySQLHome(version);
            if (!home) return {success: true, status: 'unknown'};
            const running = await isMySQLRunning(home);
            if (running) return {success: true, status: 'running'};
            const foreign = await findForeignMysqld(home);
            if (foreign) return {success: true, status: 'running', external: true, pid: foreign.pid};
            return {success: true, status: 'stopped'};
        } catch (err) {
            logToFile(`get-mysql-service-status 异常: ${err.message}`);
            return {success: false, status: 'error', message: err.message};
        }
    });

    ipcMain.handle('change-mysql-password', async (event, version, oldPassword, newPassword) => {
        try {
            const home = findMySQLHome(version);
            if (!home) return {success: false, message: `未找到 MySQL ${version} 的安装目录`};
            if (!(await isMySQLRunning(home))) {
                return {success: false, message: `MySQL ${version} 未在运行，请先启动后再改密码`};
            }
            const mysqlPath = path.join(home, 'bin', 'mysql.exe');
            if (!fs.existsSync(mysqlPath)) return {success: false, message: `未找到 MySQL ${version} 的 mysql.exe`};
            const port = readPort(home) || 3306;
            // 新密码写入临时 SQL 文件、旧密码通过 MYSQL_PWD 环境变量认证——均不暴露在命令行/进程列表
            const tmpFile = path.join(os.tmpdir(), `muling_change_pwd_${Date.now()}.sql`);
            const escaped = String(newPassword).replace(/'/g, "''");
            fs.writeFileSync(tmpFile, `ALTER USER 'root'@'localhost' IDENTIFIED BY '${escaped}'; FLUSH PRIVILEGES;\n`, 'utf8');
            const env = {...process.env};
            if (oldPassword && oldPassword !== '') env.MYSQL_PWD = String(oldPassword);
            try {
                await execPromise(`"${mysqlPath}" -u root -P ${port} < "${tmpFile}"`, {env});
            } finally {
                try { fs.unlinkSync(tmpFile); } catch (e) {}
            }
            logToFile(`MySQL ${version} 密码修改成功`);
            sandbox.setToolPassword('mysql', version, newPassword);
            return {success: true, message: `MySQL ${version} root 密码已修改`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('get-mysql-password', async (event, version) => {
        try {
            const home = findMySQLHome(version);
            const saved = sandbox.getToolPassword('mysql', version);
            return {success: true, password: saved, installed: Boolean(home)};
        } catch (err) {
            return {success: false, message: err.message, password: null};
        }
    });

    ipcMain.handle('get-mysql-config', async (event, version) => {
        const cfg = getMySQLVersionConfig(version);
        if (!cfg) return {success: false, message: '不支持的版本'};
        const home = findMySQLHome(version);
        if (!home) return {success: false, message: '未找到安装目录'};

        const configured = servicePorts.getPort(userDataPath, 'mysql', version);
        const port = readPort(home) || configured || cfg.defaultPort;
        const owned = await isMySQLRunning(home);
        const foreign = owned ? null : await findForeignMysqld(home);
        const running = owned || Boolean(foreign);
        let hasPassword = null;
        if (running) {
            const mysqlPath = path.join(home, 'bin', 'mysql.exe');
            if (fs.existsSync(mysqlPath)) {
                try {
                    await execPromise(`"${mysqlPath}" -u root -P ${port} -e "exit"`, {timeout: 5000});
                    hasPassword = false;
                } catch (err) {
                    hasPassword = true;
                }
            }
        }

        return {success: true, port, hasPassword, running, external: Boolean(foreign), adopted: Boolean(cfg.adopted)};
    });
};
