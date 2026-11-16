const {ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const configManager = require('../configManager.cjs');
const {downloadFile} = require('../utils/download.cjs');
const {installZip, zipProgress} = require('../utils/zip.cjs');
const {createLogger} = require('../utils/logger.cjs');
const sandbox = require('../utils/sandbox.cjs');

/**
 * JDK 处理器（沙箱模式）
 *
 * 安装到 %LOCALAPPDATA%\Muling\env\jdk\jdk-<version>，
 * 不再写 JAVA_HOME<N> / 系统 PATH；需要通过命令行使用 java 时：
 *   - 打开「沐柠环境终端」，或
 *   - 在界面上开启「系统注入」（写用户级 JAVA_HOME，可随时关闭）
 */
module.exports = function registerJDKHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'jdk_install.log');
    const logToFile = createLogger(logFile);

    let currentAbortController = null;

    function resolveInstallDir(version, customPath) {
        // 用户显式选择目录时尊重用户选择；否则一律装进沙箱
        return customPath || sandbox.installDir('jdk', version);
    }

    function finalizeInstall(version, installPath, sendProgress) {
        const jdkBin = path.join(installPath, 'bin');
        if (!fs.existsSync(jdkBin)) throw new Error('解压后未找到 bin 目录');
        sandbox.register('jdk', version, installPath, {activate: true});
        logToFile(`已登记到沙箱: JDK ${version} -> ${installPath}`);
        if (typeof sendProgress === 'function') sendProgress(1, '安装完成');
        setTimeout(() => {
            mainWindow.webContents.send('jdk-changed');
        }, 500);
    }

    ipcMain.on('cancel-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    ipcMain.handle('install-jdk', async (event, version, customPath) => {
        logToFile(`尝试获取 JDK ${version} 的配置`);
        const toolConfig = configManager.getToolConfig('jdk', version);
        if (!toolConfig) {
            logToFile(`错误：未找到 JDK ${version} 的配置`);
            const config = configManager.getConfig();
            if (config && config.tools && config.tools.jdk && config.tools.jdk.versions) {
                logToFile(`可用的 JDK 版本: ${Object.keys(config.tools.jdk.versions).join(', ')}`);
            }
            return {success: false, message: `不支持的 JDK 版本: ${version}`};
        }

        logToFile(`成功获取 JDK ${version} 配置，URL: ${toolConfig.url}`);
        const fileName = toolConfig.url.split('/').pop().split('?')[0];
        const installerPath = path.join(downloadDir, fileName);
        const installPath = resolveInstallDir(version, customPath);
        logToFile(`安装目录: ${installPath}`);
        const sendProgress = (progress, stage = '', meta = {}) => {
            setImmediate(() => {
                mainWindow.webContents.send('download-progress', {
                    type: 'jdk',
                    version,
                    progress,
                    stage,
                    speed: meta.speed || 0,
                    eta: typeof meta.eta === 'number' ? meta.eta : null,
                    received: meta.received || 0,
                    total: meta.total || null,
                });
            });
        };
        const abortController = new AbortController();
        currentAbortController = abortController;

        async function downloadInstaller() {
            if (fs.existsSync(installerPath)) return;
            sendProgress(0, '下载安装包');
            logToFile(`[JDK下载] ${toolConfig.url}`);
            await downloadFile({
                url: toolConfig.url,
                destPath: installerPath,
                signal: abortController.signal,
                onProgress: (info) => sendProgress((info.percent ?? 0) * 0.5, info.retrying ? `网络中断，正在重试（${info.attempt}/3）` : '下载安装包', info),
                log: logToFile,
                label: 'JDK下载',
                timeout: 'auto',
            });
        }

        try {
            await downloadInstaller();
            if (!fs.existsSync(installerPath)) throw new Error('下载未完成');
            sendProgress(0.5, '解压中');
            await installZip(installerPath, installPath, {log: logToFile, onProgress: zipProgress(sendProgress, 0.5, 0.68)});
            sendProgress(0.7, '加入沙箱环境');
            finalizeInstall(version, installPath, sendProgress);
            return {success: true, message: `JDK ${version} 已安装到沙箱`};
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

    ipcMain.handle('check-jdk', async () => {
        try {
            const items = sandbox.listInstalled('jdk');
            const active = sandbox.getActive('jdk');
            return {
                versions: items.map(item => item.version),
                default: active,
                items,
            };
        } catch (err) {
            logToFile(`检查 JDK 失败: ${err.message}`);
            return {versions: [], default: null, items: []};
        }
    });

    ipcMain.handle('switch-jdk', async (event, version) => {
        try {
            sandbox.setActive('jdk', version);
            mainWindow.webContents.send('jdk-changed');
            return {success: true, message: `已切换到 JDK ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('delete-jdk', async (event, version) => {
        try {
            const toolState = sandbox.readState().tools.jdk;
            const recorded = toolState && toolState.versions[version] && toolState.versions[version].dir;
            const dir = recorded || sandbox.installDir('jdk', version);
            // 接管的 JDK 在 Program Files 里，卸载只解绑登记，绝不删人家的官方安装
            const removal = sandbox.removeDirIfSandboxed(dir);
            sandbox.unregister('jdk', version);
            mainWindow.webContents.send('jdk-changed');
            if (!removal.sandboxed) {
                return {
                    success: true,
                    message: `已解除 JDK ${version} 的登记，文件仍保留在 ${removal.dir}`,
                };
            }
            return {success: true, message: `已删除 JDK ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });
};
