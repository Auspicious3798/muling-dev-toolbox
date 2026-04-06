const {ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const {exec} = require('child_process');
const axios = require('axios');
const https = require('https');
const AdmZip = require('adm-zip');
const {promisify} = require('util');
const execPromise = promisify(exec);
const configManager = require('../configManager.cjs');

const httpsAgent = new https.Agent({rejectUnauthorized: false});

module.exports = function registerNginxHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'nginx_install.log');
    const DEFAULT_INSTALL_DIR = path.join(userDataPath, 'nginx');

    function getNginxConfig() {
        const config = configManager.getToolConfig('nginx');
        if (!config) {
            logToFile('警告：无法获取 Nginx 配置，使用默认配置');
            // 返回默认配置作为后备
            return {
                version: '1.26.3',
                installDir: 'C:\\Program Files\\muling\\muling-env-box\\Nginx',
                url: '{mirror}https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v6.0.0/nginx-1.26.3.zip',
                type: 'zip'
            };
        }
        logToFile(`成功获取 Nginx 配置，installDir: ${config.installDir}`);
        return config;
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
            signal,
            httpsAgent: httpsAgent
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
                const items = fs.readdirSync(installDir);
                const nginxSubDir = items.find(item => item.startsWith('nginx-') && fs.statSync(path.join(installDir, item)).isDirectory());
                if (nginxSubDir) {
                    const subPath = path.join(installDir, nginxSubDir);
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

    async function loadSites() {
        const sitesFile = path.join(userDataPath, 'nginx_sites.json');
        if (!fs.existsSync(sitesFile)) return [];
        try {
            return JSON.parse(fs.readFileSync(sitesFile, 'utf8'));
        } catch {
            return [];
        }
    }

    async function saveSites(sites) {
        const sitesFile = path.join(userDataPath, 'nginx_sites.json');
        fs.writeFileSync(sitesFile, JSON.stringify(sites, null, 2), 'utf8');
    }

    async function isNginxRunning() {
        try {
            const {stdout} = await execPromise('tasklist /FI "IMAGENAME eq nginx.exe"');
            return stdout.includes('nginx.exe');
        } catch {
            return false;
        }
    }

    async function generateConfig(sites, nginxDir) {
        const nginxConf = path.join(nginxDir, 'conf', 'nginx.conf');
        let config = `events { worker_connections 1024; }
http {
    include mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;

`;
        for (const site of sites) {
            const rootPath = site.path.replace(/\\/g, '/');
            config += `    server {
        listen ${site.port};
        server_name localhost;
        location / {
            root ${rootPath};
            index index.html;
            try_files $uri $uri/ /index.html;
        }
    }

`;
        }
        config += `}\n`;
        fs.writeFileSync(nginxConf, config, 'utf8');
        logToFile(`配置文件已生成，站点数：${sites.length}`);
    }

    async function checkPortAvailable(port, sites) {
        try {
            const {stdout} = await execPromise(`netstat -ano | findstr :${port}`);
            if (stdout.trim()) return false;
        } catch {
        }
        return !sites.some(s => s.port === port);
    }

    ipcMain.on('cancel-nginx-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    ipcMain.handle('import-local-nginx', async (event, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.zip') return {success: false, message: '只支持 .zip 文件'};
        const fileName = path.basename(filePath);
        const destPath = path.join(downloadDir, fileName);
        fs.copyFileSync(filePath, destPath);
        pendingLocalFile = destPath;
        return {success: true, message: 'Nginx 安装包已导入，点击“开始安装”完成配置'};
    });

    ipcMain.handle('install-nginx', async (event, useLocal = false) => {
        const nginxConfig = getNginxConfig();
        if (!nginxConfig) {
            return {success: false, message: '无法获取 Nginx 配置'};
        }

        let mirror = configManager.getCurrentMirror ? configManager.getCurrentMirror() : 'https://ghfast.top/';
        let downloadUrl = nginxConfig.url.replace('{mirror}', mirror);

        const installerPath = useLocal ? pendingLocalFile : path.join(downloadDir, 'nginx.zip');
        if (!useLocal && !fs.existsSync(installerPath)) {
            const sendProgress = (progress) => {
                if (mainWindow && mainWindow.webContents) {
                    setImmediate(() => {
                        mainWindow.webContents.send('nginx-progress', {type: 'nginx', progress});
                    });
                }
            };
            const abortController = new AbortController();
            currentAbortController = abortController;
            try {
                sendProgress(0);
                await downloadFile(downloadUrl, installerPath, sendProgress, abortController.signal);
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
            return {success: false, message: '没有已导入的 Nginx 安装包，请先导入'};
        }
        const zipPath = useLocal ? pendingLocalFile : installerPath;
        let installPath = nginxConfig.installDir || DEFAULT_INSTALL_DIR;
        installPath = installPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
        if (!path.isAbsolute(installPath)) {
            installPath = path.join(userDataPath, installPath);
        }
        try {
            await installZip(zipPath, installPath);
            const sites = await loadSites();
            await generateConfig(sites, installPath);
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
            if (mainWindow && mainWindow.webContents) {
                setImmediate(() => {
                    mainWindow.webContents.send('nginx-changed');
                });
            }
            return {success: true, message: 'Nginx 安装成功'};
        } catch (err) {
            logToFile(`安装失败: ${err.message}`);
            // 检查是否是权限错误
            if (err.code === 'EPERM' || err.code === 'EACCES') {
                return {
                    success: false,
                    message: '安装失败：没有权限写入该目录。请右键点击应用，选择“以管理员身份运行”后重试。'
                };
            }
            return {success: false, message: `安装失败：${err.message}`};
        }
    });

    ipcMain.handle('install-nginx-from-local', async (event) => {
        return await ipcMain._events['install-nginx'](event, true);
    });

    ipcMain.handle('check-nginx', async () => {
        const nginxConfig = getNginxConfig();
        let installPath = nginxConfig ? (nginxConfig.installDir || DEFAULT_INSTALL_DIR) : DEFAULT_INSTALL_DIR;
        installPath = installPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
        if (!path.isAbsolute(installPath)) {
            installPath = path.join(userDataPath, installPath);
        }
        const nginxExe = path.join(installPath, 'nginx.exe');
        const installed = fs.existsSync(nginxExe);
        let version = '';
        if (installed) {
            try {
                const {stdout} = await execPromise(`"${nginxExe}" -v 2>&1`);
                const match = stdout.match(/nginx\/(\d+\.\d+\.\d+)/);
                if (match) version = match[1];
            } catch (e) {
            }
        }
        return {installed, version};
    });

    ipcMain.handle('uninstall-nginx', async () => {
        try {
            const nginxConfig = getNginxConfig();
            let installPath = nginxConfig ? (nginxConfig.installDir || DEFAULT_INSTALL_DIR) : DEFAULT_INSTALL_DIR;
            installPath = installPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
            if (!path.isAbsolute(installPath)) {
                installPath = path.join(userDataPath, installPath);
            }
            const nginxExe = path.join(installPath, 'nginx.exe');
            const running = await isNginxRunning();
            if (running) {
                await execPromise(`"${nginxExe}" -s stop`, {windowsHide: true});
            }
            if (fs.existsSync(installPath)) {
                fs.rmSync(installPath, {recursive: true, force: true});
            }
            const sitesFile = path.join(userDataPath, 'nginx_sites.json');
            if (fs.existsSync(sitesFile)) fs.unlinkSync(sitesFile);
            if (mainWindow && mainWindow.webContents) {
                setImmediate(() => {
                    mainWindow.webContents.send('nginx-changed');
                });
            }
            return {success: true, message: 'Nginx 已卸载'};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('get-nginx-sites', async () => {
        const sites = await loadSites();
        return {sites};
    });

    ipcMain.handle('get-nginx-status', async () => {
        const running = await isNginxRunning();
        return {running};
    });

    ipcMain.handle('start-nginx', async () => {
        try {
            const nginxConfig = getNginxConfig();
            let installPath = nginxConfig ? (nginxConfig.installDir || DEFAULT_INSTALL_DIR) : DEFAULT_INSTALL_DIR;
            installPath = installPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
            if (!path.isAbsolute(installPath)) {
                installPath = path.join(userDataPath, installPath);
            }
            const nginxExe = path.join(installPath, 'nginx.exe');
            if (!fs.existsSync(nginxExe)) return {success: false, message: 'Nginx 未安装'};
            const running = await isNginxRunning();
            if (running) return {success: false, message: 'Nginx 已在运行'};
            const sites = await loadSites();
            await generateConfig(sites, installPath);
            const startCmd = `start "" "${nginxExe}"`;
            exec(startCmd, {windowsHide: true});
            setTimeout(async () => {
                const stillRunning = await isNginxRunning();
                if (!stillRunning) logToFile('Nginx 启动失败，请检查配置文件');
            }, 2000);
            return {success: true, message: 'Nginx 已启动'};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('stop-nginx', async () => {
        try {
            const nginxConfig = getNginxConfig();
            let installPath = nginxConfig ? (nginxConfig.installDir || DEFAULT_INSTALL_DIR) : DEFAULT_INSTALL_DIR;
            installPath = installPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
            if (!path.isAbsolute(installPath)) {
                installPath = path.join(userDataPath, installPath);
            }
            const nginxExe = path.join(installPath, 'nginx.exe');
            if (!fs.existsSync(nginxExe)) return {success: false, message: 'Nginx 未安装'};
            const running = await isNginxRunning();
            if (!running) return {success: false, message: 'Nginx 未运行'};
            await execPromise(`"${nginxExe}" -s stop`, {windowsHide: true});
            return {success: true, message: 'Nginx 已停止'};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('reload-nginx', async () => {
        try {
            const nginxConfig = getNginxConfig();
            let installPath = nginxConfig ? (nginxConfig.installDir || DEFAULT_INSTALL_DIR) : DEFAULT_INSTALL_DIR;
            installPath = installPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
            if (!path.isAbsolute(installPath)) {
                installPath = path.join(userDataPath, installPath);
            }
            const nginxExe = path.join(installPath, 'nginx.exe');
            if (!fs.existsSync(nginxExe)) return {success: false, message: 'Nginx 未安装'};
            const running = await isNginxRunning();
            if (!running) return {success: false, message: 'Nginx 未运行'};
            const sites = await loadSites();
            await generateConfig(sites, installPath);
            await execPromise(`"${nginxExe}" -s reload`, {windowsHide: true});
            return {success: true, message: 'Nginx 配置已重载'};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('add-nginx-site', async (event, {name, path: distPath, port}) => {
        let sites = await loadSites();
        if (!distPath || !fs.existsSync(distPath)) {
            return {success: false, message: 'dist 目录不存在'};
        }
        let finalPort = port;
        if (!finalPort || finalPort <= 0) {
            let candidate = 8080;
            while (!(await checkPortAvailable(candidate, sites))) candidate++;
            finalPort = candidate;
        } else {
            if (!(await checkPortAvailable(finalPort, sites))) {
                return {success: false, message: `端口 ${finalPort} 已被占用或已被其他站点使用`};
            }
        }
        if (sites.some(s => s.name === name)) {
            return {success: false, message: '站点名称已存在'};
        }
        sites.push({name, path: distPath, port: finalPort});
        await saveSites(sites);
        return {success: true, port: finalPort};
    });

    ipcMain.handle('delete-nginx-site', async (event, port) => {
        let sites = await loadSites();
        const newSites = sites.filter(s => s.port !== port);
        if (newSites.length === sites.length) {
            return {success: false, message: '站点不存在'};
        }
        await saveSites(newSites);
        return {success: true};
    });
};