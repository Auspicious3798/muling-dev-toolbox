const {ipcMain} = require('electron');
const {spawn} = require('child_process');
const path = require('path');
const fs = require('fs');
const {exec} = require('child_process');
const axios = require('axios');
const AdmZip = require('adm-zip');
const {promisify} = require('util');
const execPromise = promisify(exec);
const configManager = require('../configManager.cjs');

module.exports = function registerMySQLHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'mysql_install.log');

    // 辅助函数：获取 MySQL 版本配置
    function getMySQLVersionConfig(version) {
        const cfg = configManager.getToolConfig('mysql', version);
        if (!cfg) return null;
        
        // 根据版本设置默认端口
        const defaultPort = version === '5.7' ? 3306 : (version === '8.0' ? 3307 : 3308);
        
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
                const zip = new AdmZip(zipPath,{});
                zip.extractAllTo(installDir, true);
                logToFile(`解压成功: ${zipPath} -> ${installDir}`);
                resolve();
            } catch (err) {
                logToFile(`解压失败: ${err.message}`);
                reject(err);
            }
        });
    }

    function setUserEnvVariable(name, value) {
        return new Promise((resolve, reject) => {
            const psCmd = `[Environment]::SetEnvironmentVariable('${name}', '${value.replace(/'/g, "''")}', 'User')`;
            const fullCmd = `powershell -Command "${psCmd}"`;
            logToFile(`执行 PowerShell 设置环境变量: ${name}=${value}`);
            exec(fullCmd, {windowsHide: true, timeout: 15000}, (error, stdout, stderr) => {
                if (error) {
                    if (error.killed) {
                        logToFile(`设置环境变量超时: ${name}`);
                        reject(new Error(`设置环境变量超时: ${name}`));
                    } else {
                        logToFile(`设置环境变量失败: ${stderr || error.message}`);
                        reject(new Error(`设置环境变量失败: ${stderr || error.message}`));
                    }
                } else {
                    logToFile(`环境变量设置成功: ${name}=${value}`);
                    process.env[name] = value;
                    resolve();
                }
            });
        });
    }

    function removeUserEnvVariable(name) {
        return new Promise((resolve, reject) => {
            const setxCmd = `setx "${name}" ""`;
            exec(setxCmd, {windowsHide: true}, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    async function getUserPath() {
        return new Promise((resolve) => {
            exec('reg query HKCU\\Environment /v PATH', {windowsHide: true}, (error, stdout) => {
                if (error) {
                    resolve('');
                    return;
                }
                const match = stdout.match(/PATH\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
                if (match && match[1]) {
                    resolve(match[1].trim());
                } else {
                    resolve('');
                }
            });
        });
    }

    function setUserPath(newPath) {
        return new Promise((resolve, reject) => {
            const psCmd = `[Environment]::SetEnvironmentVariable('PATH', '${newPath.replace(/'/g, "''")}', 'User')`;
            const fullCmd = `powershell -Command "${psCmd}"`;
            logToFile(`执行 PowerShell 设置 PATH (用户): 长度=${newPath.length}`);
            exec(fullCmd, {windowsHide: true, timeout: 15000}, (err) => {
                if (err) {
                    if (err.killed) {
                        logToFile(`设置 PATH 超时`);
                        reject(new Error('设置 PATH 超时'));
                    } else {
                        reject(new Error(`设置用户 PATH 失败: ${err.message}`));
                    }
                } else {
                    logToFile(`用户 PATH 设置成功: 长度=${newPath.length}`);
                    resolve();
                }
            });
        });
    }

    function setPathForMySQL(suffix) {
        return new Promise(async (resolve, reject) => {
            const targetVar = `MYSQL_HOME${suffix}`;
            const targetEntry = `%${targetVar}%\\bin`;
            let currentPath = await getUserPath();
            if (!currentPath) currentPath = '';
            const parts = currentPath.split(';');
            const newParts = [];
            for (const p of parts) {
                if (!/^%MYSQL_HOME\d+%\\bin$/i.test(p)) {
                    newParts.push(p);
                }
            }
            newParts.unshift(targetEntry);
            const newPath = newParts.join(';');
            try {
                await setUserPath(newPath);
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    async function refreshCurrentProcessEnv() {
        try {
            let expandedPath = await getUserPath();
            // 从配置中获取所有已安装的 MySQL 版本
            const config = configManager.getConfig();
            if (config && config.tools && config.tools.mysql && config.tools.mysql.versions) {
                for (const [ver, cfg] of Object.entries(config.tools.mysql.versions)) {
                    const varName = `MYSQL_HOME${cfg.suffix}`;
                    const varValue = process.env[varName];
                    if (varValue) {
                        expandedPath = expandedPath.replace(new RegExp(`%${varName}%`, 'g'), varValue);
                    }
                }
            }
            expandedPath = expandedPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
            process.env.Path = expandedPath;
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

    async function initializeDataDir(installDir) {
        const mysqldPath = path.join(installDir, 'bin', 'mysqld.exe');
        if (!fs.existsSync(mysqldPath)) throw new Error('未找到 mysqld.exe');
        const initCmd = `"${mysqldPath}" --initialize-insecure --basedir="${installDir}" --datadir="${installDir}\\data"`;
        logToFile(`初始化数据目录: ${initCmd}`);
        await execPromise(initCmd);
        logToFile(`数据目录初始化完成（root 密码为空）`);
    }

    async function setRootPassword(installDir, password, port) {
        if (!password || password.trim() === '') return;
        logToFile(`准备设置 root 密码，端口: ${port}`);
        const mysqladminPath = path.join(installDir, 'bin', 'mysqladmin.exe');
        if (!fs.existsSync(mysqladminPath)) throw new Error('未找到 mysqladmin.exe');
        const changeCmd = `"${mysqladminPath}" -u root -P ${port} password "${password}"`;
        try {
            await execPromise(changeCmd);
            logToFile(`root 密码设置成功`);
        } catch (err) {
            logToFile(`mysqladmin 设置密码失败: ${err.message}，尝试 SQL 方式`);
            const mysqlPath = path.join(installDir, 'bin', 'mysql.exe');
            const sqlCmd = `ALTER USER 'root'@'localhost' IDENTIFIED BY '${password}'; FLUSH PRIVILEGES;`;
            const fullCmd = `"${mysqlPath}" -u root -P ${port} -e "${sqlCmd}"`;
            await execPromise(fullCmd);
            logToFile(`SQL 方式设置密码成功`);
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

    // 动态查找匹配的服务名（支持 MySQL90, MySQL93, MySQL94 等任意小版本）
    async function findMySQLServiceName(version) {
        const cfg = getMySQLVersionConfig(version);
        if (!cfg) return null;
        const major = version.split('.')[0];
        
        // 优先尝试标准服务名（如 MySQL90）
        const standardServiceName = `MySQL${cfg.suffix}`;
        try {
            const {stdout: testStdout} = await execPromise(`sc query ${standardServiceName}`);
            if (testStdout.toUpperCase().includes('SERVICE_NAME') || testStdout.includes('服务名称')) {
                logToFile(`找到标准服务名: ${standardServiceName}`);
                return standardServiceName;
            }
        } catch (err) {
            // 标准服务名不存在，继续扫描
        }
        
        // 扫描所有 MySQL 服务
        try {
            const {stdout} = await execPromise('sc query type= service state= all');
            logToFile(`sc query 完整输出（前500字符）: ${stdout.substring(0, 500)}`);
            const serviceRegex = /SERVICE_NAME:\s*(MySQL\d+)/g;
            let match;
            while ((match = serviceRegex.exec(stdout)) !== null) {
                const serviceName = match[1];
                logToFile(`发现 MySQL 服务: ${serviceName}`);
                const numMatch = serviceName.match(/MySQL(\d+)/);
                if (numMatch) {
                    const num = numMatch[1];
                    if (num.startsWith(major)) {
                        logToFile(`✅ 找到匹配的 MySQL 服务: ${serviceName} (版本 ${version})`);
                        return serviceName;
                    }
                }
            }
        } catch (err) {
            logToFile(`查找 MySQL 服务失败: ${err.message}`);
        }
        logToFile(`❌ 未找到匹配的 MySQL ${version} 服务`);
        return null;
    }

    async function getServiceStatus(serviceName) {
        try {
            const {stdout} = await execPromise(`sc query ${serviceName}`);
            logToFile(`服务 ${serviceName} 状态查询结果: ${stdout.substring(0, 300)}`);
            const upper = stdout.toUpperCase();
            // 支持中英文状态关键词
            if (upper.includes('RUNNING') || stdout.includes('运行中') || stdout.includes('RUNNING')) {
                return 'running';
            }
            if (upper.includes('STOPPED') || stdout.includes('已停止') || stdout.includes('STOPPED')) {
                return 'stopped';
            }
            // 如果服务存在但状态不明确，默认返回 stopped
            if (upper.includes('SERVICE_NAME') || upper.includes('服务名称')) {
                return 'stopped';
            }
            return 'unknown';
        } catch (err) {
            logToFile(`服务 ${serviceName} 状态查询失败: ${err.message}`);
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
        // 动态扫描所有 MySQL 服务，支持任意小版本号（如 MySQL93, MySQL94 等）
        try {
            const {stdout} = await execPromise('sc query type= service state= all');
            // 匹配所有 MySQL 开头的服务名
            const serviceMatches = stdout.match(/SERVICE_NAME:\s*MySQL\d+/g);
            if (serviceMatches) {
                for (const match of serviceMatches) {
                    // 提取服务名，如 MySQL93
                    const serviceNameMatch = match.match(/SERVICE_NAME:\s*(MySQL\d+)/);
                    if (serviceNameMatch) {
                        const serviceName = serviceNameMatch[1];
                        // 提取数字后缀，如 MySQL93 → 93
                        const numMatch = serviceName.match(/MySQL(\d+)/);
                        if (numMatch) {
                            const num = numMatch[1];
                            // 映射规则：57→5.7, 80→8.0, 9x→9.0
                            if (num.startsWith('5')) versions.add('5.7');
                            else if (num.startsWith('8')) versions.add('8.0');
                            else if (num.startsWith('9')) versions.add('9.0');
                        }
                    }
                }
            }
        } catch (err) {
            logToFile(`扫描 MySQL 服务失败: ${err.message}`);
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
            const userPath = await getUserPath();
            const match = userPath.match(/%MYSQL_HOME(\d+)%\\bin/);
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
        // 从配置获取下载信息
        const cfg = configManager.getToolConfig('mysql', version);
        if (!cfg) return {success: false, message: `不支持的 MySQL 版本: ${version}`};
        
        const {url, suffix} = cfg;
        const defaultPort = version === '5.7' ? 3306 : (version === '8.0' ? 3307 : 3308);
        const fileName = url.split('/').pop();
        const installerPath = path.join(downloadDir, fileName);
        const installPath = path.join(cfg.baseDir || 'C:\\Program Files\\MySQL', `mysql-${version}`);
        const sendProgress = (progress, stage = '') => {
            // 使用 setImmediate 确保 IPC 消息能立即发送到渲染进程
            setImmediate(() => {
                mainWindow.webContents.send('mysql-progress', {type: 'mysql', version, progress, stage});
            });
        };
        const abortController = new AbortController();
        currentAbortController = abortController;
        try {
            if (!fs.existsSync(installerPath)) {
                sendProgress(0, '下载安装包');
                await downloadFile(url, installerPath, (p) => sendProgress(p * 0.3, '下载安装包'), abortController.signal);
                sendProgress(0.3, '解压中');
            } else {
                sendProgress(0.3, '解压中');
            }
            await installZip(installerPath, installPath);
            sendProgress(0.4, '初始化配置');
            const availablePort = await findAvailablePort(defaultPort);
            await generateMyCnf(installPath, availablePort);
            sendProgress(0.45, '初始化数据目录');
            await initializeDataDir(installPath);
            sendProgress(0.6, '安装服务');
            const serviceName = await installService(installPath, suffix);
            sendProgress(0.7, '启动服务');
            await startService(serviceName);
            if (password && password.trim() !== '') {
                sendProgress(0.8, '设置 root 密码');
                await setRootPassword(installPath, password, availablePort);
            }
            sendProgress(0.9, '配置环境变量');
            await setUserEnvVariable(`MYSQL_HOME${suffix}`, installPath);
            await setPathForMySQL(suffix);
            await refreshCurrentProcessEnv();
            
            // 等待服务完全就绪后再发送完成信号
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            sendProgress(1, '安装完成');
            // 延迟发送 mysql-changed，确保进度 100% 先到达前端
            setTimeout(() => {
                mainWindow.webContents.send('mysql-changed');
            }, 500);
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
        const cfg = getMySQLVersionConfig(version);
        if (!cfg) return {success: false, message: `不支持的 MySQL 版本: ${version}`};
        const {suffix, defaultPort} = cfg;
        const zipPath = pendingLocalFile;
        const installPath = `C:\\Program Files\\MySQL\\mysql-${version}`;
        const sendProgress = (progress, stage = '') => {
            setImmediate(() => {
                mainWindow.webContents.send('mysql-progress', {type: 'mysql', version, progress, stage});
            });
        };
        try {
            sendProgress(0.3, '解压中');
            await installZip(zipPath, installPath);
            sendProgress(0.4, '初始化配置');
            const availablePort = await findAvailablePort(defaultPort);
            await generateMyCnf(installPath, availablePort);
            sendProgress(0.45, '初始化数据目录');
            await initializeDataDir(installPath);
            sendProgress(0.6, '安装服务');
            const serviceName = await installService(installPath, suffix);
            sendProgress(0.7, '启动服务');
            await startService(serviceName);
            if (password && password.trim() !== '') {
                sendProgress(0.8, '设置 root 密码');
                await setRootPassword(installPath, password, availablePort);
            }
            sendProgress(0.9, '配置环境变量');
            await setUserEnvVariable(`MYSQL_HOME${suffix}`, installPath);
            await setPathForMySQL(suffix);
            await refreshCurrentProcessEnv();
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            sendProgress(1, '安装完成');
            setTimeout(() => {
                mainWindow.webContents.send('mysql-changed');
            }, 500);
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
            const cfg = getMySQLVersionConfig(version);
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const home = await findMySQLHome(version);
            if (!home) return {success: false, message: `未找到 MySQL ${version} 的安装目录`};
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
            const cfg = getMySQLVersionConfig(version);
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const home = await findMySQLHome(version);
            if (!home) return {success: false, message: `未找到 MySQL ${version} 的安装目录`};
            const serviceName = await findMySQLServiceName(version);
            if (serviceName) {
                const status = await getServiceStatus(serviceName);
                if (status === 'running') {
                    await stopService(serviceName);
                }
                if (status !== 'not installed') {
                    await deleteService(serviceName);
                }
            }
            const currentDefault = await getCurrentDefaultVersion();
            if (currentDefault === version) {
                const allVersions = await getAllInstalledVersions();
                const other = allVersions.find(v => v !== version);
                if (other) {
                    const otherCfg = getMySQLVersionConfig(other);
                    await setPathForMySQL(otherCfg.suffix);
                } else {
                    const currentPath = await getUserPath();
                    const parts = currentPath.split(';');
                    const newParts = parts.filter(p => !/^%MYSQL_HOME\d+%\\bin$/i.test(p));
                    const newPath = newParts.join(';');
                    await setUserPath(newPath);
                }
            }
            await removeUserEnvVariable(`MYSQL_HOME${cfg.suffix}`);
            fs.rmSync(home, {recursive: true, force: true});
            mainWindow.webContents.send('mysql-changed');
            return {success: true, message: `已删除 MySQL ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('start-mysql-service', async (event, version) => {
        try {
            const cfg = getMySQLVersionConfig(version);
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const serviceName = await findMySQLServiceName(version);
            if (!serviceName) return {success: false, message: `未找到 MySQL ${version} 的服务`};
            await startService(serviceName);
            return {success: true, message: `MySQL ${version} 服务已启动`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('stop-mysql-service', async (event, version) => {
        try {
            const cfg = getMySQLVersionConfig(version);
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const serviceName = await findMySQLServiceName(version);
            if (!serviceName) return {success: false, message: `未找到 MySQL ${version} 的服务`};
            await stopService(serviceName);
            return {success: true, message: `MySQL ${version} 服务已停止`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('restart-mysql-service', async (event, version) => {
        try {
            const cfg = getMySQLVersionConfig(version);
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const serviceName = await findMySQLServiceName(version);
            if (!serviceName) return {success: false, message: `未找到 MySQL ${version} 的服务`};
            await stopService(serviceName);
            await startService(serviceName);
            return {success: true, message: `MySQL ${version} 服务已重启`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('get-mysql-service-status', async (event, version) => {
        try {
            const cfg = getMySQLVersionConfig(version);
            if (!cfg) return {success: false, status: 'unknown', message: '不支持的版本'};
            const serviceName = await findMySQLServiceName(version);
            if (!serviceName) {
                logToFile(`get-mysql-service-status: 未找到 ${version} 的服务`);
                return {success: true, status: 'unknown'};
            }
            logToFile(`get-mysql-service-status: 使用服务名 ${serviceName}`);
            const status = await getServiceStatus(serviceName);
            return {success: true, status};
        } catch (err) {
            logToFile(`get-mysql-service-status 异常: ${err.message}`);
            return {success: false, status: 'error', message: err.message};
        }
    });

    ipcMain.handle('change-mysql-password', async (event, version, oldPassword, newPassword) => {
        try {
            const cfg = getMySQLVersionConfig(version);
            if (!cfg) return {success: false, message: `不支持的版本: ${version}`};
            const home = await findMySQLHome(version);
            if (!home) return {success: false, message: `未找到 MySQL ${version} 的安装目录`};
            const mysqladminPath = path.join(home, 'bin', 'mysqladmin.exe');
            if (!fs.existsSync(mysqladminPath)) return {
                success: false,
                message: `未找到 MySQL ${version} 的 mysqladmin.exe`
            }
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

    ipcMain.handle('get-mysql-config', async (event, version) => {
        const cfg = getMySQLVersionConfig(version);
        if (!cfg) return {success: false, message: '不支持的版本'};
        const home = await findMySQLHome(version);
        if (!home) return {success: false, message: '未找到安装目录'};

        let port = cfg.defaultPort;
        const confPath = path.join(home, 'my.ini');
        if (fs.existsSync(confPath)) {
            const content = fs.readFileSync(confPath, 'utf8');
            const portMatch = content.match(/^port\s*=\s*(\d+)/im);
            if (portMatch) port = parseInt(portMatch[1], 10);
        }

        let hasPassword = false;
        const serviceName = await findMySQLServiceName(version);
        const status = serviceName ? await getServiceStatus(serviceName) : 'unknown';
        if (status === 'running') {
            const mysqlPath = path.join(home, 'bin', 'mysql.exe');
            if (fs.existsSync(mysqlPath)) {
                try {
                    await execPromise(`"${mysqlPath}" -u root -P ${port} -e "exit"`, {timeout: 5000});
                    hasPassword = false;
                } catch (err) {
                    hasPassword = true;
                }
            } else {
                hasPassword = null;
            }
        } else {
            hasPassword = null;
        }

        return {success: true, port, hasPassword};
    });
};