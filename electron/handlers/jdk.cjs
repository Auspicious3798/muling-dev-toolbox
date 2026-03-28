const {ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const {exec} = require('child_process');
const axios = require('axios');
const AdmZip = require('adm-zip');
const {promisify} = require('util');
const execPromise = promisify(exec);

const jdkSources = {
    '26': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-26_windows-x64_bin.msi',
        type: 'msi'
    },
    '25': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-25_windows-x64_bin.msi',
        type: 'msi'
    },
    '21': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-21_windows-x64_bin.msi',
        type: 'msi'
    },
    '17': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-17.0.18_windows-x64_bin.msi',
        type: 'msi'
    },
    '11': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-11.0.30_windows-x64_bin.zip',
        type: 'zip'
    },
    '8': {
        url: 'https://ghfast.top/https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v1.0.0/jdk-8u481-windows-x64.zip',
        type: 'zip'
    }
};

let currentAbortController = null;

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

function installMsi(msiPath, installDir) {
    return new Promise((resolve, reject) => {
        const cmd = `msiexec /i "${msiPath}" /quiet /norestart INSTALLDIR="${installDir}"`;
        exec(cmd, {windowsHide: true}, (error, stdout, stderr) => {
            if (error) {
                console.error('msiexec error:', error);
                console.error('stderr:', stderr);
                reject(new Error(`msiexec 失败: ${error.message}\n${stderr}`));
            } else {
                resolve();
            }
        });
    });
}

