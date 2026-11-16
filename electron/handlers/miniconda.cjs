const {ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const {spawn} = require('child_process');
const {createLogger} = require('../utils/logger.cjs');
const downloadFile = require('../utils/download.cjs').downloadFile;
const configManager = require('../configManager.cjs');
const sandbox = require('../utils/sandbox.cjs');

// Miniconda 官方只发 NSIS 安装包（repo.anaconda.com 里没有 zip），
// 所以这里的「安装」= 静默运行安装器、直接装进沙箱目录，不写注册表、不改 PATH。
const INSTALL_TIMEOUT_MS = 20 * 60 * 1000;

function prettyVersion(version) {
    // 形如 3.11-24.9.2 → Python 3.11 / conda 24.9.2
    const m = String(version || '').match(/^(\d+\.\d+)-(.+)$/);
    if (!m) return String(version || '');
    return `Python ${m[1]} · conda ${m[2]}`;
}

module.exports = function registerMinicondaHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'miniconda_install.log');
    const logToFile = createLogger(logFile);

    let currentAbortController = null;
    let installing = false;

    function sendProgress(version, progress, stage = '', meta = {}) {
        mainWindow.webContents.send('download-progress', {
            type: 'miniconda',
            version,
            progress,
            stage,
            speed: meta.speed || 0,
            eta: typeof meta.eta === 'number' ? meta.eta : null,
            received: meta.received || 0,
            total: meta.total || null,
        });
    }

    function findMinicondaHome(version) {
        const hit = sandbox.listInstalled('miniconda').find((item) => item.version === version);
        if (hit && fs.existsSync(hit.dir)) return hit.dir;
        const dir = sandbox.installDir('miniconda', version);
        return fs.existsSync(dir) ? dir : null;
    }

    /**
     * 静默运行 NSIS 安装器。
     *
     * 坑：这台机器的默认临时目录会让 NSIS 直接中止（exit 2，0.5 秒内退出，什么都不留下），
     * 所以必须显式给安装器一个干净的 TEMP/TMP（跟打包时踩的是同一类问题）。
     * 另外 /D= 必须是最后一个参数、且不能带引号。
     */
    function runInstaller(installerPath, installDir, onStage) {
        return new Promise((resolve, reject) => {
            const tmpDir = path.join(sandbox.getRoot(), '.tmp', 'miniconda');
            fs.mkdirSync(tmpDir, {recursive: true});
            if (fs.existsSync(installDir)) fs.rmSync(installDir, {recursive: true, force: true});
            fs.mkdirSync(installDir, {recursive: true});

            const args = ['/S', '/AddToPath=0', '/RegisterPython=0', `/D=${installDir}`];
            const startedAt = Date.now();
            const child = spawn(installerPath, args, {
                windowsHide: true,
                env: {...process.env, TEMP: tmpDir, TMP: tmpDir},
            });

            const ticker = setInterval(() => {
                const secs = Math.round((Date.now() - startedAt) / 1000);
                if (typeof onStage === 'function') onStage(secs);
            }, 1000);

            let tail = '';
            child.stdout.on('data', (chunk) => { tail = (tail + chunk.toString('utf8')).slice(-2000); });
            child.stderr.on('data', (chunk) => { tail = (tail + chunk.toString('utf8')).slice(-2000); });

            const timer = setTimeout(() => {
                try { child.kill(); } catch (err) { /* 忽略 */ }
                reject(new Error('解压安装超时（20 分钟），可能是磁盘空间不足或被杀毒软件拦住'));
            }, INSTALL_TIMEOUT_MS);

            child.on('error', (err) => {
                clearTimeout(timer);
                clearInterval(ticker);
                reject(err);
            });

            child.on('close', (code) => {
                clearTimeout(timer);
                clearInterval(ticker);
                if (code === 0 && fs.existsSync(path.join(installDir, 'python.exe'))) {
                    resolve();
                    return;
                }
                const hint = code === 2
                    ? '（安装器被中止：多半是临时目录不可用或目标目录建不起来）'
                    : '';
                reject(new Error(`Miniconda 安装器退出码 ${code}${hint}${tail ? `\n${tail}` : ''}`));
            });
        });
    }

    /**
     * 写一份走国内镜像的 .condarc，免得用户装完 conda create 卡半小时。
     */
    function writeCondarc(installDir, version) {
        const condarcPath = path.join(installDir, '.condarc');
        const content = [
            'channels:',
            '  - defaults',
            'show_channel_urls: true',
            'default_channels:',
            '  - https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main',
            '  - https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/r',
            '  - https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/msys2',
            'custom_channels:',
            '  conda-forge: https://mirrors.tuna.tsinghua.edu.cn/anaconda/cloud',
            '  pytorch: https://mirrors.tuna.tsinghua.edu.cn/anaconda/cloud',
            '',
        ].join('\n');
        try {
            fs.writeFileSync(condarcPath, content, 'utf8');
            logToFile(`[${version}] 已写入 conda 镜像配置 ${condarcPath}`);
        } catch (err) {
            logToFile(`[${version}] 写 .condarc 失败: ${err.message}`);
        }
    }

    ipcMain.on('cancel-miniconda-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    ipcMain.handle('install-miniconda', async (event, version) => {
        if (installing) return {success: false, message: '另一个 Miniconda 正在安装，请稍候'};
        const toolConfig = configManager.getToolConfig('miniconda', version);
        if (!toolConfig) return {success: false, message: `不支持的 Miniconda 版本: ${version}`};

        const {url} = toolConfig;
        const fileName = url.split('/').pop().split('?')[0];
        const installerPath = path.join(downloadDir, fileName);
        const installDir = sandbox.installDir('miniconda', version);
        const abortController = new AbortController();
        currentAbortController = abortController;
        installing = true;

        try {
            if (!fs.existsSync(installerPath)) {
                sendProgress(version, 0, '下载安装包');
                await downloadFile({
                    url,
                    destPath: installerPath,
                    signal: abortController.signal,
                    onProgress: (info) => sendProgress(
                        version,
                        (info.percent ?? 0) * 0.85,
                        info.retrying ? `网络中断，正在重试（${info.attempt}/3）` : '下载安装包',
                        info
                    ),
                    log: logToFile,
                    label: 'Miniconda下载',
                    timeout: 900000,
                });
            } else {
                sendProgress(version, 0.85, '已找到上次下载的安装包');
            }

            sendProgress(version, 0.86, '解压安装中（约 20-60 秒）');
            logToFile(`[${version}] 安装到 ${installDir}`);
            await runInstaller(installerPath, installDir, (secs) => {
                sendProgress(version, Math.min(0.97, 0.86 + secs * 0.001), `解压安装中 · 已用 ${secs}s`);
            });

            writeCondarc(installDir, version);
            sandbox.register('miniconda', version, installDir, {activate: true});
            sendProgress(version, 1, '安装完成');
            mainWindow.webContents.send('miniconda-changed');
            return {success: true, message: `Miniconda（${prettyVersion(version)}）安装成功`};
        } catch (err) {
            if (err.message === '下载已取消' || abortController.signal.aborted) {
                return {success: false, message: '已取消'};
            }
            logToFile(`[${version}] 安装失败: ${err.message}`);
            return {success: false, message: `安装失败: ${err.message}`};
        } finally {
            if (currentAbortController === abortController) currentAbortController = null;
            installing = false;
            if (fs.existsSync(installerPath)) {
                try { fs.unlinkSync(installerPath); } catch (err) { /* 忽略：可能被占用 */ }
            }
        }
    });

    ipcMain.handle('check-miniconda', async () => {
        try {
            const items = sandbox.listInstalled('miniconda').map((item) => ({
                ...item,
                label: prettyVersion(item.version),
                pythonPath: path.join(item.dir, 'python.exe'),
                condaPath: path.join(item.dir, 'condabin', 'conda.bat'),
            }));
            return {
                versions: items.map((item) => item.version),
                default: sandbox.getActive('miniconda'),
                items,
            };
        } catch (err) {
            return {versions: [], default: null, items: []};
        }
    });

    ipcMain.handle('switch-miniconda', async (event, version) => {
        try {
            const home = findMinicondaHome(version);
            if (!home) return {success: false, message: `未找到 Miniconda ${version} 的安装目录`};
            sandbox.setActive('miniconda', version);
            mainWindow.webContents.send('miniconda-changed');
            return {success: true, message: `已切换到 Miniconda（${prettyVersion(version)}）`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('delete-miniconda', async (event, version) => {
        try {
            const home = findMinicondaHome(version);
            if (!home) return {success: false, message: `未找到 Miniconda ${version} 的安装目录`};
            const removal = sandbox.removeDirIfSandboxed(home);
            sandbox.unregister('miniconda', version);
            mainWindow.webContents.send('miniconda-changed');
            if (!removal.sandboxed) {
                return {success: true, message: `已解除 Miniconda ${version} 的登记，文件仍保留在 ${removal.dir}`};
            }
            return {success: true, message: `已删除 Miniconda（${prettyVersion(version)}）`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    /** 该版本里已经装了哪些 package（conda list）。 */
    ipcMain.handle('list-conda-envs', async (event, version) => {
        try {
            const home = findMinicondaHome(version);
            if (!home) return {success: false, message: `未找到 Miniconda ${version} 的安装目录`};
            const envsDir = path.join(home, 'envs');
            const envs = fs.existsSync(envsDir)
                ? fs.readdirSync(envsDir).filter((name) => fs.existsSync(path.join(envsDir, name, 'python.exe')))
                : [];
            return {success: true, envs};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });
};
