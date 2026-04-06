const {app, BrowserWindow, ipcMain, protocol, dialog, Menu} = require('electron');
const path = require('path');
const fs = require('fs');
const configManager = require('./configManager.cjs');
const registerJDKHandlers = require('./handlers/jdk.cjs');
const registerPythonHandlers = require('./handlers/python.cjs');
const registerMysqlHandlers = require('./handlers/mysql.cjs');
const registerRedisHandlers = require('./handlers/redis.cjs');
const registerMavenHandlers = require('./handlers/maven.cjs');
const registerNginxHandlers = require('./handlers/nginx.cjs');

let mainWindow;

const logFile = path.join(app.getPath('userData'), 'app_protocol.log');

function logToFile(message) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
}

protocol.registerSchemesAsPrivileged([
    {
        scheme: 'app',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            bypassCSP: true,
            allowServiceWorkers: true
        }
    }
]);

function createWindow() {
    Menu.setApplicationMenu(null);

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        icon: path.join(__dirname, '../build/icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs'),
        }
    });

    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173').then(r => r);
    } else {
        mainWindow.loadURL('app://index.html').then(r => r);
        mainWindow.webContents.closeDevTools();
    }

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            event.preventDefault();
        }
        if (input.key === 'F12') {
            event.preventDefault();
        }
    });

    mainWindow.webContents.on('context-menu', (event) => {
        event.preventDefault();
    });
}

