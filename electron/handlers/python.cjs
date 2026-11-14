const {ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const {exec, spawn} = require('child_process');
const {createLogger} = require('../utils/logger.cjs');
const downloadFile = require('../utils/download.cjs').downloadFile;
const {installZip, zipProgress} = require('../utils/zip.cjs');
const {promisify} = require('util');
const execPromise = promisify(exec);
const configManager = require('../configManager.cjs');
const sandbox = require('../utils/sandbox.cjs');

module.exports = function registerPythonHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'python_install.log');

    const logToFile = createLogger(logFile);

    let currentAbortController = null;

    /**
     * 跑 pip 命令并把关键输出行实时推给界面，避免「安装 pip 中」长时间无反馈。
     */
    function runPipStreaming(command, stage) {
        return new Promise((resolve, reject) => {
            const child = spawn(command, {shell: true, windowsHide: true});
            let output = '';
            let buffer = '';
            const interesting = /^(Collecting|Installing|Successfully|Downloading|Using cached|Requirement already|Building wheel|Created wheel)/i;

            const handleLine = (line) => {
                const text = line.trim();
                if (!text) return;
                if (!interesting.test(text)) return;
                const short = text.length > 46 ? text.slice(0, 46) + '…' : text;
                stage(`安装 pip 中 · ${short}`);
            };

            const onData = (chunk) => {
                const text = chunk.toString('utf8');
                output += text;
                buffer += text;
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop();
                lines.forEach(handleLine);
            };

            child.stdout.on('data', onData);
            child.stderr.on('data', onData);
            child.on('error', (err) => reject(err));
            child.on('close', (code) => {
                if (buffer) handleLine(buffer);
                if (code === 0) return resolve(output);
                const err = new Error(output.trim() || `pip 进程退出码 ${code}`);
                reject(err);
            });
        });
    }

    async function installPip(pythonExe, installDir, mirror, onStage = null) {
        const stage = (text) => {
            if (typeof onStage === 'function') {
                try { onStage(text); } catch (err) { /* 忽略 */ }
            }
        };
        const pythonPipVersionMap = {
            '3.5': '20.3.4',
            '3.6': '21.3.1',
            '3.7': '24.0',
            '3.8': '24.2',
            '3.9': 'latest',
            '3.10': 'latest',
            '3.11': 'latest',
            '3.12': 'latest',
            '3.13': 'latest',
            '3.14': 'latest'
        };
        let pythonVersionKey = '';
        let targetPipVersion = '';

        try {
            const {stdout, stderr} = await execPromise(`"${pythonExe}" -m ensurepip --upgrade`);
            logToFile(`ensurepip 输出: ${stdout} ${stderr}`);
        } catch (err) {
            logToFile(`ensurepip 失败: ${err.message}，尝试 get-pip.py`);

            const versionOutput = await execPromise(`"${pythonExe}" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"`);
            pythonVersionKey = versionOutput.stdout.trim();
            targetPipVersion = pythonPipVersionMap[pythonVersionKey] || 'latest';

            // 从本地资源文件夹复制 get-pip.py
            const app = require('electron').app;
            const appPath = app.getAppPath();
            
            // 尝试多个可能的路径（开发环境 vs 生产环境）
            const possiblePaths = [
                path.join(appPath, 'public', 'resources', 'get-pip.py'),  // 开发环境
                path.join(process.resourcesPath || '', 'app.asar.unpacked', 'public', 'resources', 'get-pip.py'),  // 生产环境解包后
                path.join(process.resourcesPath || '', 'public', 'resources', 'get-pip.py'),  // 备用路径
            ];
            
            logToFile(`尝试查找 get-pip.py:`);
            logToFile(`  app.getAppPath(): ${appPath}`);
            logToFile(`  process.resourcesPath: ${process.resourcesPath}`);
            
            let localGetPipPath = null;
            for (const tryPath of possiblePaths) {
                logToFile(`  检查路径: ${tryPath} (存在: ${fs.existsSync(tryPath)})`);
                if (fs.existsSync(tryPath)) {
                    localGetPipPath = tryPath;
                    logToFile(`  ✅ 找到文件: ${localGetPipPath}`);
                    break;
                }
            }
            
            if (!localGetPipPath) {
                throw new Error('未找到 get-pip.py 文件，请确保已将其放置在 public/resources 目录下');
            }
            
            const destGetPipPath = path.join(installDir, 'get-pip.py');
            logToFile(`复制 get-pip.py: ${localGetPipPath} -> ${destGetPipPath}`);
            fs.copyFileSync(localGetPipPath, destGetPipPath);

            const installCmd = targetPipVersion === 'latest'
                ? `"${pythonExe}" "${destGetPipPath}" --index-url ${mirror} --trusted-host ${new URL(mirror).hostname}`
                : `"${pythonExe}" "${destGetPipPath}" pip==${targetPipVersion} --index-url ${mirror} --trusted-host ${new URL(mirror).hostname}`;

            logToFile(`执行 get-pip.py: ${installCmd}`);
            try {
                await runPipStreaming(installCmd, stage);
            } catch (pipErr) {
                logToFile(`get-pip.py 安装失败: ${pipErr.message}`);
                // 检查是否是网络错误
                if (pipErr.message.includes('getaddrinfo failed') || 
                    pipErr.message.includes('NewConnectionError') ||
                    pipErr.message.includes('Retrying')) {
                    throw new Error('pip 安装失败：网络连接问题。请检查代理设置或前往夸克网盘下载已配置好 pip 的 Python 版本。');
                }
                // 检查是否是权限错误
                if (pipErr.message.includes('WinError 32') || 
                    pipErr.message.includes('Permission denied') ||
                    pipErr.message.includes('EPERM')) {
                    throw new Error('pip 安装失败：文件被占用或权限不足。请以管理员身份运行应用后重试。');
                }
                throw pipErr;
            }
            fs.unlinkSync(destGetPipPath);
        }

        try {
            const upgradeCmd = targetPipVersion === 'latest'
                ? `"${pythonExe}" -m pip install --upgrade pip --index-url ${mirror}`
                : `"${pythonExe}" -m pip install pip==${targetPipVersion} --index-url ${mirror}`;
            await runPipStreaming(upgradeCmd, stage);
        } catch (err) {
            logToFile(`升级 pip 失败: ${err.message}`);
        }

        const versionMatch = installDir.match(/python-(\d+\.\d+\.\d+)/);
        let majorMinor;
        if (versionMatch) {
            const parts = versionMatch[1].split('.');
            majorMinor = parts[0] + parts[1];
        } else {
            const {stdout} = await execPromise(`"${pythonExe}" -c "import sys; print(sys.version_info.major, sys.version_info.minor)"`);
            const [major, minor] = stdout.trim().split(' ');
            majorMinor = major + minor;
        }
        const pthFile = path.join(installDir, `python${majorMinor}._pth`);
        if (fs.existsSync(pthFile)) {
            let content = fs.readFileSync(pthFile, 'utf8');
            if (content.includes('#import site')) {
                content = content.replace(/#import site/g, 'import site');
                fs.writeFileSync(pthFile, content, 'utf8');
                logToFile(`已修改 ${pthFile}，启用 import site`);
            } else if (!content.includes('import site')) {
                content += '\nimport site\n';
                fs.writeFileSync(pthFile, content, 'utf8');
                logToFile(`已添加 import site 到 ${pthFile}`);
            }
        } else {
            logToFile(`警告：未找到 ._pth 文件 ${pthFile}`);
        }

        const pipConfigDir = path.join(installDir, 'pip.ini');
        const pipConfigContent = `[global]
index-url = ${mirror}
[install]
trusted-host = ${new URL(mirror).hostname}
`;
        fs.writeFileSync(pipConfigDir, pipConfigContent);
        logToFile(`pip 镜像源配置完成: ${mirror}`);
    }

    // 沙箱模式下不再改写系统变量：版本切换只更新沙箱状态
    function findPythonHome(version) {
        const hit = sandbox.listInstalled('python').find(item => item.version === version);
        if (hit && fs.existsSync(hit.dir)) return hit.dir;
        const dir = sandbox.installDir('python', version);
        return fs.existsSync(dir) ? dir : null;
    }

    function getAllInstalledVersions() {
        return sandbox.listInstalled('python').map(item => item.version);
    }

    function getCurrentDefaultVersion() {
        return sandbox.getActive('python');
    }

    ipcMain.on('cancel-python-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    ipcMain.handle('install-python', async (event, version, mirror = 'https://pypi.tuna.tsinghua.edu.cn/simple') => {
        // 从配置获取下载信息
        const toolConfig = configManager.getToolConfig('python', version);
        if (!toolConfig) return {success: false, message: `不支持的 Python 版本: ${version}`};
        
        const {url} = toolConfig;
        const fileName = url.split('/').pop().split('?')[0];
        const installerPath = path.join(downloadDir, fileName);
        const installPath = sandbox.installDir('python', version);
        const sendProgress = (progress, stage = '', meta = {}) => {
            mainWindow.webContents.send('download-progress', {
                type: 'python',
                version,
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
            if (!fs.existsSync(installerPath)) {
                sendProgress(0, '下载安装包');
                await downloadFile({
                    url,
                    destPath: installerPath,
                    signal: abortController.signal,
                    onProgress: (info) => sendProgress((info.percent ?? 0) * 0.3, info.retrying ? `网络中断，正在重试（${info.attempt}/3）` : '下载安装包', info),
                    log: logToFile,
                    label: 'Python下载',
                    timeout: 600000,
                });
                sendProgress(0.3, '解压中');
            } else {
                sendProgress(0.3, '解压中');
            }
            await installZip(installerPath, installPath, {log: logToFile, onProgress: zipProgress(sendProgress, 0.3, 0.48)});
            sendProgress(0.5, '安装 pip 中');
            const pythonRoot = installPath;
            const pythonExe = path.join(pythonRoot, 'python.exe');
            if (!fs.existsSync(pythonExe)) return {success: false, message: '未找到 python.exe'};
            await installPip(pythonExe, pythonRoot, mirror, (text) => sendProgress(0.55, text));
            sendProgress(0.8, '加入沙箱环境');
            sandbox.register('python', version, pythonRoot, {activate: true});
            sendProgress(1, '安装完成');
            mainWindow.webContents.send('python-changed');
            return {success: true, message: 'Python 安装成功，pip 已配置'};
        } catch (err) {
            if (err.message === '下载已取消') return {success: false, message: '下载已取消'};
            return {success: false, message: `安装失败: ${err.message}`};
        } finally {
            if (currentAbortController === abortController) currentAbortController = null;
            if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);
        }
    });

    ipcMain.handle('check-python', async () => {
        try {
            const items = sandbox.listInstalled('python');
            return {
                versions: items.map(item => item.version),
                default: sandbox.getActive('python'),
                items
            };
        } catch (err) {
            return {versions: [], default: null, items: []};
        }
    });

    ipcMain.handle('switch-python', async (event, version) => {
        try {
            const home = await findPythonHome(version);
            if (!home) return {success: false, message: `未找到 Python${version} 安装目录`};
            sandbox.setActive('python', version);
            mainWindow.webContents.send('python-changed');
            return {success: true, message: `已切换到 Python ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('delete-python', async (event, version) => {
        try {
            const home = await findPythonHome(version);
            if (!home) return {success: false, message: `未找到 Python ${version} 的安装目录`};
            fs.rmSync(home, {recursive: true, force: true});
            sandbox.unregister('python', version);
            mainWindow.webContents.send('python-changed');
            return {success: true, message: `已删除 Python ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('list-packages', async (event, version) => {
        try {
            const home = await findPythonHome(version);
            if (!home) return {success: false, message: `未找到 Python ${version} 的安装目录`};
            const pythonExe = path.join(home, 'python.exe');
            if (!fs.existsSync(pythonExe)) return {success: false, message: '未找到 python.exe'};
            const {stdout} = await execPromise(`"${pythonExe}" -m pip list --format=json`);
            const packages = JSON.parse(stdout);
            return {success: true, packages};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('install-package', async (event, version, packageName) => {
        try {
            const home = await findPythonHome(version);
            if (!home) return {success: false, message: `未找到 Python ${version} 的安装目录`};
            const pythonExe = path.join(home, 'python.exe');
            if (!fs.existsSync(pythonExe)) return {success: false, message: '未找到 python.exe'};
            await execPromise(`"${pythonExe}" -m pip install ${packageName}`);
            return {success: true, message: `包 ${packageName} 安装成功`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('uninstall-package', async (event, version, packageName) => {
        try {
            const home = await findPythonHome(version);
            if (!home) return {success: false, message: `未找到 Python ${version} 的安装目录`};
            const pythonExe = path.join(home, 'python.exe');
            if (!fs.existsSync(pythonExe)) return {success: false, message: '未找到 python.exe'};
            await execPromise(`"${pythonExe}" -m pip uninstall ${packageName} -y`);
            return {success: true, message: `包 ${packageName} 已卸载`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });
};
