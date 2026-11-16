const {ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const {exec} = require('child_process');
const https = require('https');
const {promisify} = require('util');
const execPromise = promisify(exec);
const configManager = require('../configManager.cjs');
const {createLogger} = require('../utils/logger.cjs');
const {downloadFile} = require('../utils/download.cjs');
const {installZip, zipProgress} = require('../utils/zip.cjs');
const sandbox = require('../utils/sandbox.cjs');
const portUtils = require('../utils/port.cjs');

const httpsAgent = new https.Agent({rejectUnauthorized: false});

module.exports = function registerNginxHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});

    const logFile = path.join(userDataPath, 'nginx_install.log');
    const DEFAULT_INSTALL_DIR = path.join(userDataPath, 'nginx');
    const logToFile = createLogger(logFile);

    function getNginxConfig() {
        const config = configManager.getToolConfig('nginx');
        if (!config) {
            logToFile('警告：无法获取 Nginx 配置，使用默认配置');
            // 返回默认配置作为后备（沙箱路径，不写死 Program Files）
            return {
                version: '1.26.3',
                installDir: sandbox.installDir('nginx', '1.26.3'),
                url: 'https://github.com/Auspicious3798/muling-dev-toolbox/releases/download/v6.0.0/nginx-1.26.3.zip',
                type: 'zip'
            };
        }
        logToFile(`成功获取 Nginx 配置，installDir: ${resolveNginxDir(config)}`);
        return config;
    }

    // 沙箱模式：Nginx 装在 %LOCALAPPDATA%\Muling\env\nginx\nginx-<version>
    function resolveNginxDir(nginxConfig) {
        const active = sandbox.getActiveDir('nginx');
        if (active && fs.existsSync(path.join(active, 'nginx.exe'))) return active;
        const installed = sandbox.listInstalled('nginx');
        if (installed.length > 0) return installed[0].dir;
        const version = (nginxConfig && nginxConfig.version) || '1.26.3';
        return sandbox.installDir('nginx', version);
    }

    let currentAbortController = null;

    async function loadSites() {
        const sitesFile = path.join(userDataPath, 'nginx_sites.json');
        if (!fs.existsSync(sitesFile)) return [];
        try {
            return JSON.parse(fs.readFileSync(sitesFile, 'utf8'));
        } catch {
            return [];
        }
    }

    async function saveSites(sites) {
        const sitesFile = path.join(userDataPath, 'nginx_sites.json');
        fs.writeFileSync(sitesFile, JSON.stringify(sites, null, 2), 'utf8');
    }

    async function isNginxRunning() {
        try {
            const {stdout} = await execPromise('tasklist /FI "IMAGENAME eq nginx.exe"');
            return stdout.includes('nginx.exe');
        } catch {
            return false;
        }
    }

    async function generateConfig(sites, nginxDir) {
        const nginxConf = path.join(nginxDir, 'conf', 'nginx.conf');
        let config = `events { worker_connections 1024; }
http {
    include mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;

`;
        for (const site of sites) {
            const rootPath = site.path.replace(/\\/g, '/');
            config += `    server {
        listen ${site.port};
        server_name localhost;
        location / {
            root ${rootPath};
            index index.html;
            try_files $uri $uri/ /index.html;
        }
    }

`;
        }
        config += `}\n`;
        fs.writeFileSync(nginxConf, config, 'utf8');
        logToFile(`配置文件已生成，站点数：${sites.length}`);
    }

    async function checkPortAvailable(port, sites) {
        if (sites && sites.some(s => Number(s.port) === Number(port))) return false;
        return portUtils.isPortAvailable(port);
    }

    async function ensureSitesPorts(sites) {
        // 端口固定：不再自动挑一个空闲端口，被占用就明确报错，让用户自己改。
        const used = new Set();
        const next = [];
        for (const site of sites) {
            const port = Number(site.port);
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                throw new Error(`站点 ${site.name} 的端口 ${site.port} 不合法，请改成 1-65535 之间的数字`);
            }
            if (used.has(port)) {
                throw new Error(`站点 ${site.name} 的端口 ${port} 和其他站点重复，请改成不同的端口`);
            }
            if (!(await portUtils.isPortAvailable(port))) {
                throw new Error(
                    `站点 ${site.name} 要用的端口 ${port} 已被占用：请把站点端口改成别的，或先关掉占用它的程序。`
                );
            }
            used.add(port);
            next.push({...site, port});
        }
        return {sites: next, changes: []};
    }

    function portChangeSummary(changes) {
        if (!changes.length) return '';
        return changes.map(c => `端口 ${c.from} 被占用，${c.name} 已改用 ${c.to}`).join('；');
    }

    ipcMain.on('cancel-nginx-download', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    function resolveNginxVersion(nginxConfig, version) {
        const list = (nginxConfig && nginxConfig.versions) || {};
        if (version && list[version]) return {version, url: list[version].url};
        const fallbackVersion = (nginxConfig && nginxConfig.version) || '1.28.3';
        if (list[fallbackVersion]) return {version: fallbackVersion, url: list[fallbackVersion].url};
        return {version: fallbackVersion, url: nginxConfig && nginxConfig.url};
    }

    ipcMain.handle('install-nginx', async (event, version) => {
        const nginxConfig = getNginxConfig();
        if (!nginxConfig) {
            return {success: false, message: '无法获取 Nginx 配置'};
        }

        const target = resolveNginxVersion(nginxConfig, version);
        if (!target.url) {
            return {success: false, message: `没有找到 Nginx ${target.version} 的下载地址`};
        }
        const downloadUrl = target.url;

        const installerPath = path.join(downloadDir, `nginx-${target.version}.zip`);
        if (!fs.existsSync(installerPath)) {
            const sendProgress = (progress, stage = '', meta = {}) => {
                if (mainWindow && mainWindow.webContents) {
                    setImmediate(() => {
                        mainWindow.webContents.send('nginx-progress', {
                            type: 'nginx',
                            progress,
                            stage,
                            speed: meta.speed || 0,
                            eta: typeof meta.eta === 'number' ? meta.eta : null,
                            received: meta.received || 0,
                            total: meta.total || null,
                        });
                    });
                }
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
                    label: 'Nginx下载',
                    timeout: 600000,
                    agent: httpsAgent,
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
        const installPath = sandbox.installDir('nginx', target.version);
        try {
            const sendProgress = (progress, stage = '') => {
                if (mainWindow && mainWindow.webContents) {
                    setImmediate(() => {
                        mainWindow.webContents.send('nginx-progress', {type: 'nginx', progress, stage});
                    });
                }
            };
            
            sendProgress(0.5, '解压中');
            await installZip(installerPath, installPath, {log: logToFile, flattenPrefix: 'nginx-', onProgress: zipProgress(sendProgress, 0.5, 0.78)});
            sendProgress(0.8, '生成配置');
            let sites = await loadSites();
            if (sites.length === 0) {
                const htmlDir = path.join(installPath, 'html');
                if (!fs.existsSync(htmlDir)) fs.mkdirSync(htmlDir, {recursive: true});
                const indexFile = path.join(htmlDir, 'index.html');
                if (!fs.existsSync(indexFile)) {
                    fs.writeFileSync(indexFile, '<!doctype html><meta charset="utf-8"><title>沐柠 Nginx</title><h1>Nginx 已就绪</h1>', 'utf8');
                }
                sites = [{name: '默认站点', path: htmlDir, port: 80}];
            }
            const ensured = await ensureSitesPorts(sites);
            sites = ensured.sites;
            await saveSites(sites);
            await generateConfig(sites, installPath);
            sandbox.register('nginx', target.version, installPath, {activate: true});
            sendProgress(1, '安装完成');
            if (fs.existsSync(installerPath)) {
                try {
                    fs.unlinkSync(installerPath);
                } catch (e) {
                }
            }
            if (mainWindow && mainWindow.webContents) {
                setImmediate(() => {
                    mainWindow.webContents.send('nginx-changed');
                });
            }
            const changes = ensured.changes;
            return {
                success: true,
                version: target.version,
                port: sites.length ? sites[0].port : 80,
                defaultPort: 80,
                portChanged: changes.length > 0,
                ports: sites.map(s => s.port),
                changes,
                message: changes.length
                    ? `Nginx 安装成功，${portChangeSummary(changes)}`
                    : 'Nginx 安装成功',
            };
        } catch (err) {
            logToFile(`安装失败: ${err.message}`);
            // 检查是否是权限错误
            if (err.code === 'EPERM' || err.code === 'EACCES') {
                return {
                    success: false,
                    message: '安装失败：没有权限写入该目录。请右键点击应用，选择“以管理员身份运行”后重试。'
                };
            }
            return {success: false, message: `安装失败：${err.message}`};
        }
    });

    ipcMain.handle('check-nginx', async () => {
        const nginxConfig = getNginxConfig();
        const installPath = resolveNginxDir(nginxConfig);
        const nginxExe = path.join(installPath, 'nginx.exe');
        const installed = fs.existsSync(nginxExe);
        let version = '';
        if (installed) {
            try {
                const {stdout} = await execPromise(`"${nginxExe}" -v 2>&1`);
                const match = stdout.match(/nginx\/(\d+\.\d+\.\d+)/);
                if (match) version = match[1];
            } catch (e) {
            }
        }
        const items = sandbox.listInstalled('nginx');
        return {
            installed,
            version,
            versions: items.map(item => item.version),
            default: sandbox.getActive('nginx'),
            items
        };
    });

    ipcMain.handle('switch-nginx', async (event, version) => {
        try {
            if (!version) return {success: false, message: '没有指定要切换的版本'};
            const dir = sandbox.installDir('nginx', version);
            if (!fs.existsSync(path.join(dir, 'nginx.exe'))) {
                return {success: false, message: `Nginx ${version} 的安装目录不完整`};
            }
            const wasRunning = await isNginxRunning();
            if (wasRunning) {
                const currentDir = resolveNginxDir(getNginxConfig());
                const currentExe = path.join(currentDir, 'nginx.exe');
                try {
                    await execPromise(`"${currentExe}" -p "${currentDir}" -s stop`, {windowsHide: true});
                } catch (e) {
                    logToFile(`停止旧版本 Nginx 失败: ${e.message}`);
                }
            }
            sandbox.setActive('nginx', version);
            const sites = await loadSites();
            await generateConfig(sites, dir);
            if (wasRunning) {
                try {
                    await execPromise(`"${path.join(dir, 'nginx.exe')}" -p "${dir}"`, {windowsHide: true});
                } catch (e) {
                    logToFile(`启动新版本 Nginx 失败: ${e.message}`);
                }
            }
            if (mainWindow && mainWindow.webContents) {
                setImmediate(() => {
                    mainWindow.webContents.send('nginx-changed');
                });
            }
            return {success: true, message: `已切换到 Nginx ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('uninstall-nginx', async (event, version) => {
        try {
            const nginxConfig = getNginxConfig();
            const targetVersion = version || sandbox.getActive('nginx');
            const installPath = targetVersion
                ? sandbox.installDir('nginx', targetVersion)
                : resolveNginxDir(nginxConfig);
            const isActive = !targetVersion || targetVersion === sandbox.getActive('nginx');
            const running = await isNginxRunning();
            if (running && isActive) {
                const nginxExe = path.join(installPath, 'nginx.exe');
                // 添加 -p 参数，与启动时的 prefix 保持一致
                await execPromise(`"${nginxExe}" -p "${installPath}" -s stop`, {windowsHide: true});
            }
            if (fs.existsSync(installPath)) {
                fs.rmSync(installPath, {recursive: true, force: true});
            }
            if (targetVersion) sandbox.unregister('nginx', targetVersion);
            const remaining = sandbox.listInstalled('nginx');
            if (remaining.length === 0) {
                const sitesFile = path.join(userDataPath, 'nginx_sites.json');
                if (fs.existsSync(sitesFile)) fs.unlinkSync(sitesFile);
            }
            if (mainWindow && mainWindow.webContents) {
                setImmediate(() => {
                    mainWindow.webContents.send('nginx-changed');
                });
            }
            return {success: true, message: 'Nginx 已卸载'};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('get-nginx-sites', async () => {
        const sites = await loadSites();
        return {sites};
    });

    ipcMain.handle('get-nginx-status', async () => {
        const running = await isNginxRunning();
        return {running};
    });

    ipcMain.handle('start-nginx', async () => {
        try {
            const nginxConfig = getNginxConfig();
            const installPath = resolveNginxDir(nginxConfig);
            const nginxExe = path.join(installPath, 'nginx.exe');
            if (!fs.existsSync(nginxExe)) return {success: false, message: 'Nginx 未安装'};
            const running = await isNginxRunning();
            if (running) return {success: false, message: 'Nginx 已在运行'};
            let sites = await loadSites();
            const ensured = await ensureSitesPorts(sites);
            sites = ensured.sites;
            if (ensured.changes.length) await saveSites(sites);
            await generateConfig(sites, installPath);
            
            // 使用 spawn 在 Nginx 目录下启动
            const {spawn} = require('child_process');
            const nginxProcess = spawn(nginxExe, ['-p', installPath], {
                cwd: installPath,
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            });
            
            nginxProcess.unref();
            
            logToFile(`尝试启动 Nginx，工作目录: ${installPath}`);
            
            setTimeout(async () => {
                const stillRunning = await isNginxRunning();
                if (stillRunning) {
                    logToFile('Nginx 启动成功');
                } else {
                    logToFile('Nginx 启动失败，请检查配置文件和日志');
                }
            }, 2000);
            
            return {
                success: true,
                ports: sites.map(s => s.port),
                portChanged: ensured.changes.length > 0,
                changes: ensured.changes,
                message: ensured.changes.length
                    ? `Nginx 已启动，${portChangeSummary(ensured.changes)}`
                    : 'Nginx 已启动',
            };
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('stop-nginx', async () => {
        try {
            const nginxConfig = getNginxConfig();
            const installPath = resolveNginxDir(nginxConfig);
            const nginxExe = path.join(installPath, 'nginx.exe');
            if (!fs.existsSync(nginxExe)) return {success: false, message: 'Nginx 未安装'};
            const running = await isNginxRunning();
            if (!running) return {success: false, message: 'Nginx 未运行'};
            // 添加 -p 参数，与启动时的 prefix 保持一致
            await execPromise(`"${nginxExe}" -p "${installPath}" -s stop`, {windowsHide: true});
            return {success: true, message: 'Nginx 已停止'};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('reload-nginx', async () => {
        try {
            const nginxConfig = getNginxConfig();
            const installPath = resolveNginxDir(nginxConfig);
            const nginxExe = path.join(installPath, 'nginx.exe');
            const nginxConf = path.join(installPath, 'conf', 'nginx.conf');
            
            if (!fs.existsSync(nginxExe)) return {success: false, message: 'Nginx 未安装'};
            if (!fs.existsSync(nginxConf)) return {success: false, message: 'Nginx 配置文件不存在'};
            
            const running = await isNginxRunning();
            if (!running) return {success: false, message: 'Nginx 未运行'};
            
            const sites = await loadSites();
            await generateConfig(sites, installPath);
            
            // 重载时 master 已记住 prefix，只需发送 reload 信号
            await execPromise(`"${nginxExe}" -p "${installPath}" -s reload`, {windowsHide: true});
            logToFile('Nginx 重载成功');
            return {success: true, message: 'Nginx 配置已重载'};
        } catch (err) {
            logToFile(`Nginx 重载失败: ${err.message}`);
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('add-nginx-site', async (event, {name, path: distPath, port}) => {
        logToFile(`尝试添加站点: name=${name}, path=${distPath}, port=${port}`);
        
        // 检查 Nginx 是否安装
        const nginxConfig = getNginxConfig();
        if (!nginxConfig) {
            return {success: false, message: '无法获取 Nginx 配置'};
        }
        const installPath = resolveNginxDir(nginxConfig);
        
        const nginxExe = path.join(installPath, 'nginx.exe');
        if (!fs.existsSync(nginxExe)) {
            return {success: false, message: 'Nginx 未安装，请先安装 Nginx'};
        }
        
        // 验证 dist 目录
        if (!distPath || !fs.existsSync(distPath)) {
            return {success: false, message: 'dist 目录不存在'};
        }
        
        let sites = await loadSites();

        let finalPort = port;
        let portChanged = false;
        let requestedPort = port;
        if (!finalPort || finalPort <= 0) {
            let candidate = 8080;
            while (!(await checkPortAvailable(candidate, sites))) candidate++;
            finalPort = candidate;
        } else if (!(await checkPortAvailable(finalPort, sites))) {
            const found = await portUtils.findAvailablePort(Number(finalPort));
            if (found === null) {
                return {success: false, message: `端口 ${finalPort} 已被占用，且没有找到替代端口`};
            }
            requestedPort = finalPort;
            finalPort = found;
            portChanged = true;
        }
        
        // 检查站点名称
        if (sites.some(s => s.name === name)) {
            return {success: false, message: '站点名称已存在'};
        }
        
        // 添加站点
        sites.push({name, path: distPath, port: finalPort});
        await saveSites(sites);
        logToFile(`站点已保存: ${name}, 端口: ${finalPort}`);
        
        // 重新生成配置文件
        try {
            await generateConfig(sites, installPath);
            logToFile('Nginx 配置文件已更新');
        } catch (err) {
            logToFile(`生成配置文件失败: ${err.message}`);
            return {success: false, message: `生成配置文件失败: ${err.message}`};
        }
        
        return {
            success: true,
            port: finalPort,
            defaultPort: requestedPort,
            portChanged,
            message: portChanged
                ? `端口 ${requestedPort} 已被占用，站点已改用 ${finalPort}`
                : undefined,
        };
    });

    ipcMain.handle('delete-nginx-site', async (event, port) => {
        let sites = await loadSites();
        const newSites = sites.filter(s => s.port !== port);
        if (newSites.length === sites.length) {
            return {success: false, message: '站点不存在'};
        }
        await saveSites(newSites);
        return {success: true};
    });

    // 更新站点信息
    ipcMain.handle('update-nginx-site', async (event, {originalPort, name, path: distPath, port}) => {
        logToFile(`尝试更新站点: originalPort=${originalPort}, name=${name}, path=${distPath}, port=${port}`);
        
        // 检查 Nginx 是否安装
        const nginxConfig = getNginxConfig();
        if (!nginxConfig) {
            return {success: false, message: '无法获取 Nginx 配置'};
        }
        const installPath = resolveNginxDir(nginxConfig);
        
        const nginxExe = path.join(installPath, 'nginx.exe');
        if (!fs.existsSync(nginxExe)) {
            return {success: false, message: 'Nginx 未安装，请先安装 Nginx'};
        }
        
        // 验证 dist 目录
        if (!distPath || !fs.existsSync(distPath)) {
            return {success: false, message: 'dist 目录不存在'};
        }
        
        let sites = await loadSites();
        
        // 查找原始站点
        const siteIndex = sites.findIndex(s => s.port === originalPort);
        if (siteIndex === -1) {
            return {success: false, message: '站点不存在'};
        }
        
        // 如果修改了端口，需要检查新端口是否可用
        let finalPort = port || originalPort;
        if (finalPort !== originalPort) {
            // 检查新端口是否被其他站点使用
            if (sites.some(s => s.port === finalPort && s.port !== originalPort)) {
                return {success: false, message: `端口 ${finalPort} 已被其他站点使用`};
            }
            // 检查端口是否被系统占用
            if (!(await checkPortAvailable(finalPort, sites.filter(s => s.port !== originalPort)))) {
                return {success: false, message: `端口 ${finalPort} 已被系统进程占用`};
            }
        }
        
        // 检查站点名称是否与其他站点重复（排除自己）
        if (sites.some(s => s.name === name && s.port !== originalPort)) {
            return {success: false, message: '站点名称已存在'};
        }
        
        // 更新站点
        sites[siteIndex] = {name, path: distPath, port: finalPort};
        await saveSites(sites);
        logToFile(`站点已更新: ${name}, 端口: ${finalPort}`);
        
        // 重新生成配置文件
        try {
            await generateConfig(sites, installPath);
            logToFile('Nginx 配置文件已更新');
        } catch (err) {
            logToFile(`生成配置文件失败: ${err.message}`);
            return {success: false, message: `生成配置文件失败: ${err.message}`};
        }
        
        return {success: true, port: finalPort};
    });

    // 检查端口是否可用
    ipcMain.handle('check-port-available', async (event, port) => {
        try {
            const sites = await loadSites();
            const available = await checkPortAvailable(port, sites);
            return {available};
        } catch (err) {
            logToFile(`检查端口失败: ${err.message}`);
            return {available: true}; // 出错时默认认为可用
        }
    });
};