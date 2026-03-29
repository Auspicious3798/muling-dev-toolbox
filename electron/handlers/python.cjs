const {ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const {exec} = require('child_process');
const axios = require('axios');
const AdmZip = require('adm-zip');
const {promisify} = require('util');
const execPromise = promisify(exec);

const pythonSources = {
    '3.14.3': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/V2.0.0/python-3.14.3.zip',
        type: 'zip'
    },
    '3.13.12': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/V2.0.0/python-3.13.12.zip',
        type: 'zip'
    },
    '3.12.9': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/V2.0.0/python-3.12.9.zip',
        type: 'zip'
    },
    '3.11.9': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/V2.0.0/python-3.11.9.zip',
        type: 'zip'
    },
    '3.10.10': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/V2.0.0/python-3.10.10.zip',
        type: 'zip'
    },
    '3.9.10': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/V2.0.0/python-3.9.10.zip',
        type: 'zip'
    },
    '3.8.10': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/V2.0.0/python-3.8.10.zip',
        type: 'zip'
    },
    '3.7.8': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/V2.0.0/python-3.7.8.zip',
        type: 'zip'
    },
    '3.6.8': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/V2.0.0/python-3.6.8.zip',
        type: 'zip'
    },
    '3.5.3': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/V2.0.0/python-3.5.3.zip',
        type: 'zip'
    }
};

