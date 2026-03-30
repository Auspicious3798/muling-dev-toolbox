const {ipcMain, spawn} = require('electron');
const path = require('path');
const fs = require('fs');
const {exec} = require('child_process');
const axios = require('axios');
const AdmZip = require('adm-zip');
const {promisify} = require('util');
const execPromise = promisify(exec);

const mysqlVersions = {
    '5.7': {
        suffix: '57',
        defaultPort: 3306,
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v3.0.0/mysql-5.7.zip'
    },
    '8.0': {
        suffix: '80',
        defaultPort: 3307,
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v3.0.0/mysql-8.0.zip'
    },
    '9.0': {
        suffix: '90',
        defaultPort: 3308,
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v3.0.0/mysql-9.0.zip'
    }
};

module.exports = function registerMySQLHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'mysql_install.log');

    function logToFile(message) {
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
    }

    let currentAbortController = null;
    let pendingLocalFile = null;

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
            if (onProgress && totalLength) {
                onProgress(downloaded / totalLength);
            }
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

    function setPathForMySQL(suffix) {
        return new Promise(async (resolve, reject) => {
            const targetVar = `MYSQL_HOME${suffix}`;
            const targetEntry = `%${targetVar}%\\bin`;

            const currentPath = await getSystemPath();
            const parts = currentPath.split(';');
            const newParts = [];
            for (const p of parts) {
                if (!/^%MYSQL_HOME\d+%\\bin$/i.test(p)) {
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
            let expanded = systemPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
            process.env.Path = expanded;
        } catch (err) {
            logToFile(`刷新环境变量失败: ${err.message}`);
        }
    }

    async function findAvailablePort(defaultPort) {
        return new Promise((resolve) => {
            const netstatCmd = `netstat -ano | findstr :${defaultPort}`;
            exec(netstatCmd, {windowsHide: true}, (error, stdout) => {
                if (error || !stdout.trim()) {
                    resolve(defaultPort);
                } else {
                    let port = defaultPort + 1;
                    const tryPort = (p) => {
                        exec(`netstat -ano | findstr :${p}`, {windowsHide: true}, (err, out) => {
                            if (err || !out.trim()) {
                                resolve(p);
                            } else {
                                tryPort(p + 1);
                            }
                        });
                    };
                    tryPort(port);
                }
            });
        });
    }

    async function generateMyCnf(installDir, port, suffix) {
        const myCnfPath = path.join(installDir, 'my.ini');
        const content = `[mysqld]\nbasedir=${installDir.replace(/\\/g, '\\\\')}\ndatadir=${installDir.replace(/\\/g, '\\\\')}\\\\data\nport=${port}\n`;
        fs.writeFileSync(myCnfPath, content, 'utf8');
        logToFile(`生成配置文件: ${myCnfPath}`);
        return myCnfPath;
    }

    async function initializeDataDir(installDir, password) {
        const mysqldPath = path.join(installDir, 'bin', 'mysqld.exe');
        if (!fs.existsSync(mysqldPath)) throw new Error('未找到 mysqld.exe');
        const initCmd = `"${mysqldPath}" --initialize-insecure --basedir="${installDir}" --datadir="${installDir}\\data"`;
        logToFile(`初始化数据目录: ${initCmd}`);
        await execPromise(initCmd);
        logToFile(`数据目录初始化完成`);
        if (password && password !== '') {
            const tempPort = 33060;
            const myCnfTemp = path.join(installDir, 'my-temp.ini');
            const tempContent = `[mysqld]\nbasedir=${installDir.replace(/\\/g, '\\\\')}\ndatadir=${installDir.replace(/\\/g, '\\\\')}\\\\data\nport=${tempPort}\n`;
            fs.writeFileSync(myCnfTemp, tempContent, 'utf8');
            const startCmd = `"${mysqldPath}" --defaults-file="${myCnfTemp}" --console`;
            const proc = spawn(startCmd, {shell: true, detached: true});
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const updateCmd = `"${path.join(installDir, 'bin', 'mysqladmin.exe')}" -u root -h 127.0.0.1 -P ${tempPort} password "${password}"`;
            try {
                await execPromise(updateCmd);
                logToFile(`初始密码设置成功`);
            } catch (err) {
                logToFile(`设置密码失败: ${err.message}`);
            }
            exec(`taskkill /F /IM mysqld.exe`, {windowsHide: true}, () => {
            });
            fs.unlinkSync(myCnfTemp);
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }

    async function installService(installDir, suffix) {
        const mysqldPath = path.join(installDir, 'bin', 'mysqld.exe');
        const serviceName = `MySQL${suffix}`;
        const installCmd = `"${mysqldPath}" --install ${serviceName} --defaults-file="${path.join(installDir, 'my.ini')}"`;
        logToFile(`安装服务: ${installCmd}`);
        await execPromise(installCmd);
        logToFile(`服务 ${serviceName} 安装成功`);
        return serviceName;
    }

    async function startService(serviceName) {
        const startCmd = `net start ${serviceName}`;
        logToFile(`启动服务: ${startCmd}`);
        await execPromise(startCmd);
        logToFile(`服务 ${serviceName} 启动成功`);
    }

    async function stopService(serviceName) {
        const stopCmd = `net stop ${serviceName}`;
        logToFile(`停止服务: ${stopCmd}`);
        await execPromise(stopCmd);
        logToFile(`服务 ${serviceName} 停止成功`);
    }

    async function deleteService(serviceName) {
        const deleteCmd = `sc delete ${serviceName}`;
        logToFile(`删除服务: ${deleteCmd}`);
        await execPromise(deleteCmd);
        logToFile(`服务 ${serviceName} 删除成功`);
    }

    async function getServiceStatus(serviceName) {
        try {
            const {stdout} = await execPromise(`sc query ${serviceName}`);
            if (stdout.includes('RUNNING')) return 'running';
            if (stdout.includes('STOPPED')) return 'stopped';
            return 'unknown';
        } catch (err) {
            return 'not installed';
        }
    }

    async function scanMsiMySQLInstallations() {
        const results = [];
        const baseDirs = [
            'C:\\Program Files\\MySQL',
            'C:\\Program Files (x86)\\MySQL'
        ];
        for (const base of baseDirs) {
            if (!fs.existsSync(base)) continue;
            const entries = fs.readdirSync(base);
            for (const entry of entries) {
                const fullPath = path.join(base, entry);
                if (!fs.statSync(fullPath).isDirectory()) continue;
                let version = null;
                const match = entry.match(/^MySQL\s+Server\s+(\d+\.\d+)$/i);
                if (match) {
                    version = match[1];
                } else {
                    const oldMatch = entry.match(/mysql-(\d+\.\d+)/);
                    if (oldMatch) version = oldMatch[1];
                }
                if (version) {
                    const majorVersion = version.split('.')[0];
                    let mappedVersion = null;
                    if (majorVersion === '5') mappedVersion = '5.7';
                    else if (majorVersion === '8') mappedVersion = '8.0';
                    else if (majorVersion === '9') mappedVersion = '9.0';
                    if (mappedVersion) {
                        const mysqldPath = path.join(fullPath, 'bin', 'mysqld.exe');
                        if (fs.existsSync(mysqldPath)) {
                            results.push({version: mappedVersion, path: fullPath});
                        }
                    }
                }
            }
        }
        return results;
    }

    async function getAllInstalledVersions() {
        const versions = new Set();
        for (const [ver, cfg] of Object.entries(mysqlVersions)) {
            const varName = `MYSQL_HOME${cfg.suffix}`;
            try {
                const {stdout} = await execPromise(`echo %${varName}%`);
                const home = stdout.trim();
                if (home && fs.existsSync(home) && fs.existsSync(path.join(home, 'bin', 'mysqld.exe'))) {
                    versions.add(ver);
                }
            } catch (err) {
            }
        }
        const baseDir = 'C:\\Program Files\\MySQL';
        if (fs.existsSync(baseDir)) {
            const dirs = fs.readdirSync(baseDir);
            for (const dir of dirs) {
                const fullPath = path.join(baseDir, dir);
                if (fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, 'bin', 'mysqld.exe'))) {
                    const match = dir.match(/mysql-(\d+\.\d+)/);
                    if (match) {
                        const majorVersion = match[1].split('.')[0];
                        let mappedVersion = null;
                        if (majorVersion === '5') mappedVersion = '5.7';
                        else if (majorVersion === '8') mappedVersion = '8.0';
                        else if (majorVersion === '9') mappedVersion = '9.0';
                        if (mappedVersion) versions.add(mappedVersion);
                    }
                }
            }
        }
        const msiInstallations = await scanMsiMySQLInstallations();
        for (const {version} of msiInstallations) {
            versions.add(version);
        }
        const services = ['MySQL57', 'MySQL80', 'MySQL90', 'MySQL', 'MySQL5.7', 'MySQL8.0', 'MySQL9.0'];
        for (const svc of services) {
            try {
                const {stdout} = await execPromise(`sc query ${svc}`);
                if (stdout.includes('RUNNING') || stdout.includes('STOPPED')) {
                    if (svc.includes('57') || svc.includes('5.7')) versions.add('5.7');
                    if (svc.includes('80') || svc.includes('8.0')) versions.add('8.0');
                    if (svc.includes('90') || svc.includes('9.0')) versions.add('9.0');
                }
            } catch (err) {
            }
        }
        return Array.from(versions).sort((a, b) => {
            const order = ['5.7', '8.0', '9.0'];
            return order.indexOf(a) - order.indexOf(b);
        });
    }

    async function findMySQLHome(version) {
        const cfg = mysqlVersions[version];
        if (!cfg) return null;
        const varName = `MYSQL_HOME${cfg.suffix}`;
        try {
            const {stdout} = await execPromise(`echo %${varName}%`);
            const home = stdout.trim();
            if (home && fs.existsSync(home)) return home;
        } catch (err) {
        }
        const installDir = `C:\\Program Files\\MySQL\\mysql-${version}`;
        if (fs.existsSync(installDir) && fs.existsSync(path.join(installDir, 'bin', 'mysqld.exe'))) {
            return installDir;
        }
        const msiInstallations = await scanMsiMySQLInstallations();
        for (const {version: ver, path: p} of msiInstallations) {
            if (ver === version) return p;
        }
        return null;
    }

    async function getCurrentDefaultVersion() {
        try {
            const systemPath = await getSystemPath();
            const match = systemPath.match(/%MYSQL_HOME(\d+)%\\bin/);
            if (match && match[1]) {
                const suffix = match[1];
                for (const [ver, cfg] of Object.entries(mysqlVersions)) {
                    if (cfg.suffix === suffix) return ver;
                }
            }
            const {stdout, stderr} = await execPromise('mysql --version 2>&1');
            const output = stdout + stderr;
            const verMatch = output.match(/Distrib\s+(\d+\.\d+)\./i);
            if (verMatch && verMatch[1]) {
                const majorMinor = verMatch[1];
                const major = majorMinor.split('.')[0];
                if (major === '5') return '5.7';
                if (major === '8') return '8.0';
                if (major === '9') return '9.0';
            }
            return null;
        } catch (err) {
            return null;
        }
    }

    ipcMain.on('cancel-mysql-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    ipcMain.handle('import-local-mysql', async (event, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.zip') return {success: false, message: '只支持 .zip 文件'};
        const fileName = path.basename(filePath);
        const destPath = path.join(downloadDir, fileName);
        fs.copyFileSync(filePath, destPath);
        pendingLocalFile = destPath;
        return {success: true, message: 'MySQL 安装包已导入，请选择版本后点击“开始安装”'};
    });

    ipcMain.handle('install-mysql', async (event, version, password = '') => {
        const cfg = mysqlVersions[version];
        if (!cfg) return {success: false, message: `不支持的 MySQL 版本: ${version}`};
        const {url, suffix, defaultPort} = cfg;
        const fileName = url.split('/').pop();
        const installerPath = path.join(downloadDir, fileName);
        const installPath = `C:\\Program Files\\MySQL\\mysql-${version}`;
        const sendProgress = (progress, stage = '') => {
            mainWindow.webContents.send('mysql-progress', {type: 'mysql', version, progress, stage});
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
            sendProgress(0.5, '初始化配置');
            const availablePort = await findAvailablePort(defaultPort);
            await generateMyCnf(installPath, availablePort, suffix);
            await initializeDataDir(installPath, password);
            sendProgress(0.7, '安装服务');
            const serviceName = await installService(installPath, suffix);
            await startService(serviceName);
            sendProgress(0.9, '配置环境变量');
            await setSystemEnvVariable(`MYSQL_HOME${suffix}`, installPath);
            await setPathForMySQL(suffix);
            await refreshCurrentProcessEnv();
            sendProgress(1, '安装完成');
            mainWindow.webContents.send('mysql-changed');
            return {success: true, message: `MySQL ${version} 安装成功，端口: ${availablePort}`};
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

    ipcMain.handle('install-from-local-mysql', async (event, version, password = '') => {
        if (!pendingLocalFile) return {success: false, message: '没有已导入的 MySQL 安装包，请先导入'};
        const cfg = mysqlVersions[version];
        if (!cfg) return {success: false, message: `不支持的 MySQL 版本: ${version}`};
        const {suffix, defaultPort} = cfg;
        const zipPath = pendingLocalFile;
        const installPath = `C:\\Program Files\\MySQL\\mysql-${version}`;
        const sendProgress = (progress, stage = '') => {
            mainWindow.webContents.send('mysql-progress', {type: 'mysql', version, progress, stage});
        };
        try {
            sendProgress(0.3, '解压中');
            await installZip(zipPath, installPath);
            sendProgress(0.5, '初始化配置');
            const availablePort = await findAvailablePort(defaultPort);
            await generateMyCnf(installPath, availablePort, suffix);
            await initializeDataDir(installPath, password);
            sendProgress(0.7, '安装服务');
            const serviceName = await installService(installPath, suffix);
            await startService(serviceName);
            sendProgress(0.9, '配置环境变量');
            await setSystemEnvVariable(`MYSQL_HOME${suffix}`, installPath);
            await setPathForMySQL(suffix);
            await refreshCurrentProcessEnv();
            sendProgress(1, '安装完成');
            mainWindow.webContents.send('mysql-changed');
            return {success: true, message: `MySQL ${version} 安装成功，端口: ${availablePort}`};
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

    ipcMain.handle('check-mysql', async () => {
        try {
            const versions = await getAllInstalledVersions();
            const defaultVersion = await getCurrentDefaultVersion();
            return {versions, default: defaultVersion};
        } catch (err) {
            return {versions: [], default: null};
        }
    });

    ipcMain.handle('switch-mysql', async (event, version) => {
        try {
            const cfg = mysqlVersions[version];
            if (!cfg) throw new Error(`不支持的版本: ${version}`);
            const home = await findMySQLHome(version);
            if (!home) throw new Error(`未找到 MySQL ${version} 的安装目录`);
            await setPathForMySQL(cfg.suffix);
            await refreshCurrentProcessEnv();
            mainWindow.webContents.send('mysql-changed');
            return {success: true, message: `已切换到 MySQL ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('delete-mysql', async (event, version) => {
        try {
            const cfg = mysqlVersions[version];
            if (!cfg) throw new Error(`不支持的版本: ${version}`);
            const home = await findMySQLHome(version);
            if (!home) throw new Error(`未找到 MySQL ${version} 的安装目录`);
            const serviceName = `MySQL${cfg.suffix}`;
            const status = await getServiceStatus(serviceName);
            if (status === 'running') {
                await stopService(serviceName);
            }
            if (status !== 'not installed') {
                await deleteService(serviceName);
            }
            const currentDefault = await getCurrentDefaultVersion();
            if (currentDefault === version) {
                const allVersions = await getAllInstalledVersions();
                const other = allVersions.find(v => v !== version);
                if (other) {
                    const otherCfg = mysqlVersions[other];
                    await setPathForMySQL(otherCfg.suffix);
                } else {
                    const systemPath = await getSystemPath();
                    const parts = systemPath.split(';');
                    const newParts = parts.filter(p => !/^%MYSQL_HOME\d+%\\bin$/i.test(p));
                    const newPath = newParts.join(';');
                    const setxCmd = `C:\\Windows\\System32\\setx.exe /M PATH "${newPath}"`;
                    await execPromise(setxCmd);
                }
            }
            await removeSystemEnvVariable(`MYSQL_HOME${cfg.suffix}`);
            fs.rmSync(home, {recursive: true, force: true});
            mainWindow.webContents.send('mysql-changed');
            return {success: true, message: `已删除 MySQL ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('start-mysql-service', async (event, version) => {
        try {
            const cfg = mysqlVersions[version];
            if (!cfg) throw new Error(`不支持的版本: ${version}`);
            const serviceName = `MySQL${cfg.suffix}`;
            await startService(serviceName);
            return {success: true, message: `MySQL ${version} 服务已启动`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('stop-mysql-service', async (event, version) => {
        try {
            const cfg = mysqlVersions[version];
            if (!cfg) throw new Error(`不支持的版本: ${version}`);
            const serviceName = `MySQL${cfg.suffix}`;
            await stopService(serviceName);
            return {success: true, message: `MySQL ${version} 服务已停止`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('restart-mysql-service', async (event, version) => {
        try {
            const cfg = mysqlVersions[version];
            if (!cfg) throw new Error(`不支持的版本: ${version}`);
            const serviceName = `MySQL${cfg.suffix}`;
            await stopService(serviceName);
            await startService(serviceName);
            return {success: true, message: `MySQL ${version} 服务已重启`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('get-mysql-service-status', async (event, version) => {
        try {
            const cfg = mysqlVersions[version];
            if (!cfg) return {success: false, status: 'unknown', message: '不支持的版本'};
            const serviceName = `MySQL${cfg.suffix}`;
            const status = await getServiceStatus(serviceName);
            return {success: true, status};
        } catch (err) {
            return {success: false, status: 'error', message: err.message};
        }
    });

    ipcMain.handle('change-mysql-password', async (event, version, oldPassword, newPassword) => {
        try {
            const cfg = mysqlVersions[version];
            if (!cfg) throw new Error(`不支持的版本: ${version}`);
            const home = await findMySQLHome(version);
            if (!home) throw new Error(`未找到 MySQL ${version} 的安装目录`);
            const mysqladminPath = path.join(home, 'bin', 'mysqladmin.exe');
            if (!fs.existsSync(mysqladminPath)) throw new Error('未找到 mysqladmin.exe');
            const portCmd = `"${path.join(home, 'bin', 'mysql.exe')}" -N -s -e "SELECT @@port"`;
            let port = 3306;
            try {
                const {stdout} = await execPromise(portCmd);
                port = parseInt(stdout.trim(), 10);
            } catch (err) {
            }
            let changeCmd;
            if (!oldPassword || oldPassword === '') {
                changeCmd = `"${mysqladminPath}" -u root -P ${port} password "${newPassword}"`;
            } else {
                changeCmd = `"${mysqladminPath}" -u root -p${oldPassword} -P ${port} password "${newPassword}"`;
            }
            await execPromise(changeCmd);
            logToFile(`MySQL ${version} 密码修改成功`);
            return {success: true, message: `MySQL ${version} root 密码已修改`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });
};