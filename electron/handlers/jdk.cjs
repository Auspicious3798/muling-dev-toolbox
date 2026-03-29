const {ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const {exec} = require('child_process');
const axios = require('axios');
const AdmZip = require('adm-zip');
const {promisify} = require('util');
const execPromise = promisify(exec);

const jdkSources = {
    '8': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk1.8.0_471.zip',
        type: 'zip'
    },
    '11': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-11.0.29.zip',
        type: 'zip'
    },
    '12': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-12.0.2.zip',
        type: 'zip'
    },
    '13': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-13.0.2.zip',
        type: 'zip'
    },
    '14': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-14.0.2.zip',
        type: 'zip'
    },
    '15': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-15.0.2.zip',
        type: 'zip'
    },
    '16': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-16.0.2.zip',
        type: 'zip'
    },
    '17': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-17.0.17.zip',
        type: 'zip'
    },
    '18': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-18.0.2.1.zip',
        type: 'zip'
    },
    '19': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-19.0.2.zip',
        type: 'zip'
    },
    '20': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-20.0.2.zip',
        type: 'zip'
    },
    '21': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-21.0.10.zip',
        type: 'zip'
    },
    '22': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-22.0.2.zip',
        type: 'zip'
    },
    '23': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-23.0.2.zip',
        type: 'zip'
    },
    '24': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-24.0.2.zip',
        type: 'zip'
    },
    '25': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-25.0.2.zip',
        type: 'zip'
    },
    '26': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-26.zip',
        type: 'zip'
    }
};

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
                    resolve();
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
                                resolve();
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
                                resolve();
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
            const {stdout} = await execPromise('java -version 2>&1');
            const match = stdout.match(/version "([0-9]+)/);
            if (match && match[1]) return match[1];
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
            'C:\\Program Files\\OpenJDK'
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
            'C:\\Program Files\\OpenJDK'
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
        const zipPath = pendingLocalFile;
        const installPath = `C:\\Program Files\\Java\\jdk-${version}`;
        const sendProgress = (progress) => {
            mainWindow.webContents.send('download-progress', {type: 'jdk', version, progress});
        };
        try {
            sendProgress(0);
            await installZip(zipPath, installPath);
            sendProgress(1);
            const jdkRoot = installPath;
            const jdkBin = path.join(jdkRoot, 'bin');
            if (!fs.existsSync(jdkBin)) throw new Error('解压后未找到 bin 目录');
            await setSystemEnvVariable(`JAVA_HOME${version}`, jdkRoot);
            await setPathForVersion(version);
            mainWindow.webContents.send('jdk-changed');
            return {success: true, message: 'JDK 安装成功'};
        } catch (err) {
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
        const source = jdkSources[version];
        if (!source) return {success: false, message: `不支持的 JDK 版本: ${version}`};
        const {url} = source;
        const fileName = url.split('/').pop();
        const installerPath = path.join(downloadDir, fileName);
        const installPath = `C:\\Program Files\\Java\\jdk-${version}`;
        const sendProgress = (progress) => {
            mainWindow.webContents.send('download-progress', {type: 'jdk', version, progress});
        };
        const abortController = new AbortController();
        currentAbortController = abortController;
        try {
            if (!fs.existsSync(installerPath)) {
                sendProgress(0);
                await downloadFile(url, installerPath, sendProgress, abortController.signal);
                sendProgress(1);
            } else {
                sendProgress(1);
            }
            await installZip(installerPath, installPath);
            const jdkRoot = installPath;
            const jdkBin = path.join(jdkRoot, 'bin');
            if (!fs.existsSync(jdkBin)) throw new Error('解压后未找到 bin 目录');
            await setSystemEnvVariable(`JAVA_HOME${version}`, jdkRoot);
            await setPathForVersion(version);
            mainWindow.webContents.send('jdk-changed');
            return {success: true, message: 'JDK 安装成功'};
        } catch (err) {
            if (err.message === '下载已取消') {
                return {success: false, message: '下载已取消'};
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