module.exports = function registerPythonHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'python_install.log');

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
            signal
        });
        const totalLength = response.headers['content-length'];
        let downloaded = 0;
        response.data.on('data', (chunk) => {
            downloaded += chunk.length;
            if (onProgress && totalLength) onProgress(downloaded / totalLength);
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
                if (fs.existsSync(installDir)) fs.rmSync(installDir, {recursive: true, force: true});
                fs.mkdirSync(installDir, {recursive: true});
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(installDir, true);
                logToFile(`解压成功: ${zipPath} -> ${installDir}`);
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    async function installPip(pythonExe, installDir, mirror) {
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

            let getPipUrl = '';
            if (['3.5', '3.6', '3.7', '3.8'].includes(pythonVersionKey)) {
                getPipUrl = 'https://mirrors.aliyun.com/pypi/get-pip.py';
            } else {
                getPipUrl = 'https://bootstrap.pypa.io/get-pip.py';
            }

            const getPipPath = path.join(installDir, 'get-pip.py');
            const writer = fs.createWriteStream(getPipPath);
            const response = await axios({
                method: 'GET',
                url: getPipUrl,
                responseType: 'stream',
                timeout: 30000
            });
            response.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            const installCmd = targetPipVersion === 'latest'
                ? `"${pythonExe}" "${getPipPath}"`
                : `"${pythonExe}" "${getPipPath}" pip==${targetPipVersion}`;

            await execPromise(installCmd);
            fs.unlinkSync(getPipPath);
        }

        try {
            const upgradeCmd = targetPipVersion === 'latest'
                ? `"${pythonExe}" -m pip install --upgrade pip --index-url ${mirror}`
                : `"${pythonExe}" -m pip install pip==${targetPipVersion} --index-url ${mirror}`;
            await execPromise(upgradeCmd);
        } catch (err) {
            logToFile(`升级 pip 失败: ${err.message}`);
        }

        const versionMatch = installDir.match(/python-(\d+\.\d+\.\d+)/);
        let majorMinor = '';
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
        const pipConfigContent = `[global]\nindex-url = ${mirror}\n[install]\ntrusted-host = ${new URL(mirror).hostname}\n`;
        fs.writeFileSync(pipConfigDir, pipConfigContent);
        logToFile(`pip 镜像源配置完成: ${mirror}`);
    }

    function setSystemEnvVariable(name, value) {
        return new Promise((resolve, reject) => {
            const setxCmd = `C:\\Windows\\System32\\setx.exe /M "${name}" "${value}"`;
            logToFile(`执行 setx: ${setxCmd}`);
            exec(setxCmd, {windowsHide: true}, (error, stdout, stderr) => {
                if (error) reject(new Error(`设置系统变量失败: ${stderr || error.message}`));
                else {
                    logToFile(`setx 成功: ${name}=${value}`);
                    const psRefresh = `$env:${name} = "${value}"`;
                    exec(`powershell -NoProfile -Command "${psRefresh.replace(/"/g, '\\"')}"`, (err) => {
                        if (err) logToFile(`刷新当前进程 ${name} 失败: ${err.message}`);
                        resolve();
                    });
                }
            });
        });
    }

    function removeSystemEnvVariable(name) {
        return new Promise((resolve, reject) => {
            const setxCmd = `C:\\Windows\\System32\\setx.exe /M "${name}" ""`;
            exec(setxCmd, {windowsHide: true}, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    function setPathForVersion(version) {
        return new Promise((resolve, reject) => {
            const versionKey = version.replace(/\./g, '');
            const targetVar = `PYTHON_HOME${versionKey}`;
            const targetEntry = `%${targetVar}%`;
            const scriptsEntry = `%${targetVar}%\\Scripts`;
            const regCmd = `C:\\Windows\\System32\\reg.exe query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path`;
            exec(regCmd, {windowsHide: true}, (error, stdout) => {
                if (error) return reject(new Error('读取 PATH 失败'));
                const match = stdout.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
                if (!match) return reject(new Error('无法解析 PATH'));
                let currentPath = match[1].trim();
                const parts = currentPath.split(';');
                const newParts = parts.filter(p => !/^%PYTHON_HOME\d+%$/i.test(p) && !/^%PYTHON_HOME\d+%\\Scripts$/i.test(p));
                newParts.unshift(targetEntry);
                newParts.unshift(scriptsEntry);
                const newPath = newParts.join(';');
                const setxCmd = `C:\\Windows\\System32\\setx.exe /M PATH "${newPath}"`;
                exec(setxCmd, {windowsHide: true}, (err) => {
                    if (err) reject(new Error('设置 PATH 失败'));
                    else resolve();
                });
            });
        });
    }

    async function getSystemPath() {
        try {
            const regCmd = `C:\\Windows\\System32\\reg.exe query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path`;
            const {stdout} = await execPromise(regCmd);
            const match = stdout.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
            if (match && match[1]) return match[1].trim();
        } catch (err) {
        }
        return '';
    }

    async function findPythonHomeByDigits(digits) {
        const varName = `PYTHON_HOME${digits}`;
        try {
            const {stdout} = await execPromise(`echo %${varName}%`);
            const home = stdout.trim();
            if (home && fs.existsSync(home)) return home;
        } catch (err) {
        }
        const knownDirs = [
            'C:\\Program Files\\Python',
            'C:\\Python',
            'C:\\Users\\' + process.env.USERNAME + '\\Anaconda3',
            'C:\\Users\\' + process.env.USERNAME + '\\anaconda3',
            'C:\\ProgramData\\Anaconda3',
            'C:\\ProgramData\\anaconda3',
            'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Programs\\Python'
        ];
        const possibleVersions = [
            `${digits[0]}.${digits.slice(1)}`,
            `${digits[0]}.${digits[1]}.${digits.slice(2)}`,
            `${digits[0]}.${digits.slice(1, 3)}.${digits.slice(3)}`
        ];
        for (const base of knownDirs) {
            for (const ver of possibleVersions) {
                const candidate = path.join(base, `python-${ver}`);
                if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'python.exe'))) {
                    return candidate;
                }
            }
            if (fs.existsSync(base) && fs.existsSync(path.join(base, 'python.exe'))) {
                return base;
            }
        }
        return null;
    }

    async function getCurrentDefaultVersion() {
        try {
            const systemPath = await getSystemPath();
            const versionMatch = systemPath.match(/%PYTHON_HOME(\d+)%/);
            if (versionMatch) {
                const digits = versionMatch[1];
                const home = await findPythonHomeByDigits(digits);
                if (home) {
                    const pythonExe = path.join(home, 'python.exe');
                    if (fs.existsSync(pythonExe)) {
                        const env = {...process.env};
                        if (home.toLowerCase().includes('anaconda')) {
                            env.PYTHONHOME = home;
                            env.PATH = `${home};${home}\\Library\\bin;${home}\\Scripts;${env.PATH || ''}`;
                        }
                        const {stdout, stderr} = await execPromise(`"${pythonExe}" --version 2>&1`, {env});
                        const output = stdout + stderr;
                        const verMatch = output.match(/Python (\d+\.\d+\.\d+)/);
                        if (verMatch && verMatch[1]) return verMatch[1];
                    }
                }
            }
            const commonPaths = [
                'C:\\Python',
                'C:\\Python3',
                'C:\\Program Files\\Python',
                'C:\\Program Files\\Python3',
                path.join('C:\\Users', process.env.USERNAME, 'AppData\\Local\\Programs\\Python'),
                path.join('C:\\Users', process.env.USERNAME, 'Anaconda3'),
                path.join('C:\\Users', process.env.USERNAME, 'anaconda3'),
                'C:\\ProgramData\\Anaconda3',
                'C:\\ProgramData\\anaconda3'
            ];
            let extraPath = '';
            for (const dir of commonPaths) {
                if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'python.exe'))) {
                    extraPath += dir + ';';
                }
            }
            const env = {
                ...process.env,
                Path: `${extraPath}${systemPath};${process.env.Path || ''}`
            };
            const {stdout, stderr} = await execPromise('python --version 2>&1', {env});
            const output = stdout + stderr;
            const fallbackMatch = output.match(/Python (\d+\.\d+\.\d+)/);
            if (fallbackMatch && fallbackMatch[1]) return fallbackMatch[1];
            return null;
        } catch (err) {
            logToFile(`获取默认版本失败: ${err.message}`);
            return null;
        }
    }

    async function getAllInstalledVersions() {
        const versions = new Set();
        try {
            const psScript = `
                Get-ChildItem Env: | Where-Object { $_.Name -match '^PYTHON_HOME\\d+$' } | ForEach-Object { $_.Name -replace 'PYTHON_HOME', '' }
            `;
            const {stdout} = await execPromise(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`);
            const lines = stdout.trim().split('\r\n').filter(l => l);
            for (const digits of lines) {
                let i = 0, parts = [];
                if (digits.length >= 1) parts.push(digits[i++]);
                if (digits.length >= 2) parts.push(digits[i++]);
                parts.push(digits.slice(i));
                versions.add(parts.join('.'));
            }
        } catch (err) {
        }
        const knownDirs = [
            'C:\\Program Files\\Python',
            'C:\\Python',
            'C:\\Users\\' + process.env.USERNAME + '\\Anaconda3',
            'C:\\Users\\' + process.env.USERNAME + '\\anaconda3',
            'C:\\ProgramData\\Anaconda3',
            'C:\\ProgramData\\anaconda3',
            'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Programs\\Python',
            'C:\\Program Files\\Python39',
            'C:\\Program Files\\Python310',
            'C:\\Program Files\\Python311',
            'C:\\Program Files\\Python312',
            'C:\\Program Files\\Python313',
            'C:\\Program Files\\Python314'
        ];
        for (const base of knownDirs) {
            if (fs.existsSync(base)) {
                const pythonExe = path.join(base, 'python.exe');
                if (fs.existsSync(pythonExe)) {
                    try {
                        const env = {...process.env};
                        if (base.toLowerCase().includes('anaconda')) {
                            env.PYTHONHOME = base;
                            env.PATH = `${base};${base}\\Library\\bin;${base}\\Scripts;${env.PATH || ''}`;
                        }
                        const {stdout, stderr} = await execPromise(`"${pythonExe}" --version 2>&1`, {env});
                        const output = stdout + stderr;
                        const match = output.match(/Python (\d+\.\d+\.\d+)/);
                        if (match) versions.add(match[1]);
                    } catch (e) {
                    }
                }
                const subdirs = fs.readdirSync(base);
                for (const sub of subdirs) {
                    const subPath = path.join(base, sub);
                    if (fs.statSync(subPath).isDirectory() && (sub.startsWith('python-') || sub.startsWith('Python'))) {
                        const subExe = path.join(subPath, 'python.exe');
                        if (fs.existsSync(subExe)) {
                            try {
                                const env = {...process.env};
                                if (subPath.toLowerCase().includes('anaconda')) {
                                    env.PYTHONHOME = subPath;
                                    env.PATH = `${subPath};${subPath}\\Library\\bin;${subPath}\\Scripts;${env.PATH || ''}`;
                                }
                                const {stdout, stderr} = await execPromise(`"${subExe}" --version 2>&1`, {env});
                                const output = stdout + stderr;
                                const match = output.match(/Python (\d+\.\d+\.\d+)/);
                                if (match) versions.add(match[1]);
                            } catch (e) {
                            }
                        }
                    }
                }
            }
        }
        const sortVersions = (a, b) => {
            const aParts = a.split('.').map(Number);
            const bParts = b.split('.').map(Number);
            for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                const aNum = aParts[i] || 0;
                const bNum = bParts[i] || 0;
                if (aNum !== bNum) return bNum - aNum;
            }
            return 0;
        };
        return Array.from(versions).sort(sortVersions);
    }

    async function findPythonHome(version) {
        const versionKey = version.replace(/\./g, '');
        const varName = `PYTHON_HOME${versionKey}`;
        try {
            const {stdout} = await execPromise(`echo %${varName}%`);
            const home = stdout.trim();
            if (home && fs.existsSync(home)) return home;
        } catch (err) {
        }
        const knownDirs = [
            'C:\\Program Files\\Python',
            'C:\\Python',
            'C:\\Users\\' + process.env.USERNAME + '\\Anaconda3',
            'C:\\Users\\' + process.env.USERNAME + '\\anaconda3',
            'C:\\ProgramData\\Anaconda3',
            'C:\\ProgramData\\anaconda3'
        ];
        for (const base of knownDirs) {
            const candidate = path.join(base, `python-${version}`);
            if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'python.exe'))) return candidate;
            if (fs.existsSync(base) && fs.existsSync(path.join(base, 'python.exe'))) {
                try {
                    const {stdout, stderr} = await execPromise(`"${path.join(base, 'python.exe')}" --version 2>&1`);
                    if ((stdout + stderr).match(/Python (\d+\.\d+\.\d+)/)[1] === version) return base;
                } catch (e) {
                }
            }
        }
        return null;
    }

    ipcMain.on('cancel-python-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    ipcMain.handle('import-local-python', async (event, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.zip') return {success: false, message: '只支持 .zip 文件'};
        const fileName = path.basename(filePath);
        const destPath = path.join(downloadDir, fileName);
        fs.copyFileSync(filePath, destPath);
        pendingLocalFile = destPath;
        return {success: true, message: 'Python 安装包已导入，点击“开始安装”完成配置'};
    });

    ipcMain.handle('install-from-local-python', async (event, version, mirror = 'https://pypi.tuna.tsinghua.edu.cn/simple') => {
        if (!pendingLocalFile) return {success: false, message: '没有已导入的 Python 安装包，请先导入'};
        if (!version) return {success: false, message: '未指定 Python 版本'};
        const zipPath = pendingLocalFile;
        const installPath = `C:\\Program Files\\Python\\python-${version}`;
        const sendProgress = (progress, stage = '') => {
            mainWindow.webContents.send('download-progress', {type: 'python', version, progress, stage});
        };
        try {
            sendProgress(0, '解压中');
            await installZip(zipPath, installPath);
            sendProgress(0.5, '安装 pip 中');
            const pythonRoot = installPath;
            const pythonExe = path.join(pythonRoot, 'python.exe');
            if (!fs.existsSync(pythonExe)) throw new Error('解压后未找到 python.exe');
            await installPip(pythonExe, pythonRoot, mirror);
            sendProgress(0.8, '配置环境变量');
            const versionKey = version.replace(/\./g, '');
            await setSystemEnvVariable(`PYTHON_HOME${versionKey}`, pythonRoot);
            await setPathForVersion(version);
            sendProgress(1, '安装完成');
            mainWindow.webContents.send('python-changed');
            return {success: true, message: 'Python 安装成功，pip 已配置'};
        } catch (err) {
            return {success: false, message: `安装失败: ${err.message}`};
        } finally {
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            pendingLocalFile = null;
        }
    });

    ipcMain.handle('install-python', async (event, version, mirror = 'https://pypi.tuna.tsinghua.edu.cn/simple') => {
        const source = pythonSources[version];
        if (!source) return {success: false, message: `不支持的 Python 版本: ${version}`};
        const {url} = source;
        const fileName = url.split('/').pop();
        const installerPath = path.join(downloadDir, fileName);
        const installPath = `C:\\Program Files\\Python\\python-${version}`;
        const sendProgress = (progress, stage = '') => {
            mainWindow.webContents.send('download-progress', {type: 'python', version, progress, stage});
        };
        const abortController = new AbortController();
        currentAbortController = abortController;
        try {
            if (!fs.existsSync(installerPath)) {
                sendProgress(0, '下载安装包');
                await downloadFile(url, installerPath, (p) => sendProgress(p, '下载安装包'), abortController.signal);
                sendProgress(0.3, '解压中');
            } else {
                sendProgress(0.3, '解压中');
            }
            await installZip(installerPath, installPath);
            sendProgress(0.5, '安装 pip 中');
            const pythonRoot = installPath;
            const pythonExe = path.join(pythonRoot, 'python.exe');
            if (!fs.existsSync(pythonExe)) throw new Error('解压后未找到 python.exe');
            await installPip(pythonExe, pythonRoot, mirror);
            sendProgress(0.8, '配置环境变量');
            const versionKey = version.replace(/\./g, '');
            await setSystemEnvVariable(`PYTHON_HOME${versionKey}`, pythonRoot);
            await setPathForVersion(version);
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
            const versions = await getAllInstalledVersions();
            const defaultVersion = await getCurrentDefaultVersion();
            return {versions, default: defaultVersion};
        } catch (err) {
            return {versions: [], default: null};
        }
    });

    ipcMain.handle('switch-python', async (event, version) => {
        try {
            const home = await findPythonHome(version);
            if (!home) throw new Error(`未找到 Python ${version} 的安装目录`);
            await setPathForVersion(version);
            mainWindow.webContents.send('python-changed');
            return {success: true, message: `已切换到 Python ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('delete-python', async (event, version) => {
        try {
            const home = await findPythonHome(version);
            if (!home) throw new Error(`未找到 Python ${version} 的安装目录`);
            const currentDefault = await getCurrentDefaultVersion();
            if (currentDefault === version) {
                const allVersions = await getAllInstalledVersions();
                const other = allVersions.find(v => v !== version);
                if (other) await setPathForVersion(other);
                else {
                    const regCmd = `C:\\Windows\\System32\\reg.exe query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path`;
                    exec(regCmd, (error, stdout) => {
                        if (!error) {
                            const match = stdout.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
                            if (match) {
                                let currentPath = match[1].trim();
                                const parts = currentPath.split(';');
                                const newParts = parts.filter(p => !/^%PYTHON_HOME\d+%$/i.test(p));
                                const newPath = newParts.join(';');
                                exec(`C:\\Windows\\System32\\setx.exe /M PATH "${newPath}"`);
                            }
                        }
                    });
                }
            }
            await removeSystemEnvVariable(`PYTHON_HOME${version.replace(/\./g, '')}`);
            fs.rmSync(home, {recursive: true, force: true});
            mainWindow.webContents.send('python-changed');
            return {success: true, message: `已删除 Python ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });
};