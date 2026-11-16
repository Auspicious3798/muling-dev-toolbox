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

module.exports = function registerNodejsHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'nodejs_install.log');
    const logToFile = createLogger(logFile);

    let currentAbortController = null;

    function getNodejsConfig() {
        return configManager.getToolConfig('nodejs') || {};
    }

    function ensureNpmMirror(installPath) {
        const etcDir = path.join(installPath, 'etc');
        const npmrcFile = path.join(etcDir, 'npmrc');
        const content = [
            'registry=https://registry.npmmirror.com/',
            '',
        ].join('\n');
        try {
            fs.mkdirSync(etcDir, {recursive: true});
            fs.writeFileSync(npmrcFile, content, 'utf8');
            return npmrcFile;
        } catch (err) {
            logToFile(`写入 npm 镜像配置失败: ${err.message}`);
            return null;
        }
    }

    async function probeNode(dir) {
        const exe = path.join(dir, 'node.exe');
        if (!fs.existsSync(exe)) return null;
        try {
            const {stdout} = await execPromise(`"${exe}" -v`, {shell: true, timeout: 30000});
            const match = stdout.match(/v(\d+\.\d+\.\d+)/);
            return match ? match[1] : null;
        } catch (err) {
            logToFile(`执行 ${exe} -v 失败: ${err.message}`);
            return null;
        }
    }

    ipcMain.on('cancel-nodejs-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    ipcMain.handle('install-nodejs', async (event, version) => {
        const nodeConfig = getNodejsConfig();
        const targetVersion = version || nodeConfig.version;
        if (!targetVersion) {
            return {success: false, message: '无法确定 Node.js 版本'};
        }
        const versionEntry = (nodeConfig.versions && nodeConfig.versions[targetVersion]) || null;
        const downloadUrl = (versionEntry && versionEntry.url) || nodeConfig.url;
        if (!downloadUrl) {
            return {success: false, message: `没有找到 Node.js ${targetVersion} 的下载地址`};
        }
        const installPath = sandbox.installDir('nodejs', targetVersion);
        const installerPath = path.join(downloadDir, `node-v${targetVersion}-win-x64.zip`);

        const sendProgress = (progress, stage = '', meta = {}) => {
            mainWindow.webContents.send('nodejs-progress', {
                type: 'nodejs',
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
                onProgress: (info) => sendProgress((info.percent ?? 0) * 0.6, info.retrying ? `网络中断，正在重试（${info.attempt}/3）` : '下载安装包', info),
                log: logToFile,
                label: 'Node.js下载',
                timeout: 600000,
            });
            sendProgress(0.6, '解压中');
            await installZip(installerPath, installPath, {log: logToFile, flattenPrefix: 'node-v', onProgress: zipProgress(sendProgress, 0.6, 0.83)});
            sendProgress(0.85, '配置 npm 镜像');
            ensureNpmMirror(installPath);
            sendProgress(0.92, '加入沙箱环境');
            sandbox.register('nodejs', targetVersion, installPath, {activate: true});
            sendProgress(1, '安装完成');
            mainWindow.webContents.send('nodejs-changed');
            return {success: true, message: 'Node.js 安装成功，可在「沐柠环境终端」中直接使用 node 和 npm', version: targetVersion};
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

    ipcMain.handle('check-nodejs', async () => {
        const items = sandbox.listInstalled('nodejs');
        const activeDir = sandbox.getActiveDir('nodejs');
        let version = '';
        if (activeDir) {
            const probed = await probeNode(activeDir);
            if (probed) version = probed;
        }
        return {
            installed: items.length > 0,
            version,
            versions: items.map(item => item.version),
            default: sandbox.getActive('nodejs'),
            items
        };
    });

    ipcMain.handle('switch-nodejs', async (event, version) => {
        try {
            if (!version) return {success: false, message: '缺少版本号'};
            const dir = sandbox.installDir('nodejs', version);
            if (!fs.existsSync(path.join(dir, 'node.exe'))) {
                return {success: false, message: `Node.js ${version} 的文件不完整，建议重新安装`};
            }
            ensureNpmMirror(dir);
            sandbox.setActive('nodejs', version);
            mainWindow.webContents.send('nodejs-changed');
            return {success: true, message: `已切换到 Node.js ${version}`, version};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('uninstall-nodejs', async (event, version) => {
        try {
            const target = version || sandbox.getActive('nodejs');
            const dir = target ? sandbox.getVersionDir('nodejs', target) : sandbox.getActiveDir('nodejs');
            const removal = sandbox.removeDirIfSandboxed(dir);
            if (target) sandbox.unregister('nodejs', target);
            mainWindow.webContents.send('nodejs-changed');
            if (!removal.sandboxed) {
                return {success: true, message: '已解除 Node.js 的登记，文件仍保留在 ' + removal.dir};
            }
            return {success: true, message: 'Node.js 已卸载'};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });
};
