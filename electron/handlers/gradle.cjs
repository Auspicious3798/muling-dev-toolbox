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

module.exports = function registerGradleHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'gradle_install.log');
    const logToFile = createLogger(logFile);

    let currentAbortController = null;

    function getGradleConfig() {
        return configManager.getToolConfig('gradle') || {};
    }

    function resolveJavaHome() {
        const activeJdk = sandbox.getActiveDir('jdk');
        if (activeJdk && fs.existsSync(path.join(activeJdk, 'bin', 'java.exe'))) return activeJdk;
        if (process.env.JAVA_HOME && fs.existsSync(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'))) {
            return process.env.JAVA_HOME;
        }
        return null;
    }

    function getGradleHome() {
        return path.join(userDataPath, 'gradle-home');
    }

    function ensureAliyunInitScript() {
        const initDir = path.join(getGradleHome(), 'init.d');
        const initFile = path.join(initDir, 'muling-aliyun.gradle');
        const content = [
            'def MULING_ALIYUN = "https://maven.aliyun.com/repository/public"',
            '',
            'allprojects {',
            '    buildscript {',
            '        repositories {',
            '            maven { url MULING_ALIYUN }',
            '        }',
            '    }',
            '    repositories {',
            '        maven { url MULING_ALIYUN }',
            '        google()',
            '        mavenCentral()',
            '    }',
            '}',
            ''
        ].join('\n');
        try {
            fs.mkdirSync(initDir, {recursive: true});
            fs.writeFileSync(initFile, content, 'utf8');
            return initFile;
        } catch (err) {
            logToFile(`写入 Gradle 阿里云镜像脚本失败: ${err.message}`);
            return null;
        }
    }

    async function probeGradle(dir) {
        const bat = path.join(dir, 'bin', 'gradle.bat');
        if (!fs.existsSync(bat)) return null;
        const env = {...process.env};
        const javaHome = resolveJavaHome();
        if (javaHome) env.JAVA_HOME = javaHome;
        env.GRADLE_USER_HOME = getGradleHome();
        ensureAliyunInitScript();
        try {
            const {stdout} = await execPromise(`"${bat}" --version`, {shell: true, env, timeout: 60000});
            const match = stdout.match(/Gradle\s+(\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.]+)?)/);
            if (!match) return null;
            return match[1];
        } catch (err) {
            logToFile(`执行 ${bat} 失败: ${err.message}`);
            return null;
        }
    }

    ipcMain.on('cancel-gradle-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    ipcMain.handle('install-gradle', async (event, version) => {
        const gradleConfig = getGradleConfig();
        const targetVersion = version || gradleConfig.version;
        if (!targetVersion) {
            return {success: false, message: '无法确定 Gradle 版本'};
        }
        const versionEntry = (gradleConfig.versions && gradleConfig.versions[targetVersion]) || null;
        const downloadUrl = (versionEntry && versionEntry.url) || gradleConfig.url;
        if (!downloadUrl) {
            return {success: false, message: `没有找到 Gradle ${targetVersion} 的下载地址`};
        }
        const installPath = sandbox.installDir('gradle', targetVersion);
        const installerPath = path.join(downloadDir, 'gradle.zip');

        const sendProgress = (progress, stage = '', meta = {}) => {
            mainWindow.webContents.send('gradle-progress', {
                type: 'gradle',
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
                onProgress: (info) => sendProgress((info.percent ?? 0) * 0.5, info.retrying ? `网络中断，正在重试（${info.attempt}/3）` : '下载安装包', info),
                log: logToFile,
                label: 'Gradle下载',
                timeout: 600000,
            });
            sendProgress(0.5, '解压中');
            await installZip(installerPath, installPath, {log: logToFile, flattenPrefix: 'gradle-', onProgress: zipProgress(sendProgress, 0.5, 0.78)});
            sendProgress(0.8, '配置阿里云镜像');
            ensureAliyunInitScript();
            sendProgress(0.9, '加入沙箱环境');
            sandbox.register('gradle', targetVersion, installPath, {activate: true});
            sendProgress(1, '安装完成');
            mainWindow.webContents.send('gradle-changed');
            return {success: true, message: 'Gradle 安装成功，可在「沐柠环境终端」中直接使用 gradle', version: targetVersion};
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

    ipcMain.handle('check-gradle', async () => {
        const items = sandbox.listInstalled('gradle');
        const activeDir = sandbox.getActiveDir('gradle');
        let version = '';
        if (activeDir) {
            const probed = await probeGradle(activeDir);
            if (probed) version = probed;
        }
        return {
            installed: items.length > 0,
            version,
            versions: items.map(item => item.version),
            default: sandbox.getActive('gradle'),
            items
        };
    });

    ipcMain.handle('switch-gradle', async (event, version) => {
        try {
            if (!version) return {success: false, message: '缺少版本号'};
            sandbox.setActive('gradle', version);
            mainWindow.webContents.send('gradle-changed');
            return {success: true, message: `已切换到 Gradle ${version}`, version};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('uninstall-gradle', async (event, version) => {
        try {
            const target = version || sandbox.getActive('gradle');
            const dir = target ? sandbox.installDir('gradle', target) : sandbox.getActiveDir('gradle');
            if (dir && fs.existsSync(dir)) {
                fs.rmSync(dir, {recursive: true, force: true});
            }
            if (target) sandbox.unregister('gradle', target);
            mainWindow.webContents.send('gradle-changed');
            return {success: true, message: 'Gradle 已卸载'};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });
};
