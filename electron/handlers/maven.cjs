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

module.exports = function registerMavenHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'maven_install.log');
    const logToFile = createLogger(logFile);

    let currentAbortController = null;

    function getMavenConfig() {
        return configManager.getToolConfig('maven');
    }

    // Maven 运行必须能找到 JDK：优先用沙箱里当前激活的 JDK
    function resolveJavaHome() {
        const activeJdk = sandbox.getActiveDir('jdk');
        if (activeJdk && fs.existsSync(path.join(activeJdk, 'bin', 'java.exe'))) return activeJdk;
        if (process.env.JAVA_HOME && fs.existsSync(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'))) {
            return process.env.JAVA_HOME;
        }
        return null;
    }

    // 写入阿里云镜像，制品只从阿里云公共仓库拉取，避免直连中央仓库被墙
    function ensureAliyunSettings(installPath) {
        const confDir = path.join(installPath, 'conf');
        const settingsPath = path.join(confDir, 'settings.xml');
        const content = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"',
            '          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
            '          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0 https://maven.apache.org/xsd/settings-1.0.0.xsd">',
            '  <mirrors>',
            '    <mirror>',
            '      <id>aliyun-public</id>',
            '      <name>Aliyun Public Repository</name>',
            '      <url>https://maven.aliyun.com/repository/public</url>',
            '      <mirrorOf>central</mirrorOf>',
            '    </mirror>',
            '  </mirrors>',
            '</settings>',
            ''
        ].join('\n');
        try {
            fs.mkdirSync(confDir, {recursive: true});
            fs.writeFileSync(settingsPath, content, 'utf8');
            return settingsPath;
        } catch (err) {
            logToFile(`写入 Maven 阿里云镜像配置失败: ${err.message}`);
            return null;
        }
    }

    async function probeMaven(dir) {
        const mvnCmd = path.join(dir, 'bin', 'mvn.cmd');
        if (!fs.existsSync(mvnCmd)) return null;
        const env = {...process.env};
        const javaHome = resolveJavaHome();
        if (javaHome) env.JAVA_HOME = javaHome;
        ensureAliyunSettings(dir);
        try {
            const {stdout} = await execPromise(`"${mvnCmd}" --version`, {shell: true, env});
            if (!stdout.includes('Apache Maven')) return null;
            const versionMatch = stdout.match(/Apache Maven (\d+\.\d+\.\d+)/);
            return versionMatch ? versionMatch[1] : '';
        } catch (err) {
            logToFile(`执行 ${mvnCmd} 失败: ${err.message}`);
            return null;
        }
    }

    ipcMain.on('cancel-maven-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    function resolveVersionEntry(mavenConfig, version) {
        const list = (mavenConfig && mavenConfig.versions) || {};
        if (version && list[version]) return {version, url: list[version].url};
        const fallbackVersion = (mavenConfig && mavenConfig.version) || '3.9.16';
        if (list[fallbackVersion]) return {version: fallbackVersion, url: list[fallbackVersion].url};
        return {version: fallbackVersion, url: mavenConfig && mavenConfig.url};
    }

    ipcMain.handle('install-maven', async (event, version) => {
        const mavenConfig = getMavenConfig();
        if (!mavenConfig) {
            return {success: false, message: '无法获取 Maven 配置'};
        }
        const target = resolveVersionEntry(mavenConfig, version);
        if (!target.url) {
            return {success: false, message: `没有找到 Maven ${target.version} 的下载地址`};
        }
        // 沙箱模式：统一装到 %LOCALAPPDATA%\Muling\env\maven\maven-<version>
        const installPath = sandbox.installDir('maven', target.version);

        const installerPath = path.join(downloadDir, `maven-${target.version}.zip`);
        if (!fs.existsSync(installerPath)) {
            const sendProgress = (progress, stage = '', meta = {}) => {
                mainWindow.webContents.send('maven-progress', {
                    type: 'maven',
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
                    url: target.url,
                    destPath: installerPath,
                    signal: abortController.signal,
                    onProgress: (info) => sendProgress((info.percent ?? 0) * 0.5, info.retrying ? `网络中断，正在重试（${info.attempt}/3）` : '下载安装包', info),
                    log: logToFile,
                    label: 'Maven下载',
                    timeout: 600000,
                });
                sendProgress(0.5, '解压中');
            } catch (err) {
                if (err.message === '下载已取消') return {success: false, message: '下载已取消'};
                logToFile(`下载失败: ${err.message}`);
                return {success: false, message: `下载失败: ${err.message}`};
            } finally {
                if (currentAbortController === abortController) currentAbortController = null;
            }
        }
        try {
            const sendProgress = (progress, stage = '') => {
                mainWindow.webContents.send('maven-progress', {type: 'maven', progress, stage});
            };

            sendProgress(0.5, '解压中');
            await installZip(installerPath, installPath, {log: logToFile, flattenPrefix: 'apache-maven-', onProgress: zipProgress(sendProgress, 0.5, 0.78)});
            sendProgress(0.8, '配置阿里云镜像');
            ensureAliyunSettings(installPath);
            sendProgress(0.9, '加入沙箱环境');
            sandbox.register('maven', target.version, installPath, {activate: true});
            sendProgress(1, '安装完成');
            mainWindow.webContents.send('maven-changed');
            return {success: true, version: target.version, message: 'Maven ' + target.version + ' 安装成功，可在「沐柠环境终端」中直接使用 mvn'};
        } catch (err) {
            logToFile(`安装失败: ${err.message}`);
            return {success: false, message: `安装失败: ${err.message}`};
        } finally {
            if (fs.existsSync(installerPath)) {
                try {
                    fs.unlinkSync(installerPath);
                } catch (e) {
                }
            }
        }
    });

    ipcMain.handle('check-maven', async () => {
        const items = sandbox.listInstalled('maven');
        const activeDir = sandbox.getActiveDir('maven');
        let version = '';
        if (activeDir) {
            const probed = await probeMaven(activeDir);
            if (probed !== null) version = probed;
        }
        return {
            installed: items.length > 0 || Boolean(version),
            version,
            versions: items.map(item => item.version),
            default: sandbox.getActive('maven'),
            items
        };
    });

    ipcMain.handle('switch-maven', async (event, version) => {
        try {
            if (!version) return {success: false, message: '没有指定要切换的版本'};
            const dir = sandbox.installDir('maven', version);
            if (!fs.existsSync(path.join(dir, 'bin', 'mvn.cmd'))) {
                return {success: false, message: `Maven ${version} 的安装目录不完整`};
            }
            ensureAliyunSettings(dir);
            sandbox.setActive('maven', version);
            mainWindow.webContents.send('maven-changed');
            return {success: true, message: `已切换到 Maven ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('uninstall-maven', async (event, version) => {
        try {
            const target = version || sandbox.getActive('maven');
            const dir = target ? sandbox.getVersionDir('maven', target) : sandbox.getActiveDir('maven');
            const removal = sandbox.removeDirIfSandboxed(dir);
            if (target) sandbox.unregister('maven', target);
            mainWindow.webContents.send('maven-changed');
            if (!removal.sandboxed) {
                return {success: true, message: '已解除 Maven 的登记，文件仍保留在 ' + removal.dir};
            }
            return {success: true, message: 'Maven 已卸载'};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });
};
