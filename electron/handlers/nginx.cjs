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
            const sendProgress = (progress, stage = '') => {
                if (mainWindow && mainWindow.webContents) {
                    setImmediate(() => {
                        mainWindow.webContents.send('nginx-progress', {type: 'nginx', progress, stage});
                    });
                }
            };
            const abortController = new AbortController();
            currentAbortController = abortController;
            try {
                sendProgress(0, '下载安装包');
                await downloadFile(downloadUrl, installerPath, (p) => sendProgress(p * 0.5, '下载安装包'), abortController.signal);
                sendProgress(0.5, '解压中');
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
            const sendProgress = (progress, stage = '') => {
                if (mainWindow && mainWindow.webContents) {
                    setImmediate(() => {
                        mainWindow.webContents.send('nginx-progress', {type: 'nginx', progress, stage});
                    });
                }
            };
            
            sendProgress(0.5, '解压中');
            await installZip(zipPath, installPath);
            sendProgress(0.8, '生成配置');
            const sites = await loadSites();
            await generateConfig(sites, installPath);
            sendProgress(1, '安装完成');
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
                // 添加 -p 参数，与启动时的 prefix 保持一致
                await execPromise(`"${nginxExe}" -p "${installPath}" -s stop`, {windowsHide: true});
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
            
            // 使用 spawn 在 Nginx 目录下启动
            const {spawn} = require('child_process');
            const nginxProcess = spawn(nginxExe, ['-p', installPath], {
                cwd: installPath,
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            });
            
            nginxProcess.unref();
            
            logToFile(`尝试启动 Nginx，工作目录: ${installPath}`);
            
            setTimeout(async () => {
                const stillRunning = await isNginxRunning();
                if (stillRunning) {
                    logToFile('Nginx 启动成功');
                } else {
                    logToFile('Nginx 启动失败，请检查配置文件和日志');
                }
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
            // 添加 -p 参数，与启动时的 prefix 保持一致
            await execPromise(`"${nginxExe}" -p "${installPath}" -s stop`, {windowsHide: true});
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
            const nginxConf = path.join(installPath, 'conf', 'nginx.conf');
            
            if (!fs.existsSync(nginxExe)) return {success: false, message: 'Nginx 未安装'};
            if (!fs.existsSync(nginxConf)) return {success: false, message: 'Nginx 配置文件不存在'};
            
            const running = await isNginxRunning();
            if (!running) return {success: false, message: 'Nginx 未运行'};
            
            const sites = await loadSites();
            await generateConfig(sites, installPath);
            
            // 重载时 master 已记住 prefix，只需发送 reload 信号
            await execPromise(`"${nginxExe}" -p "${installPath}" -s reload`, {windowsHide: true});
            logToFile('Nginx 重载成功');
            return {success: true, message: 'Nginx 配置已重载'};
        } catch (err) {
            logToFile(`Nginx 重载失败: ${err.message}`);
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('add-nginx-site', async (event, {name, path: distPath, port}) => {
        logToFile(`尝试添加站点: name=${name}, path=${distPath}, port=${port}`);
        
        // 检查 Nginx 是否安装
        const nginxConfig = getNginxConfig();
        if (!nginxConfig) {
            return {success: false, message: '无法获取 Nginx 配置'};
        }
        let installPath = nginxConfig.installDir || DEFAULT_INSTALL_DIR;
        installPath = installPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
        if (!path.isAbsolute(installPath)) {
            installPath = path.join(userDataPath, installPath);
        }
        
        const nginxExe = path.join(installPath, 'nginx.exe');
        if (!fs.existsSync(nginxExe)) {
            return {success: false, message: 'Nginx 未安装，请先安装 Nginx'};
        }
        
        // 验证 dist 目录
        if (!distPath || !fs.existsSync(distPath)) {
            return {success: false, message: 'dist 目录不存在'};
        }
        
        let sites = await loadSites();
        
        // 检查端口
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
        
        // 检查站点名称
        if (sites.some(s => s.name === name)) {
            return {success: false, message: '站点名称已存在'};
        }
        
        // 添加站点
        sites.push({name, path: distPath, port: finalPort});
        await saveSites(sites);
        logToFile(`站点已保存: ${name}, 端口: ${finalPort}`);
        
        // 重新生成配置文件
        try {
            await generateConfig(sites, installPath);
            logToFile('Nginx 配置文件已更新');
        } catch (err) {
            logToFile(`生成配置文件失败: ${err.message}`);
            return {success: false, message: `生成配置文件失败: ${err.message}`};
        }
        
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

    // 更新站点信息
    ipcMain.handle('update-nginx-site', async (event, {originalPort, name, path: distPath, port}) => {
        logToFile(`尝试更新站点: originalPort=${originalPort}, name=${name}, path=${distPath}, port=${port}`);
        
        // 检查 Nginx 是否安装
        const nginxConfig = getNginxConfig();
        if (!nginxConfig) {
            return {success: false, message: '无法获取 Nginx 配置'};
        }
        let installPath = nginxConfig.installDir || DEFAULT_INSTALL_DIR;
        installPath = installPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
        if (!path.isAbsolute(installPath)) {
            installPath = path.join(userDataPath, installPath);
        }
        
        const nginxExe = path.join(installPath, 'nginx.exe');
        if (!fs.existsSync(nginxExe)) {
            return {success: false, message: 'Nginx 未安装，请先安装 Nginx'};
        }
        
        // 验证 dist 目录
        if (!distPath || !fs.existsSync(distPath)) {
            return {success: false, message: 'dist 目录不存在'};
        }
        
        let sites = await loadSites();
        
        // 查找原始站点
        const siteIndex = sites.findIndex(s => s.port === originalPort);
        if (siteIndex === -1) {
            return {success: false, message: '站点不存在'};
        }
        
        // 如果修改了端口，需要检查新端口是否可用
        let finalPort = port || originalPort;
        if (finalPort !== originalPort) {
            // 检查新端口是否被其他站点使用
            if (sites.some(s => s.port === finalPort && s.port !== originalPort)) {
                return {success: false, message: `端口 ${finalPort} 已被其他站点使用`};
            }
            // 检查端口是否被系统占用
            if (!(await checkPortAvailable(finalPort, sites.filter(s => s.port !== originalPort)))) {
                return {success: false, message: `端口 ${finalPort} 已被系统进程占用`};
            }
        }
        
        // 检查站点名称是否与其他站点重复（排除自己）
        if (sites.some(s => s.name === name && s.port !== originalPort)) {
            return {success: false, message: '站点名称已存在'};
        }
        
        // 更新站点
        sites[siteIndex] = {name, path: distPath, port: finalPort};
        await saveSites(sites);
        logToFile(`站点已更新: ${name}, 端口: ${finalPort}`);
        
        // 重新生成配置文件
        try {
            await generateConfig(sites, installPath);
            logToFile('Nginx 配置文件已更新');
        } catch (err) {
            logToFile(`生成配置文件失败: ${err.message}`);
            return {success: false, message: `生成配置文件失败: ${err.message}`};
        }
        
        return {success: true, port: finalPort};
    });

    // 检查端口是否可用
    ipcMain.handle('check-port-available', async (event, port) => {
        try {
            const sites = await loadSites();
            const available = await checkPortAvailable(port, sites);
            return {available};
        } catch (err) {
            logToFile(`检查端口失败: ${err.message}`);
            return {available: true}; // 出错时默认认为可用
        }
    });
};