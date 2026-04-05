const {ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const {exec} = require('child_process');
const axios = require('axios');
const AdmZip = require('adm-zip');
const {promisify} = require('util');
const execPromise = promisify(exec);
const configManager = require('../configManager.cjs');

module.exports = function registerMavenHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'maven_install.log');
    
    // 默认安装路径（作为后备）
    const MAVEN_INSTALL_DIR = 'C:\\Program Files\\Maven';

    // 从配置获取 Maven 下载信息
    function getMavenConfig() {
        return configManager.getToolConfig('maven');
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
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(installDir, true);
                const extracted = fs.readdirSync(installDir);
                const mavenSubDir = extracted.find(name => name.startsWith('apache-maven-'));
                if (mavenSubDir) {
                    const subPath = path.join(installDir, mavenSubDir);
                    const files = fs.readdirSync(subPath);
                    for (const file of files) {
                        const src = path.join(subPath, file);
                        const dest = path.join(installDir, file);
                        fs.renameSync(src, dest);
                    }
                    fs.rmdirSync(subPath);
                }
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

    function setPathForMaven() {
        return new Promise(async (resolve, reject) => {
            const targetEntry = `%MAVEN_HOME%\\bin`;
            const currentPath = await getSystemPath();
            const parts = currentPath.split(';');
            const newParts = [];
            for (const p of parts) {
                if (!/^%MAVEN_HOME%\\bin$/i.test(p)) {
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
            let expandedPath = systemPath;
            // 展开 %MAVEN_HOME% 等变量
            if (process.env.MAVEN_HOME) {
                expandedPath = expandedPath.replace(/%MAVEN_HOME%/g, process.env.MAVEN_HOME);
            }
            expandedPath = expandedPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
            process.env.Path = expandedPath;
        } catch (err) {
            logToFile(`刷新环境变量失败: ${err.message}`);
        }
    }

    // 获取当前系统默认的 JDK 路径（用于设置 JAVA_HOME）
    async function getCurrentJavaHome() {
        // 优先从 PATH 中的 java.exe 解析
        try {
            const {stdout} = await execPromise('where java', {shell: true});
            const javaPath = stdout.split('\r\n')[0];
            if (javaPath && fs.existsSync(javaPath)) {
                let javaHome = path.dirname(path.dirname(javaPath));
                if (fs.existsSync(path.join(javaHome, 'bin', 'java.exe'))) {
                    return javaHome;
                }
            }
        } catch (err) {
        }
        // 扫描常见 JDK 目录
        const commonJdkPaths = [
            'C:\\Program Files\\Java',
            'C:\\Program Files\\Eclipse Adoptium',
            'C:\\Program Files\\OpenJDK'
        ];
        for (const base of commonJdkPaths) {
            if (fs.existsSync(base)) {
                const dirs = fs.readdirSync(base);
                for (const dir of dirs) {
                    const javaExe = path.join(base, dir, 'bin', 'java.exe');
                    if (fs.existsSync(javaExe)) {
                        return path.join(base, dir);
                    }
                }
            }
        }
        return null;
    }

    async function checkJDK() {
        // 直接执行 java -version 检查是否可用
        try {
            const {stdout, stderr} = await execPromise('java -version 2>&1', {shell: true});
            const output = stdout + stderr;
            if (output.includes('version') || output.includes('java version')) return true;
        } catch (err) {
        }
        // 备用：扫描目录
        const javaHome = await getCurrentJavaHome();
        return javaHome !== null;
    }

    async function isMavenInstalled() {
        // 获取 JAVA_HOME 路径
        const javaHome = await getCurrentJavaHome();
        const env = {...process.env};
        if (javaHome) {
            env.JAVA_HOME = javaHome;
        }

        // 优先检查工具箱默认安装路径
        const defaultMvnCmd = path.join(MAVEN_INSTALL_DIR, 'bin', 'mvn.cmd');
        if (fs.existsSync(defaultMvnCmd)) {
            try {
                const {stdout} = await execPromise(`"${defaultMvnCmd}" --version`, {shell: true, env});
                if (stdout.includes('Apache Maven')) {
                    const versionMatch = stdout.match(/Apache Maven (\d+\.\d+\.\d+)/);
                    return {installed: true, version: versionMatch ? versionMatch[1] : ''};
                }
            } catch (err) {
                logToFile(`执行默认 Maven 失败: ${err.message}`);
            }
        }

        // 检查用户自定义路径 E:\develop\maven
        const userMavenHome = 'E:\\develop\\maven';
        const mvnCmdUser = path.join(userMavenHome, 'bin', 'mvn.cmd');
        if (fs.existsSync(mvnCmdUser)) {
            try {
                const {stdout} = await execPromise(`"${mvnCmdUser}" --version`, {shell: true, env});
                if (stdout.includes('Apache Maven')) {
                    const versionMatch = stdout.match(/Apache Maven (\d+\.\d+\.\d+)/);
                    return {installed: true, version: versionMatch ? versionMatch[1] : ''};
                }
            } catch (err) {
                logToFile(`执行 ${mvnCmdUser} 失败: ${err.message}`);
            }
        }

        // 尝试依赖 PATH 的 mvn --version
        try {
            const {stdout} = await execPromise('mvn --version', {shell: true, env});
            if (stdout.includes('Apache Maven')) {
                const versionMatch = stdout.match(/Apache Maven (\d+\.\d+\.\d+)/);
                return {installed: true, version: versionMatch ? versionMatch[1] : ''};
            }
        } catch (err) {
            logToFile(`mvn --version 执行失败: ${err.message}`);
        }

        // 检查环境变量 MAVEN_HOME
        const mavenHome = process.env.MAVEN_HOME;
        if (mavenHome && fs.existsSync(path.join(mavenHome, 'bin', 'mvn.cmd'))) {
            try {
                const {stdout} = await execPromise(`"${path.join(mavenHome, 'bin', 'mvn.cmd')}" --version`, {
                    shell: true,
                    env
                });
                if (stdout.includes('Apache Maven')) {
                    const versionMatch = stdout.match(/Apache Maven (\d+\.\d+\.\d+)/);
                    return {installed: true, version: versionMatch ? versionMatch[1] : ''};
                }
            } catch (err) {
            }
        }

        const commonPaths = [
            'C:\\Program Files\\Maven',
            'C:\\maven',
            path.join(process.env.USERPROFILE, 'maven')
        ];
        for (const dir of commonPaths) {
            const mvnCmd = path.join(dir, 'bin', 'mvn.cmd');
            if (fs.existsSync(mvnCmd)) {
                try {
                    const {stdout} = await execPromise(`"${mvnCmd}" --version`, {shell: true, env});
                    if (stdout.includes('Apache Maven')) {
                        const versionMatch = stdout.match(/Apache Maven (\d+\.\d+\.\d+)/);
                        return {installed: true, version: versionMatch ? versionMatch[1] : ''};
                    }
                } catch (err) {
                }
            }
        }

        return {installed: false, version: ''};
    }

    ipcMain.on('cancel-maven-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    ipcMain.handle('import-local-maven', async (event, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.zip') return {success: false, message: '只支持 .zip 文件'};
        const fileName = path.basename(filePath);
        const destPath = path.join(downloadDir, fileName);
        fs.copyFileSync(filePath, destPath);
        pendingLocalFile = destPath;
        return {success: true, message: 'Maven 安装包已导入，点击“开始安装”完成配置'};
    });

    ipcMain.handle('install-maven', async (event, useLocal = false) => {
        const jdkOk = await checkJDK();
        if (!jdkOk) {
            return {success: false, message: '未检测到 JDK，请先安装 JDK 后再安装 Maven'};
        }
        
        // 从配置获取 Maven 下载信息
        const mavenConfig = getMavenConfig();
        if (!mavenConfig) {
            return {success: false, message: '无法获取 Maven 配置'};
        }
        
        const installerPath = useLocal ? pendingLocalFile : path.join(downloadDir, 'maven.zip');
        if (!useLocal && !fs.existsSync(installerPath)) {
            const sendProgress = (progress) => {
                mainWindow.webContents.send('maven-progress', {type: 'maven', progress});
            };
            const abortController = new AbortController();
            currentAbortController = abortController;
            try {
                sendProgress(0);
                await downloadFile(mavenConfig.url, installerPath, sendProgress, abortController.signal);
                sendProgress(1);
            } catch (err) {
                if (err.message === '下载已取消') return {success: false, message: '下载已取消'};
                logToFile(`下载失败: ${err.message}`);
                return {success: false, message: `下载失败: ${err.message}`};
            } finally {
                if (currentAbortController === abortController) currentAbortController = null;
            }
        }
        if (useLocal && !pendingLocalFile) {
            return {success: false, message: '没有已导入的 Maven 安装包，请先导入'};
        }
        const zipPath = useLocal ? pendingLocalFile : installerPath;
        const installPath = mavenConfig.installDir || MAVEN_INSTALL_DIR;
        try {
            await installZip(zipPath, installPath);
            await setSystemEnvVariable('MAVEN_HOME', installPath);
            await setPathForMaven();
            // 刷新当前进程环境变量
            await refreshCurrentProcessEnv();
            // 延迟确保系统环境生效
            await new Promise(resolve => setTimeout(resolve, 500));
            if (!useLocal && fs.existsSync(installerPath)) {
                try {
                    fs.unlinkSync(installerPath);
                } catch (e) {
                }
            }
            if (useLocal && pendingLocalFile) {
                try {
                    fs.unlinkSync(pendingLocalFile);
                } catch (e) {
                }
                pendingLocalFile = null;
            }
            mainWindow.webContents.send('maven-changed');
            return {success: true, message: 'Maven 安装成功'};
        } catch (err) {
            logToFile(`安装失败: ${err.message}`);
            return {success: false, message: `安装失败: ${err.message}`};
        }
    });

    ipcMain.handle('check-maven', async () => {
        const {installed, version} = await isMavenInstalled();
        return {installed, version};
    });

    ipcMain.handle('uninstall-maven', async () => {
        try {
            const mavenConfig = getMavenConfig();
            const installPath = mavenConfig ? (mavenConfig.installDir || 'C:\\Program Files\\Maven') : 'C:\\Program Files\\Maven';
            if (fs.existsSync(installPath)) {
                fs.rmSync(installPath, {recursive: true, force: true});
            }
            await removeSystemEnvVariable('MAVEN_HOME');
            const currentPath = await getSystemPath();
            const parts = currentPath.split(';');
            const newParts = parts.filter(p => !/^%MAVEN_HOME%\\bin$/i.test(p));
            const newPath = newParts.join(';');
            const setxCmd = `C:\\Windows\\System32\\setx.exe /M PATH "${newPath}"`;
            await execPromise(setxCmd);
            await refreshCurrentProcessEnv();
            mainWindow.webContents.send('maven-changed');
            return {success: true, message: 'Maven 已卸载'};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });
};