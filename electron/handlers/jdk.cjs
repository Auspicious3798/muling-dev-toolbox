const {ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const {exec} = require('child_process');
const axios = require('axios');
const AdmZip = require('adm-zip');
const {promisify} = require('util');
const execPromise = promisify(exec);
const configManager = require('../configManager.cjs');

module.exports = function registerJDKHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'jdk_install.log');

    function logToFile(message) {
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
    }

    let currentAbortController = null;
    let pendingLocalFile = null;

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
        
        // 每3秒检查一次下载速度
        speedCheckInterval = setInterval(() => {
            const currentTime = Date.now();
            const timeDiff = (currentTime - lastCheckTime) / 1000; // 秒
            const bytesDiff = downloaded - lastDownloaded;
            const speedBps = bytesDiff / timeDiff; // 字节/秒
            const speedKbps = speedBps / 1024; // KB/s
            
            logToFile(`[JDK下载] 速度: ${speedKbps.toFixed(2)} KB/s, 已下载: ${(downloaded / 1024 / 1024).toFixed(2)} MB`);
            
            // 如果速度低于 50 KB/s 且下载量超过 1 MB,触发慢速警告
            if (onSlowSpeed && speedKbps < 50 && downloaded > 1024 * 1024 && !slowSpeedNotified) {
                slowSpeedNotified = true;
                mainWindow.webContents.send('download-speed-warning', {
                    type: 'jdk',
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

    function refreshCurrentProcessEnv() {
        return new Promise((resolve, reject) => {
            const regCmd = `C:\\Windows\\System32\\reg.exe query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path`;
            exec(regCmd, {windowsHide: true}, (error, stdout) => {
                if (error) {
                    reject(error);
                    return;
                }
                const match = stdout.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
                if (match && match[1]) {
                    let newPath = match[1].trim();
                    newPath = newPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
                    process.env.Path = newPath;
                    resolve();
                } else {
                    reject(new Error('无法获取系统 PATH'));
                }
            });
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

    function setPathForVersion(version) {
        return new Promise((resolve, reject) => {
            const targetVar = `JAVA_HOME${version}`;
            const targetEntry = `%${targetVar}%\\bin`;

            const regPaths = ['reg', 'C:\\Windows\\System32\\reg.exe'];
            let parseError = null;

            const tryNext = (index) => {
                if (index >= regPaths.length) {
                    reject(new Error(`无法解析当前 PATH 值: ${parseError || '未找到有效输出'}`));
                    return;
                }
                const regCmd = `${regPaths[index]} query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path`;
                logToFile(`执行 reg: ${regCmd}`);
                exec(regCmd, {windowsHide: true}, (error, stdout) => {
                    if (error) {
                        parseError = error.message;
                        tryNext(index + 1);
                        return;
                    }
                    const match = stdout.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
                    if (match && match[1]) {
                        const currentPath = match[1].trim();
                        logToFile(`当前 PATH: ${currentPath}`);
                        const parts = currentPath.split(';');
                        const newParts = [];
                        for (const p of parts) {
                            if (!/^%JAVA_HOME\d+%\\bin$/i.test(p)) {
                                newParts.push(p);
                            }
                        }
                        newParts.unshift(targetEntry);
                        const newPath = newParts.join(';');
                        const setxCmd = `C:\\Windows\\System32\\setx.exe /M PATH "${newPath}"`;
                        logToFile(`执行 setx PATH: ${setxCmd}`);
                        exec(setxCmd, {windowsHide: true}, (err, stdout, stderr) => {
                            if (err) {
                                logToFile(`setx PATH 失败: ${stderr || err.message}`);
                                reject(new Error(`设置 PATH 失败: ${stderr || err.message}`));
                            } else {
                                logToFile(`setx PATH 成功: ${newPath}`);
                                refreshCurrentProcessEnv()
                                    .then(() => resolve())
                                    .catch(err => reject(err));
                            }
                        });
                    } else {
                        logToFile(`未解析到 PATH 值，使用空 PATH 创建`);
                        const newPath = targetEntry;
                        const setxCmd = `C:\\Windows\\System32\\setx.exe /M PATH "${newPath}"`;
                        logToFile(`执行 setx PATH (新建): ${setxCmd}`);
                        exec(setxCmd, {windowsHide: true}, (err, stdout, stderr) => {
                            if (err) {
                                logToFile(`setx PATH 失败: ${stderr || err.message}`);
                                reject(new Error(`设置 PATH 失败: ${stderr || err.message}`));
                            } else {
                                logToFile(`setx PATH 成功: ${newPath}`);
                                refreshCurrentProcessEnv()
                                    .then(() => resolve())
                                    .catch(err => reject(err));
                            }
                        });
                    }
                });
            };
            tryNext(0);
        });
    }

    async function getCurrentDefaultVersion() {
        try {
            const regCmd = `C:\\Windows\\System32\\reg.exe query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path`;
            const {stdout} = await execPromise(regCmd);
            const match = stdout.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
            if (!match || !match[1]) return null;
            const currentPath = match[1].trim();
            const versionMatch = currentPath.match(/%JAVA_HOME(\d+)%\\bin/);
            if (versionMatch && versionMatch[1]) {
                return versionMatch[1];
            }
            return null;
        } catch (err) {
            return null;
        }
    }

    async function getAllInstalledVersions() {
        const versions = new Set();
        try {
            const psScript = `
                Get-ChildItem Env: | Where-Object { $_.Name -match '^JAVA_HOME\\d+$' } | ForEach-Object { $_.Name -replace 'JAVA_HOME', '' }
            `;
            const {stdout} = await execPromise(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`);
            const lines = stdout.trim().split('\r\n').filter(l => l);
            for (const line of lines) {
                versions.add(line.trim());
            }
        } catch (err) {
        }
        const knownDirs = [
            'C:\\Program Files\\Java',
            'C:\\Program Files\\Eclipse Adoptium',
            'C:\\Program Files\\OpenJDK',
            'C:\\Program Files\\muling\\muling-env-box\\Java'
        ];
        for (const base of knownDirs) {
            if (fs.existsSync(base)) {
                const dirs = fs.readdirSync(base);
                for (const dir of dirs) {
                    const fullPath = path.join(base, dir);
                    const releaseFile = path.join(fullPath, 'release');
                    if (fs.existsSync(releaseFile)) {
                        try {
                            const release = fs.readFileSync(releaseFile, 'utf8');
                            const match = release.match(/JAVA_VERSION="([0-9]+)/);
                            if (match && match[1]) {
                                versions.add(match[1]);
                            }
                        } catch (e) {
                        }
                    }
                }
            }
        }
        return Array.from(versions).sort((a, b) => Number(b) - Number(a));
    }

    async function findJDKHome(version) {
        const varName = `JAVA_HOME${version}`;
        try {
            const {stdout} = await execPromise(`echo %${varName}%`);
            const home = stdout.trim();
            if (home && fs.existsSync(home)) {
                return home;
            }
        } catch (err) {
        }
        const knownDirs = [
            'C:\\Program Files\\Java',
            'C:\\Program Files\\Eclipse Adoptium',
            'C:\\Program Files\\OpenJDK',
            'C:\\Program Files\\muling\\muling-env-box\\Java'
        ];
        for (const base of knownDirs) {
            if (fs.existsSync(base)) {
                const dirs = fs.readdirSync(base);
                for (const dir of dirs) {
                    const fullPath = path.join(base, dir);
                    const releaseFile = path.join(fullPath, 'release');
                    if (fs.existsSync(releaseFile)) {
                        const release = fs.readFileSync(releaseFile, 'utf8');
                        const match = release.match(/JAVA_VERSION="([0-9]+)/);
                        if (match && match[1] === version) {
                            return fullPath;
                        }
                    }
                }
            }
        }
        return null;
    }

    ipcMain.on('cancel-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    ipcMain.handle('import-local-jdk', async (event, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.zip') return {success: false, message: '只支持 .zip 文件'};
        const fileName = path.basename(filePath);
        const destPath = path.join(downloadDir, fileName);
        fs.copyFileSync(filePath, destPath);
        pendingLocalFile = destPath;
        return {success: true, message: 'JDK 安装包已导入，点击“开始安装”完成配置'};
    });

    ipcMain.handle('install-from-local', async (event, version) => {
        if (!pendingLocalFile) return {success: false, message: '没有已导入的 JDK 安装包，请先导入'};
        if (!version) return {success: false, message: '未指定 JDK 版本'};
        
        // 获取配置中的 baseDir，与在线安装保持一致
        const toolConfig = configManager.getToolConfig('jdk', version);
        const baseDir = toolConfig?.baseDir || 'C:\\Program Files\\Java';
        
        const zipPath = pendingLocalFile;
        const installPath = path.join(baseDir, `jdk-${version}`);
        const sendProgress = (progress, stage = '') => {
            setImmediate(() => {
                mainWindow.webContents.send('download-progress', {type: 'jdk', version, progress, stage});
            });
        };
        try {
            sendProgress(0.3, '解压中');
            await installZip(zipPath, installPath);
            sendProgress(0.7, '配置环境变量');
            const jdkRoot = installPath;
            const jdkBin = path.join(jdkRoot, 'bin');
            if (!fs.existsSync(jdkBin)) throw new Error('解压后未找到 bin 目录');
            await setSystemEnvVariable(`JAVA_HOME${version}`, jdkRoot);
            await setPathForVersion(version);

            await new Promise(resolve => setTimeout(resolve, 1000));

            sendProgress(1, '安装完成');
            setTimeout(() => {
                mainWindow.webContents.send('jdk-changed');
            }, 500);
            return {success: true, message: 'JDK 安装成功'};
        } catch (err) {
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

    ipcMain.handle('install-jdk', async (event, version) => {
        logToFile(`尝试获取 JDK ${version} 的配置`);
        const toolConfig = configManager.getToolConfig('jdk', version);
        if (!toolConfig) {
            logToFile(`错误：未找到 JDK ${version} 的配置`);
            const config = configManager.getConfig();
            if (config && config.tools && config.tools.jdk && config.tools.jdk.versions) {
                logToFile(`可用的 JDK 版本: ${Object.keys(config.tools.jdk.versions).join(', ')}`);
            } else {
                logToFile(`错误：配置中不存在 JDK 工具配置`);
            }
            return {success: false, message: `不支持的 JDK 版本: ${version}`};
        }

        logToFile(`成功获取 JDK ${version} 配置，URL: ${toolConfig.url}`);
        const {url} = toolConfig;
        const fileName = url.split('/').pop();
        const installerPath = path.join(downloadDir, fileName);
        const installPath = path.join(toolConfig.baseDir || 'C:\\Program Files\\Java', `jdk-${version}`);
        const sendProgress = (progress, stage = '') => {
            setImmediate(() => {
                mainWindow.webContents.send('download-progress', {type: 'jdk', version, progress, stage});
            });
        };
        const abortController = new AbortController();
        currentAbortController = abortController;
        try {
            if (!fs.existsSync(installerPath)) {
                sendProgress(0, '下载安装包');
                await downloadFile(url, installerPath, (p) => sendProgress(p * 0.5, '下载安装包'), abortController.signal, true);
                sendProgress(0.5, '解压中');
            } else {
                sendProgress(0.5, '解压中');
            }
            await installZip(installerPath, installPath);
            sendProgress(0.7, '配置环境变量');
            const jdkRoot = installPath;
            const jdkBin = path.join(jdkRoot, 'bin');
            if (!fs.existsSync(jdkBin)) throw new Error('解压后未找到 bin 目录');
            await setSystemEnvVariable(`JAVA_HOME${version}`, jdkRoot);
            await setPathForVersion(version);

            await new Promise(resolve => setTimeout(resolve, 1000));

            sendProgress(1, '安装完成');
            setTimeout(() => {
                mainWindow.webContents.send('jdk-changed');
            }, 500);
            return {success: true, message: 'JDK 安装成功'};
        } catch (err) {
            if (err.message === '下载已取消') {
                return {success: false, message: '下载已取消'};
            }
            // 检查是否是权限错误
            if (err.code === 'EPERM' || err.code === 'EACCES') {
                return {
                    success: false,
                    message: '安装失败：没有权限写入该目录。请右键点击应用，选择“以管理员身份运行”后重试。'
                };
            }
            return {success: false, message: `安装失败: ${err.message}`};
        } finally {
            if (currentAbortController === abortController) {
                currentAbortController = null;
            }
            if (fs.existsSync(installerPath)) {
                try {
                    fs.unlinkSync(installerPath);
                } catch (e) {
                }
            }
        }
    });

    ipcMain.handle('check-jdk', async () => {
        try {
            const versions = await getAllInstalledVersions();
            const defaultVersion = await getCurrentDefaultVersion();
            return {versions, default: defaultVersion};
        } catch (err) {
            return {versions: [], default: null};
        }
    });

    ipcMain.handle('switch-jdk', async (event, version) => {
        try {
            const home = await findJDKHome(version);
            if (!home) throw new Error(`未找到 JDK ${version} 的安装目录`);
            await setPathForVersion(version);
            mainWindow.webContents.send('jdk-changed');
            return {success: true, message: `已切换到 JDK ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('delete-jdk', async (event, version) => {
        try {
            const home = await findJDKHome(version);
            if (!home) throw new Error(`未找到 JDK ${version} 的安装目录`);
            const currentDefault = await getCurrentDefaultVersion();
            if (currentDefault === version) {
                const allVersions = await getAllInstalledVersions();
                const other = allVersions.find(v => v !== version);
                if (other) {
                    await setPathForVersion(other);
                } else {
                    const regCmd = `C:\\Windows\\System32\\reg.exe query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path`;
                    exec(regCmd, {windowsHide: true}, (error, stdout) => {
                        if (!error) {
                            const match = stdout.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
                            if (match && match[1]) {
                                let currentPath = match[1].trim();
                                const parts = currentPath.split(';');
                                const newParts = [];
                                for (const p of parts) {
                                    if (!/^%JAVA_HOME\d+%\\bin$/i.test(p)) {
                                        newParts.push(p);
                                    }
                                }
                                const newPath = newParts.join(';');
                                const setxCmd = `C:\\Windows\\System32\\setx.exe /M PATH "${newPath}"`;
                                exec(setxCmd, {windowsHide: true});
                            }
                        }
                    });
                }
            }
            await removeSystemEnvVariable(`JAVA_HOME${version}`);
            fs.rmSync(home, {recursive: true, force: true});
            mainWindow.webContents.send('jdk-changed');
            return {success: true, message: `已删除 JDK ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });
};