function installExe(exePath, installDir) {
    return new Promise((resolve, reject) => {
        const cmd = `"${exePath}" /S /D=${installDir}`;
        exec(cmd, {windowsHide: true}, (error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function installZip(zipPath, installDir) {
    return new Promise((resolve, reject) => {
        try {
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(installDir, true);
            resolve();
        } catch (err) {
            reject(err);
        }
    });
}

function setSystemEnvVariable(name, value) {
    return new Promise((resolve, reject) => {
        const psScript = `
      [Environment]::SetEnvironmentVariable("${name}", "${value}", "Machine")
      $env:${name} = "${value}"
    `;
        exec(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, (error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function removeSystemEnvVariable(name) {
    return new Promise((resolve, reject) => {
        const psScript = `
      [Environment]::SetEnvironmentVariable("${name}", $null, "Machine")
      Remove-Item Env:${name} -ErrorAction SilentlyContinue
    `;
        exec(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, (error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function addToPathViaJavaHome(version, jdkRoot) {
    return new Promise(async (resolve, reject) => {
        const javaHomeVar = `JAVA_HOME${version}`;
        try {
            await setSystemEnvVariable(javaHomeVar, jdkRoot);
            const pathVar = `%${javaHomeVar}%\\bin`;
            const psAdd = `
        $path = [Environment]::GetEnvironmentVariable("Path", "Machine")
        if ($path -split ";" -notcontains "${pathVar}") {
          $newPath = "${pathVar};" + $path
          [Environment]::SetEnvironmentVariable("Path", $newPath, "Machine")
        }
      `;
            exec(`powershell -Command "${psAdd.replace(/"/g, '\\"')}"`, (error) => {
                if (error) reject(error);
                else resolve();
            });
        } catch (err) {
            reject(err);
        }
    });
}

function removeFromPathViaJavaHome(version) {
    return new Promise(async (resolve, reject) => {
        const javaHomeVar = `JAVA_HOME${version}`;
        const pathVar = `%${javaHomeVar}%\\bin`;
        const psRemove = `
      $path = [Environment]::GetEnvironmentVariable("Path", "Machine")
      $parts = $path -split ";"
      $newParts = @()
      foreach ($p in $parts) {
        if ($p -ne "${pathVar}") {
          $newParts += $p
        }
      }
      $newPath = $newParts -join ";"
      [Environment]::SetEnvironmentVariable("Path", $newPath, "Machine")
    `;
        exec(`powershell -Command "${psRemove.replace(/"/g, '\\"')}"`, (error) => {
            if (error) reject(error);
            else resolve();
        });
        await removeSystemEnvVariable(javaHomeVar);
    });
}

async function getDefaultJDKVersion() {
    try {
        const {stdout} = await execPromise('echo %JAVA_HOME%');
        const javaHome = stdout.trim();
        if (!javaHome) return null;
        const releaseFile = path.join(javaHome, 'release');
        if (fs.existsSync(releaseFile)) {
            const release = fs.readFileSync(releaseFile, 'utf8');
            const match = release.match(/JAVA_VERSION="([0-9]+)/);
            if (match && match[1]) return match[1];
        }
        const {stdout: versionOut} = await execPromise('java -version 2>&1');
        const versionMatch = versionOut.match(/version "([0-9]+)/);
        if (versionMatch && versionMatch[1]) return versionMatch[1];
        return null;
    } catch (err) {
        return null;
    }
}

async function detectInstalledJDK() {
    const versions = new Set();
    const knownDirs = [
        'C:\\Program Files\\Java',
        'C:\\Program Files\\Eclipse Adoptium',
        'C:\\Program Files\\OpenJDK'
    ];
    for (const base of knownDirs) {
        if (fs.existsSync(base)) {
            const dirs = fs.readdirSync(base);
            for (const dir of dirs) {
                const fullPath = path.join(base, dir);
                const releaseFile = path.join(fullPath, 'release');
                if (fs.existsSync(releaseFile)) {
                    try {
                        const release = fs.readFileSync(releaseFile, 'utf8');
                        const match = release.match(/JAVA_VERSION="([0-9]+)/);
                        if (match && match[1]) versions.add(match[1]);
                    } catch (e) {
                    }
                }
            }
        }
    }
    const sortedVersions = Array.from(versions).sort((a, b) => Number(b) - Number(a));
    const defaultVersion = await getDefaultJDKVersion();
    return {versions: sortedVersions, default: defaultVersion};
}

async function findJDKHome(version) {
    const knownDirs = [
        'C:\\Program Files\\Java',
        'C:\\Program Files\\Eclipse Adoptium',
        'C:\\Program Files\\OpenJDK'
    ];
    for (const base of knownDirs) {
        if (fs.existsSync(base)) {
            const dirs = fs.readdirSync(base);
            for (const dir of dirs) {
                const fullPath = path.join(base, dir);
                const releaseFile = path.join(fullPath, 'release');
                if (fs.existsSync(releaseFile)) {
                    const release = fs.readFileSync(releaseFile, 'utf8');
                    const match = release.match(/JAVA_VERSION="([0-9]+)/);
                    if (match && match[1] === version) {
                        return fullPath;
                    }
                }
            }
        }
    }
    return null;
}

module.exports = function registerJDKHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    ipcMain.on('cancel-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    ipcMain.handle('install-jdk', async (event, version, installPath) => {
        const source = jdkSources[version];
        if (!source) return {success: false, message: `不支持的 JDK 版本: ${version}`};

        const {url, type} = source;
        const fileName = url.split('/').pop();
        const installerPath = path.join(downloadDir, fileName);

        const sendProgress = (progress) => {
            mainWindow.webContents.send('download-progress', {type: 'jdk', version, progress});
        };

        const abortController = new AbortController();
        currentAbortController = abortController;

        try {
            if (!fs.existsSync(installerPath)) {
                sendProgress(0);
                await downloadFile(url, installerPath, sendProgress, abortController.signal);
                sendProgress(1);
            } else {
                sendProgress(1);
            }

            if (type === 'msi') {
                await installMsi(installerPath, installPath);
            } else if (type === 'exe') {
                await installExe(installerPath, installPath);
            } else if (type === 'zip') {
                await installZip(installerPath, installPath);
            }

            let jdkRoot = installPath;
            if (type === 'zip') {
                const entries = fs.readdirSync(installPath, {withFileTypes: true});
                const subdirs = entries.filter(e => e.isDirectory());
                if (subdirs.length === 1) {
                    jdkRoot = path.join(installPath, subdirs[0].name);
                }
            }

            const jdkBin = path.join(jdkRoot, 'bin');
            if (!fs.existsSync(jdkBin)) throw new Error('安装后未找到 bin 目录');

            await addToPathViaJavaHome(version, jdkRoot);
            return {success: true, message: 'JDK 安装成功'};
        } catch (err) {
            if (err.message === '下载已取消') {
                return {success: false, message: '下载已取消'};
            }
            return {success: false, message: `安装失败: ${err.message}`};
        } finally {
            if (currentAbortController === abortController) {
                currentAbortController = null;
            }
            if (fs.existsSync(installerPath)) {
                try {
                    fs.unlinkSync(installerPath);
                } catch (e) {
                }
            }
        }
    });

    ipcMain.handle('import-local-jdk', async (event, filePath, installPath) => {
        const ext = path.extname(filePath).toLowerCase();
        let type;
        if (ext === '.msi') type = 'msi';
        else if (ext === '.exe') type = 'exe';
        else if (ext === '.zip') type = 'zip';
        else return {success: false, message: '不支持的文件类型'};

        const fileName = path.basename(filePath);
        const destPath = path.join(downloadDir, fileName);
        fs.copyFileSync(filePath, destPath);

        try {
            if (type === 'msi') {
                await installMsi(destPath, installPath);
            } else if (type === 'exe') {
                await installExe(destPath, installPath);
            } else if (type === 'zip') {
                await installZip(destPath, installPath);
            }

            let jdkRoot = installPath;
            if (type === 'zip') {
                const entries = fs.readdirSync(installPath, {withFileTypes: true});
                const subdirs = entries.filter(e => e.isDirectory());
                if (subdirs.length === 1) {
                    jdkRoot = path.join(installPath, subdirs[0].name);
                }
            }
            const jdkBin = path.join(jdkRoot, 'bin');
            if (!fs.existsSync(jdkBin)) throw new Error('未找到 bin 目录');

            const version = await extractVersionFromPath(jdkRoot);
            await addToPathViaJavaHome(version, jdkRoot);
            return {success: true, message: 'JDK 导入成功'};
        } catch (err) {
            return {success: false, message: `导入失败: ${err.message}`};
        } finally {
            if (fs.existsSync(destPath)) {
                try {
                    fs.unlinkSync(destPath);
                } catch (e) {
                }
            }
        }
    });

    ipcMain.handle('check-jdk', async () => {
        try {
            return await detectInstalledJDK();
        } catch (err) {
            return {versions: [], default: null};
        }
    });

    ipcMain.handle('switch-jdk', async (event, version) => {
        try {
            const jdkHome = await findJDKHome(version);
            if (!jdkHome) throw new Error(`未找到 JDK ${version} 的安装目录`);
            const javaHomeVar = `JAVA_HOME${version}`;
            await setSystemEnvVariable('JAVA_HOME', `%${javaHomeVar}%`);
            return {success: true, message: `已切换到 JDK ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('delete-jdk', async (event, version) => {
        try {
            const jdkHome = await findJDKHome(version);
            if (!jdkHome) throw new Error(`未找到 JDK ${version} 的安装目录`);
            await removeFromPathViaJavaHome(version);
            fs.rmSync(jdkHome, {recursive: true, force: true});
            return {success: true, message: `已删除 JDK ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });
};

async function extractVersionFromPath(jdkRoot) {
    const releaseFile = path.join(jdkRoot, 'release');
    if (fs.existsSync(releaseFile)) {
        const release = fs.readFileSync(releaseFile, 'utf8');
        const match = release.match(/JAVA_VERSION="([0-9]+)/);
        if (match && match[1]) return match[1];
    }
    const basename = path.basename(jdkRoot);
    const match = basename.match(/(\d+)/);
    if (match) return match[1];
    throw new Error('无法从路径提取 JDK 版本号');
}