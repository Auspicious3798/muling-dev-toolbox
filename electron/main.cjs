const {app, BrowserWindow, ipcMain, protocol, dialog} = require('electron');
const path = require('path');
const fs = require('fs');
const registerJDKHandlers = require('./handlers/jdk.cjs');
const registerPythonHandlers = require('./handlers/python.cjs');
const registerMysqlHandlers = require('./handlers/mysql.cjs');
const registerRedisHandlers = require('./handlers/redis.cjs');
const registerMavenHandlers = require('./handlers/maven.cjs');

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
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        icon: path.join(__dirname, '../build/icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs')
        }
    });

    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173').then(r => r);
    } else {
        mainWindow.loadURL('app://index.html').then(r => r);
    }
}

app.whenReady().then(() => {
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
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});