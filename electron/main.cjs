const {app, BrowserWindow, ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const {exec} = require('child_process');
const axios = require('axios');

let mainWindow;

const jdkUrls = {
    '21': 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.2%2B13/OpenJDK21U-jdk_x64_windows_hotspot_21.0.2_13.msi',
    '17': 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jdk_x64_windows_hotspot_17.0.10_7.msi'
};

const downloadDir = path.join(app.getPath('userData'), 'downloads');
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

async function downloadFile(url, destPath, onProgress) {
    const writer = fs.createWriteStream(destPath);
    const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream'
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
    });
}

function installMsi(msiPath) {
    return new Promise((resolve, reject) => {
        const cmd = `msiexec /i "${msiPath}" /quiet /norestart`;
        exec(cmd, {windowsHide: true}, (error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function addToSystemPath(dir) {
    return new Promise((resolve, reject) => {
        const psScript = `
      $newPath = "${dir};" + [Environment]::GetEnvironmentVariable("Path", "Machine")
      [Environment]::SetEnvironmentVariable("Path", $newPath, "Machine")
      $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine")
    `;
        exec(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, (error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

ipcMain.handle('install-jdk', async (event, version) => {
    const sendProgress = (progress) => {
        mainWindow.webContents.send('download-progress', { type: 'jdk', version, progress });
    };

    try {
        // 模拟下载进度
        for (let p = 0.1; p <= 1; p += 0.1) {
            sendProgress(p);
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // 模拟安装延迟
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 返回成功（不会安装任何东西）
        return { success: true, message: 'JDK 安装成功（模拟模式）' };
    } catch (err) {
        return { success: false, message: `模拟安装失败: ${err.message}` };
    }
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 600,
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
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html')).then(r => r);
    }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});