const {ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const {exec} = require('child_process');
const {promisify} = require('util');
const execPromise = promisify(exec);
const configManager = require('../configManager.cjs');
const {downloadFile} = require('../utils/download.cjs');
const {installZip, zipProgress} = require('../utils/zip.cjs');
const {createLogger} = require('../utils/logger.cjs');
const sandbox = require('../utils/sandbox.cjs');

module.exports = function registerUvHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'uv_install.log');
    const logToFile = createLogger(logFile);

    let currentAbortController = null;

    function getUvConfig() {
        return configManager.getToolConfig('uv') || {};
    }

    async function probeUv(dir) {
        const exe = path.join(dir, 'uv.exe');
        if (!fs.existsSync(exe)) return null;
        try {
            const {stdout} = await execPromise(`"${exe}" --version`, {timeout: 20000});
            const match = stdout.match(/uv\s+(\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?)/i);
            return match ? match[1] : '';
        } catch (err) {
            logToFile(`执行 ${exe} 失败: ${err.message}`);
            return null;
        }
    }

    ipcMain.on('cancel-uv-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    ipcMain.handle('install-uv', async (event, version) => {
        const uvConfig = getUvConfig();
        if (!uvConfig || !uvConfig.versions) {
            return {success: false, message: '无法获取 uv 下载配置'};
        }
        const targetVersion = version || uvConfig.version;
        if (!targetVersion) {
            return {success: false, message: '无法确定 uv 版本'};
        }
        const versionEntry = uvConfig.versions[targetVersion];
        if (!versionEntry || !versionEntry.url) {
            return {success: false, message: `没有找到 uv ${targetVersion} 的下载地址`};
        }
        const downloadUrl = versionEntry.url;
        const installPath = sandbox.installDir('uv', targetVersion);
        const installerPath = path.join(downloadDir, 'uv.zip');

        const sendProgress = (progress, stage = '', meta = {}) => {
            mainWindow.webContents.send('uv-progress', {
                type: 'uv',
                progress,
                stage,
                speed: meta.speed || 0,
                eta: typeof meta.eta === 'number' ? meta.eta : null,
                received: meta.received || 0,
                total: meta.total || null,
            });
        };

        const abortController = new AbortController();
        currentAbortController = abortController;
        try {
            sendProgress(0, '下载安装包');
            await downloadFile({
                url: downloadUrl,
                destPath: installerPath,
                signal: abortController.signal,
                onProgress: (info) => sendProgress((info.percent ?? 0) * 0.7, info.retrying ? `网络中断，正在重试（${info.attempt}/3）` : '下载安装包', info),
                log: logToFile,
                label: 'uv下载',
                timeout: 600000,
            });
            sendProgress(0.7, '解压中');
            await installZip(installerPath, installPath, {log: logToFile, onProgress: zipProgress(sendProgress, 0.7, 0.88)});
            if (!fs.existsSync(path.join(installPath, 'uv.exe'))) {
                throw new Error('压缩包内没有找到 uv.exe');
            }
            sendProgress(0.9, '加入沙箱环境');
            sandbox.register('uv', targetVersion, installPath, {activate: true});
            sendProgress(1, '安装完成');
            mainWindow.webContents.send('uv-changed');
            return {success: true, message: 'uv 安装成功，可在「沐柠环境终端」中直接使用 uv', version: targetVersion};
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

    ipcMain.handle('check-uv', async () => {
        const items = sandbox.listInstalled('uv');
        const activeDir = sandbox.getActiveDir('uv');
        let version = '';
        if (activeDir) {
            const probed = await probeUv(activeDir);
            if (probed) version = probed;
        }
        return {
            installed: items.length > 0,
            version,
            versions: items.map(item => item.version),
            default: sandbox.getActive('uv'),
            items
        };
    });

    ipcMain.handle('switch-uv', async (event, version) => {
        try {
            if (!version) return {success: false, message: '缺少版本号'};
            sandbox.setActive('uv', version);
            mainWindow.webContents.send('uv-changed');
            return {success: true, message: `已切换到 uv ${version}`, version};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('uninstall-uv', async (event, version) => {
        try {
            const target = version || sandbox.getActive('uv');
            const dir = target ? sandbox.installDir('uv', target) : sandbox.getActiveDir('uv');
            if (dir && fs.existsSync(dir)) {
                fs.rmSync(dir, {recursive: true, force: true});
            }
            if (target) sandbox.unregister('uv', target);
            mainWindow.webContents.send('uv-changed');
            return {success: true, message: 'uv 已卸载'};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });
};