app.whenReady().then(() => {
    // 初始化配置管理器
    configManager.initConfig(app.getPath('userData'));
    registerNginxHandlers(mainWindow, app.getPath('userData'));
    protocol.handle('app', async (request) => {
        let filePath = request.url.slice('app://'.length);
        if (filePath.includes('?')) filePath = filePath.split('?')[0];
        filePath = filePath.replace(/^\.?\//, '').replace(/\/+/g, '/');
        if (filePath.startsWith('index.html/')) {
            filePath = filePath.slice('index.html/'.length);
        }
        if (filePath === '' || filePath === 'index.html') filePath = 'index.html';

        const realPath = path.join(__dirname, '../dist', filePath);
        const logMsg = `Request: ${request.url} -> ${realPath} (exists: ${fs.existsSync(realPath)})`;
        console.log(logMsg);
        logToFile(logMsg);

        if (!fs.existsSync(realPath)) {
            return new Response(`File not found: ${realPath}`, {status: 404});
        }

        const fileContent = fs.readFileSync(realPath);
        const ext = path.extname(realPath).toLowerCase();
        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
        };
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        return new Response(fileContent, {
            status: 200,
            headers: {'Content-Type': mimeType}
        });

    });

    createWindow();
    registerJDKHandlers(mainWindow, app.getPath('userData'));
    registerPythonHandlers(mainWindow, app.getPath('userData'));
    registerMysqlHandlers(mainWindow, app.getPath('userData'));
    registerRedisHandlers(mainWindow, app.getPath('userData'));
    registerMavenHandlers(mainWindow, app.getPath('userData'));

    ipcMain.handle('get-system-stats', async () => {
        const os = require('os');
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const getCpuUsage = () => {
            const start = os.cpus().map(cpu => cpu.times);
            return new Promise((resolve) => {
                setTimeout(() => {
                    const end = os.cpus().map(cpu => cpu.times);
                    const usage = start.map((s, i) => {
                        const idle = end[i].idle - s.idle;
                        const total = (end[i].user + end[i].nice + end[i].sys + end[i].idle + end[i].irq) - (s.user + s.nice + s.sys + s.idle + s.irq);
                        return 1 - idle / total;
                    });
                    const avgUsage = usage.reduce((a, b) => a + b, 0) / usage.length;
                    resolve(avgUsage * 100);
                }, 100);
            });
        };
        const cpuUsage = await getCpuUsage();
        return {
            cpu: Math.round(cpuUsage),
            memory: Math.round((totalMem - freeMem) / totalMem * 100)
        };
    });

    ipcMain.handle('get-username', async () => {
        const os = require('os');
        return os.userInfo().username;
    });

    ipcMain.handle('get-cache-size', async () => {
        const downloadDir = path.join(app.getPath('userData'), 'downloads');
        const logsDir = app.getPath('userData');
        let cacheSize = 0;
        let logsSize = 0;
        const getFolderSize = (folder) => {
            if (!fs.existsSync(folder)) return 0;
            let size = 0;
            const files = fs.readdirSync(folder);
            for (const file of files) {
                const filePath = path.join(folder, file);
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    size += getFolderSize(filePath);
                } else {
                    size += stat.size;
                }
            }
            return size;
        };
        if (fs.existsSync(downloadDir)) cacheSize = getFolderSize(downloadDir);
        const logFiles = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
        for (const log of logFiles) {
            const stat = fs.statSync(path.join(logsDir, log));
            logsSize += stat.size;
        }
        return {cacheSize, logsSize};
    });

    ipcMain.handle('clear-cache', async () => {
        const downloadDir = path.join(app.getPath('userData'), 'downloads');
        if (fs.existsSync(downloadDir)) {
            fs.rmSync(downloadDir, {recursive: true, force: true});
            fs.mkdirSync(downloadDir);
        }
        return {success: true};
    });

    ipcMain.handle('clear-logs', async () => {
        const logsDir = app.getPath('userData');
        const logFiles = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
        for (const log of logFiles) {
            fs.unlinkSync(path.join(logsDir, log));
        }
        return {success: true};
    });

    ipcMain.handle('get-version-info', async () => {
        return {
            version: app.getVersion(),
            electron: process.versions.electron,
            node: process.versions.node,
            chrome: process.versions.chrome
        };
    });

    ipcMain.handle('open-github', async () => {
        const {shell} = require('electron');
        await shell.openExternal('https://github.com/Auspicious3798/muling-dev-toolbox');
    });

    ipcMain.handle('set-proxy', async (event, proxy) => {
        if (proxy && proxy.trim() !== '') {
            process.env.HTTP_PROXY = proxy;
            process.env.HTTPS_PROXY = proxy;
        } else {
            delete process.env.HTTP_PROXY;
            delete process.env.HTTPS_PROXY;
        }
        return {success: true};
    });

    ipcMain.on('select-install-path', async (event) => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: '选择 JDK 安装目录'
        });
        if (!result.canceled && result.filePaths.length > 0) {
            event.reply('selected-install-path', result.filePaths[0]);
        }
    });

    ipcMain.handle('open-file-dialog', async (event, options) => {
        const result = await dialog.showOpenDialog(mainWindow, options);
        if (result.canceled) return null;
        return result.filePaths[0];
    });

    ipcMain.handle('check-path-exists', async (event, dirPath) => {
        try {
            const fs = require('fs');
            if (!fs.existsSync(dirPath)) return false;
            const files = fs.readdirSync(dirPath);
            return files.length > 0;
        } catch (err) {
            return false;
        }
    });

    ipcMain.handle('get-user-data-path', () => app.getPath('userData'));

    // 配置管理 IPC
    ipcMain.handle('get-download-config', () => {
        return configManager.getConfig();
    });

    ipcMain.handle('set-mirror', (event, mirrorUrl) => {
        const success = configManager.setCurrentMirror(mirrorUrl);
        return { success };
    });

    ipcMain.handle('get-mirrors', () => {
        return configManager.getMirrors();
    });

    ipcMain.handle('get-tool-config', (event, toolName, version) => {
        return configManager.getToolConfig(toolName, version);
    });

    // 测试镜像源速度
    ipcMain.handle('test-mirror-speed', async () => {
        const https = require('https');
        let mirrors = configManager.getMirrors();
        
        // 确保有镜像可测
        if (!mirrors || mirrors.length === 0) {
            mirrors = [
                { name: '默认 (ghfast.top)', url: 'https://ghfast.top/' },
                { name: 'ghproxy.com', url: 'https://ghproxy.com/' },
                { name: 'mirror.ghproxy.com', url: 'https://mirror.ghproxy.com/' }
            ];
        }
        
        const results = [];

        const testMirror = (mirror) => {
            return new Promise((resolve) => {
                const startTime = Date.now();
                // 尝试获取一个小文件来测试延迟和带宽
                const testUrl = mirror.url.replace(/\/$/, '') + '/https://github.com/robots.txt';
                
                const req = https.get(testUrl, {
                    timeout: 5000,
                    rejectUnauthorized: false, // 忽略可能的证书问题
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                }, (res) => {
                    const endTime = Date.now();
                    const duration = endTime - startTime;
                    res.resume();
                    res.on('end', () => {
                        resolve({ url: mirror.url, name: mirror.name, duration, success: true, statusCode: res.statusCode });
                    });
                });
                
                req.on('error', (err) => {
                    console.error(`[Mirror Test] ${mirror.name} Error:`, err.message);
                    resolve({ url: mirror.url, name: mirror.name, duration: -1, success: false, error: err.message });
                });
                
                req.on('timeout', () => {
                    req.destroy();
                    resolve({ url: mirror.url, name: mirror.name, duration: -1, success: false, error: 'Timeout' });
                });
            });
        };

        for (const mirror of mirrors) {
            const result = await testMirror(mirror);
            results.push(result);
            console.log(`[Mirror Test] ${mirror.name}: ${result.success ? result.duration + 'ms' : '失败'}`);
        }

        // 找到最快的镜像
        const successfulMirrors = results.filter(r => r.success);
        if (successfulMirrors.length > 0) {
            successfulMirrors.sort((a, b) => a.duration - b.duration);
            const fastestUrl = successfulMirrors[0].url;
            
            // 更新配置中的推荐标记
            const config = configManager.getConfig();
            if (config && config.mirrors) {
                config.mirrors.forEach(m => {
                    m.recommended = (m.url === fastestUrl);
                });
                configManager.saveConfig();
                console.log(`[Mirror Test] 推荐镜像已更新: ${fastestUrl}`);
            }
        }

        return results;
    });

    ipcMain.on('minimize-window', () => mainWindow.minimize());
    ipcMain.on('maximize-window', () => {
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
    });
    ipcMain.on('close-window', () => mainWindow.close());
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});