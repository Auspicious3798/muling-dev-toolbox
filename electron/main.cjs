const {app, BrowserWindow, ipcMain, protocol, dialog, Menu, Tray, nativeImage} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {execSync, execFileSync} = require('child_process');
const configManager = require('./configManager.cjs');
const sandbox = require('./utils/sandbox.cjs');
const registerJDKHandlers = require('./handlers/jdk.cjs');
const registerPythonHandlers = require('./handlers/python.cjs');
const registerMysqlHandlers = require('./handlers/mysql.cjs');
const registerRedisHandlers = require('./handlers/redis.cjs');
const registerMavenHandlers = require('./handlers/maven.cjs');
const registerGradleHandlers = require('./handlers/gradle.cjs');
const registerUvHandlers = require('./handlers/uv.cjs');
const registerNodejsHandlers = require('./handlers/nodejs.cjs');
const registerNginxHandlers = require('./handlers/nginx.cjs');
const registerTerminalHandlers = require('./terminal.cjs');
const registerIntegrityHandlers = require('./integrity.cjs');
const registerBackupHandlers = require('./backup.cjs');

let mainWindow;
let tray = null;
let splashWindow = null;
let splashShownAt = 0;
let isQuitting = false;
let closeBehavior = 'tray';
// 渲染档位：auto 按硬件探测，lite/full 由用户在设置里强制
let renderMode = 'auto';
let lastRenderProfile = null;

const SPLASH_MIN_MS = 3000;
const SPLASH_MAX_MS = 12000;
// 轻量档位下缩短启动页停留时间，弱机器上等待感更明显
let splashMinMs = SPLASH_MIN_MS;
const WINDOW_FADE_MS = 280;
const IS_AUTOSTART = process.argv.includes('--autostart');
let quitConfirmed = false;
const SERVICE_LABELS = {mysql: 'MySQL', redis: 'Redis', nginx: 'Nginx'};

function launchStateFile() {
    return path.join(app.getPath('userData'), 'launch-state.json');
}

function readLaunchState() {
    try {
        const raw = fs.readFileSync(launchStateFile(), 'utf8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {services: {}};
    } catch (err) {
        return {services: {}};
    }
}

function writeLaunchState(state) {
    try {
        fs.writeFileSync(launchStateFile(), JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
        logToFile(`[Launch] 保存启动状态失败: ${err.message}`);
    }
}

function createSplashWindow(useTransparent = true) {
    if (splashWindow && !splashWindow.isDestroyed()) return splashWindow;

    splashWindow = new BrowserWindow({
        width: 420,
        height: 300,
        frame: false,
        transparent: useTransparent,
        resizable: false,
        movable: true,
        maximizable: false,
        minimizable: false,
        fullscreenable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        show: false,
        backgroundColor: useTransparent ? '#00000000' : '#0b1120',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            devTools: false,
        }
    });

    splashWindow.setAlwaysOnTop(true, 'screen-saver');
    splashWindow.loadFile(path.join(__dirname, 'splash.html')).catch((err) => {
        logToFile(`[Splash] 启动页加载失败 ${err.message}`);
    });

    let splashShown = false;
    const showSplash = () => {
        if (splashShown) return;
        if (!splashWindow || splashWindow.isDestroyed()) return;
        splashShown = true;
        splashShownAt = Date.now();
        splashWindow.center();
        splashWindow.show();
        logToFile('[Splash] 启动页已显示');
    };

    splashWindow.once('ready-to-show', showSplash);
    splashWindow.webContents.once('did-finish-load', showSplash);
    setTimeout(showSplash, 800);

    splashWindow.on('closed', () => {
        splashWindow = null;
    });

    return splashWindow;
}

function destroySplash() {
    if (!splashWindow || splashWindow.isDestroyed()) {
        splashWindow = null;
        return;
    }
    const target = splashWindow;
    splashWindow = null;
    try {
        target.destroy();
    } catch (err) {
        // 已经销毁
    }
}

function fadeInMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
        mainWindow.setOpacity(0);
        mainWindow.show();
        const startedAt = Date.now();
        const timer = setInterval(() => {
            if (!mainWindow || mainWindow.isDestroyed()) {
                clearInterval(timer);
                return;
            }
            const ratio = Math.min(1, (Date.now() - startedAt) / WINDOW_FADE_MS);
            mainWindow.setOpacity(ratio);
            if (ratio >= 1) clearInterval(timer);
        }, 16);
        mainWindow.once('closed', () => clearInterval(timer));
    } catch (err) {
        mainWindow.show();
    }
}

function getWindowSettingsPath() {
    return path.join(app.getPath('userData'), 'window-settings.json');
}

function loadWindowSettings() {
    try {
        const raw = fs.readFileSync(getWindowSettingsPath(), 'utf8');
        const data = JSON.parse(raw);
        if (data && (data.closeBehavior === 'exit' || data.closeBehavior === 'tray')) {
            closeBehavior = data.closeBehavior;
        }
        if (data && (data.renderMode === 'auto' || data.renderMode === 'lite' || data.renderMode === 'full')) {
            renderMode = data.renderMode;
        }
    } catch (err) {
        // 首次运行没有配置文件，沿用默认值
    }
}

function saveWindowSettings() {
    try {
        fs.writeFileSync(getWindowSettingsPath(), JSON.stringify({closeBehavior, renderMode}), 'utf8');
    } catch (err) {
        console.error('[Tray] 保存窗口设置失败:', err.message);
    }
}

const logFile = path.join(app.getPath('userData'), 'app_protocol.log');

function logToFile(message) {
    const timestamp = new Date().toISOString();
    try {
        fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
    } catch (err) {
        // 日志目录不可写时不能影响启动流程
    }
}

// 主进程里任何未捕获的异常都会让窗口停在「创建了但没加载页面」的白屏状态，
// 这里兜底：写日志 + 显示启动错误页，至少让人看到失败原因，而不是一片白。
function reportFatal(stage, err) {
    const detail = err && err.stack ? err.stack : String(err);
    logToFile(`[Fatal] ${stage}: ${detail}`);
    const render = () => {
        try {
            showStartupPage({
                title: '沐柠环境盒启动失败',
                message: `${stage}：${err && err.message ? err.message : String(err)}`,
                hints: [
                    '可以关闭本页后重新打开软件',
                    '若反复出现，请把 %APPDATA%\\muling-environment-box\\app_protocol.log 反馈给我们',
                ],
            });
        } catch (pageErr) {
            // 连错误页都起不来时只能依赖日志
        }
    };
    if (app.isReady()) render();
    else app.whenReady().then(render).catch(() => {});
}

process.on('uncaughtException', (err) => reportFatal('主进程未捕获异常', err));
process.on('unhandledRejection', (reason) => reportFatal('主进程 Promise 未处理', reason));

// 检查是否以管理员身份运行
// 沙箱模式下不再强制要求：只有主动开启「系统注入」或清理旧环境变量时才需要
function isAdmin() {
    try {
        if (process.platform === 'win32') {
            execSync('net session', {stdio: 'ignore'});
            return true;
        } else {
            return process.getuid() === 0;
        }
    } catch (err) {
        return false;
    }
}

protocol.registerSchemesAsPrivileged([
    {
        scheme: 'app',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            bypassCSP: true,
            allowServiceWorkers: true
        }
    }
]);

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const DEV_SERVER_WAIT_MS = 30000;

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

// 探测开发服务器是否已经能接受连接
function probeUrl(url) {
    return new Promise((resolve) => {
        const http = require('http');
        let settled = false;
        const finish = (ok) => {
            if (settled) return;
            settled = true;
            resolve(ok);
        };
        const req = http.get(url, {timeout: 1500}, (res) => {
            res.resume();
            finish(true);
        });
        req.on('error', () => finish(false));
        req.on('timeout', () => {
            req.destroy();
            finish(false);
        });
    });
}

// 启动失败时显示一页能看懂的提示，而不是白屏
// hints 里允许传 HTML 片段（由本文件自己编写，不接受外部输入）
function showStartupPage({title, message, hints = []}) {
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    background: radial-gradient(circle at 30% 20%, #1e293b 0%, #0b1120 60%);
    color: #e2e8f0;
    font-family: "Inter", "Microsoft YaHei", system-ui, sans-serif;
    -webkit-user-select: text; user-select: text;
  }
  .card { width: 100%; max-width: min(660px, 100%); padding: 40px 44px; background: #111c31; border: 1px solid #1f2f4a; border-radius: 16px; }
  .badge { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; letter-spacing: .08em; color: #f59e0b; margin-bottom: 18px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 12px #f59e0b; }
  h1 { margin: 0 0 12px; font-size: 22px; font-weight: 600; }
  p { margin: 0 0 20px; font-size: 14px; line-height: 1.7; color: #94a3b8; }
  ul { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.9; color: #cbd5e1; }
  code { font-family: "JetBrains Mono", Consolas, monospace; background: #0b1120; border: 1px solid #1f2f4a; border-radius: 6px; padding: 2px 6px; color: #5eead4; }
</style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span>启动提示</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    ${hints.length ? `<ul>${hints.map(hint => `<li>${hint}</li>`).join('')}</ul>` : ''}
  </div>
</body>
</html>`;
    const statusFile = path.join(app.getPath('userData'), 'startup-status.html');
    fs.writeFileSync(statusFile, html, 'utf8');
    return mainWindow.loadFile(statusFile);
}

function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
        return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
}

function hideMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    ensureTray();
    mainWindow.hide();
}

function toggleMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
        return;
    }
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
        mainWindow.hide();
    } else {
        showMainWindow();
    }
}

function quitApp() {
    isQuitting = true;
    if (tray) {
        tray.destroy();
        tray = null;
    }
    app.quit();
}

function ensureTray() {
    if (tray) return tray;
    const iconPath = path.join(__dirname, '../build/icon.ico');
    let image = nativeImage.createFromPath(iconPath);
    // 打包时如果没把 build/icon.ico 带上，退回到 exe 自带的图标，避免托盘空白
    if (image.isEmpty()) image = nativeImage.createFromPath(process.execPath);
    if (image.isEmpty()) image = nativeImage.createEmpty();
    tray = new Tray(image);
    tray.setToolTip('沐柠环境盒');
    logToFile(`[Tray] 已创建托盘图标 ${iconPath} empty=${image.isEmpty()}`);
    tray.setContextMenu(Menu.buildFromTemplate([
        {label: '显示主界面', click: () => showMainWindow()},
        {type: 'separator'},
        {label: '退出软件', click: () => quitApp()},
    ]));
    tray.on('click', () => toggleMainWindow());
    tray.on('double-click', () => showMainWindow());
    return tray;
}

// 透明窗口依赖系统合成（Windows 的 DWM + Chromium 的 GPU 合成）。
// 虚拟机、远程桌面、禁用硬件加速或驱动异常时，Chromium 拿不到透明表面，
// 会把整个窗口画成一整块白底 —— 看起来就是「装完打开白屏」。
// 另外显存过小（虚拟机默认的 VMware SVGA 只有 4MB）时，模糊、阴影、动画
// 全部落到 CPU 光栅化，一帧几十毫秒到上百毫秒，系统直接把窗口判成「未响应」。
// 所以启动时探测「GPU 合成能力 + 显存大小」，在两套档位间选：
//   full —— 透明窗口 + 毛玻璃拟态
//   lite —— 不透明纯色窗口 + 零模糊零动画零阴影
// 可用 --opaque-window / --lite-ui / --full-ui，或环境变量
// MULING_OPAQUE_WINDOW、MULING_LITE_UI 手动覆盖。
const LITE_VRAM_BYTES = 2 * 1024 * 1024 * 1024;

function gpuCompositingStatus() {
    try {
        const status = app.getGPUFeatureStatus();
        return (status && status.gpu_compositing) || 'unknown';
    } catch (err) {
        return 'unknown';
    }
}

// 显存大小：走注册表，两步查。
// 1) HKLM\HARDWARE\DEVICEMAP\VIDEO 列出当前显示设备，值是驱动键路径；
// 2) 每个驱动键下的 HardwareInformation.qwMemorySize（REG_QWORD，字节）就是显存。
// 比 WMI 的 AdapterRAM 可靠（后者 32 位、超 4G 会截断），也不用起 PowerShell。
// 读不到返回 0（未知），此时只按 GPU 合成能力判断，不额外降级。
function queryRegValue(args) {
    try {
        return execFileSync('reg.exe', args, {
            encoding: 'utf8',
            timeout: 3000,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
    } catch (err) {
        return '';
    }
}

function readVramBytes() {
    const devmap = queryRegValue(['query', 'HKLM\\HARDWARE\\DEVICEMAP\\VIDEO']);
    if (!devmap) return 0;

    // 同一个驱动 GUID 会挂多个 \000N 实例，按 GUID 去重，只要第一份
    const driverKeys = new Map();
    const lineRe = /reg_sz\s+(\\(?:registry|machine)[^\r\n]*)$/gim;
    let m;
    while ((m = lineRe.exec(devmap))) {
        const regPath = m[1].trim();
        const guid = (regPath.match(/\\control\\video\\(\{[^}]+\})/i) || [])[1];
        if (!guid || driverKeys.has(guid)) continue;
        driverKeys.set(guid, 'HKLM' + regPath.replace(/^\\(registry|machine)\\machine/i, ''));
    }

    let max = 0;
    for (const key of driverKeys.values()) {
        const bytesOut = queryRegValue(['query', key, '/v', 'HardwareInformation.qwMemorySize']);
        const bytesMatch = bytesOut.match(/qwMemorySize\s+REG_QWORD\s+0x([0-9a-fA-F]+)/i);
        if (bytesMatch) {
            const v = parseInt(bytesMatch[1], 16);
            if (Number.isFinite(v) && v > max) max = v;
            continue;
        }
        const dwordOut = queryRegValue(['query', key, '/v', 'HardwareInformation.MemorySize']);
        const dwordMatch = dwordOut.match(/MemorySize\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
        if (dwordMatch) {
            const v = parseInt(dwordMatch[1], 16);
            if (Number.isFinite(v) && v > max) max = v;
        }
    }
    return max;
}

// 解释「为什么没拿到 GPU 合成」：远程会话、虚拟显示器是最常见的两种。
// 只在真的降级时才查，正常机器上不付这份开销。
const VIRTUAL_DISPLAY_RE = /virtual display|gameviewer|parsec|spacedesk|todesk|sunlogin|qemu|vmware|virtualbox|microsoft basic|basic display/i;

function detectDisplayHint() {
    const session = (process.env.SESSIONNAME || '').toUpperCase();
    if (session.startsWith('RDP')) {
        return {reason: 'remote_session', detail: '远程桌面会话（RDP）下 Chromium 通常禁用 GPU 合成'};
    }

    const devmap = queryRegValue(['query', 'HKLM\\HARDWARE\\DEVICEMAP\\VIDEO']);
    const guids = new Set();
    const guidRe = /\\control\\video\\(\{[^}]+\})/gi;
    let m;
    while ((m = guidRe.exec(devmap))) guids.add(m[1]);

    for (const guid of guids) {
        const out = queryRegValue(['query', `HKLM\\SYSTEM\\CurrentControlSet\\Control\\Video\\${guid}\\0000`, '/v', 'DriverDesc']);
        const desc = (out.match(/DriverDesc\s+REG_SZ\s+(.+)$/im) || [])[1];
        if (desc && VIRTUAL_DISPLAY_RE.test(desc)) {
            return {reason: 'virtual_display', detail: `桌面输出到了虚拟显示器：${desc.trim()}`};
        }
    }
    return {reason: 'gpu_unavailable', detail: 'Chromium 没能初始化 ANGLE/D3D，已回退到软件渲染'};
}

function computeRenderProfile() {
    const compositing = gpuCompositingStatus();
    const vramBytes = readVramBytes();
    const lowVram = vramBytes > 0 && vramBytes < LITE_VRAM_BYTES;

    // auto：拿不到 GPU 合成、或显存过小，降 lite
    let lite = compositing !== 'enabled' || lowVram;
    let source = 'auto';

    if (renderMode === 'lite') {
        lite = true;
        source = 'setting';
    } else if (renderMode === 'full') {
        lite = false;
        source = 'setting';
    }

    if (process.argv.includes('--lite-ui') || process.env.MULING_LITE_UI === '1') {
        lite = true;
        source = 'flag';
    }
    if (process.argv.includes('--full-ui') || process.env.MULING_LITE_UI === '0') {
        lite = false;
        source = 'flag';
    }

    const forceOpaque = process.argv.includes('--opaque-window') || process.env.MULING_OPAQUE_WINDOW === '1';
    const hint = compositing === 'enabled' ? {reason: 'ok', detail: ''} : detectDisplayHint();

    return {
        lite,
        lowVram,
        vramBytes,
        compositing,
        transparent: !lite && !forceOpaque,
        mode: renderMode,
        source,
        hint,
    };
}

function createWindow() {
    Menu.setApplicationMenu(null);

    const profile = computeRenderProfile();
    lastRenderProfile = profile;
    splashMinMs = profile.lite ? 1200 : SPLASH_MIN_MS;
    logToFile(
        `[Window] transparent=${profile.transparent} lite=${profile.lite} mode=${profile.mode} source=${profile.source}` +
        ` gpu_compositing=${profile.compositing}` +
        ` vram_mb=${profile.vramBytes ? Math.round(profile.vramBytes / 1048576) : 'unknown'}` +
        ` reason=${profile.hint.reason}${profile.hint.detail ? ' detail=' + profile.hint.detail : ''}`
    );

    createSplashWindow(profile.transparent);

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        show: false,
        transparent: profile.transparent,
        backgroundColor: profile.transparent ? '#00000000' : '#0b1120',
        icon: path.join(__dirname, '../build/icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
            preload: path.join(__dirname, 'preload.cjs'),
            additionalArguments: [
                ...(profile.transparent ? [] : ['--muling-opaque']),
                ...(profile.lite ? ['--muling-lite'] : []),
            ],
        }
    });

    let revealed = false;

    const revealWindow = () => {
        if (revealed || !mainWindow || mainWindow.isDestroyed()) return;
        revealed = true;

        if (IS_AUTOSTART) {
            destroySplash();
            ensureTray();
            logToFile('[Launch] 开机自启模式，窗口保持在托盘');
            return;
        }

        const since = splashShownAt || Date.now();
        const remain = Math.max(0, splashMinMs - (Date.now() - since));
        const finish = () => {
            fadeInMainWindow();
            setTimeout(destroySplash, 120);
        };

        if (remain > 0) setTimeout(finish, remain);
        else finish();
    };

    mainWindow.once('ready-to-show', revealWindow);
    mainWindow.webContents.once('did-finish-load', revealWindow);
    const revealTimer = setTimeout(revealWindow, 3000);
    const splashGuardTimer = setTimeout(destroySplash, SPLASH_MAX_MS);
    mainWindow.once('closed', () => {
        clearTimeout(revealTimer);
        clearTimeout(splashGuardTimer);
        destroySplash();
    });

    mainWindow.on('maximize', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window-maximized', true);
        }
    });
    mainWindow.on('unmaximize', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window-maximized', false);
        }
    });

    mainWindow.on('close', (event) => {
        if (isQuitting) return;
        if (closeBehavior === 'exit') {
            isQuitting = true;
            return;
        }
        event.preventDefault();
        hideMainWindow();
    });

    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        // 等待期间先给一页提示，避免启动时是一片纯白
        showStartupPage({
            title: '正在连接开发服务器',
            message: `等待 ${DEV_SERVER_URL} 就绪，最多 ${Math.round(DEV_SERVER_WAIT_MS / 1000)} 秒…`
        }).catch(() => {});

        const waitingSince = Date.now();
        let connected = false;
        let hintShown = false;
        // 持续轮询：先启动 Electron 再启动 Vite 也能自愈，不需要重启程序
        const devServerTimer = setInterval(async () => {
            if (connected || mainWindow.isDestroyed()) {
                clearInterval(devServerTimer);
                return;
            }

            if (await probeUrl(DEV_SERVER_URL)) {
                connected = true;
                clearInterval(devServerTimer);
                mainWindow.loadURL(DEV_SERVER_URL).catch((err) => {
                    console.error('[dev] 加载开发服务器失败:', err);
                    showStartupPage({
                        title: '页面加载失败',
                        message: err && err.message ? err.message : String(err),
                        hints: ['检查 Vite 终端里是否有编译报错，修复后按 <code>Ctrl + R</code> 重新加载']
                    });
                });
                if (process.env.OPEN_DEVTOOLS === 'true') {
                    mainWindow.webContents.openDevTools();
                }
                return;
            }

            if (!hintShown && Date.now() - waitingSince > DEV_SERVER_WAIT_MS) {
                hintShown = true;
                console.error(`[dev] ${DEV_SERVER_URL} 未就绪，无法加载界面`);
                showStartupPage({
                    title: '开发服务器没有启动',
                    message: `窗口本身由 Electron 提供，界面由 Vite 开发服务器提供。现在连不上 ${DEV_SERVER_URL}，所以窗口里还没有内容。Vite 一旦启动，本页会自动加载。`,
                    hints: [
                        '在项目根目录运行 <code>npm run dev</code>，看到 <code>Local: http://localhost:5173/</code> 后本页会自己刷新',
                        '或者直接运行 <code>npm run electron:dev</code>，它会同时启动 Vite 和 Electron',
                        '本机没有安装 yarn，旧的 <code>yarn electron:dev</code> 用不了'
                    ]
                });
                if (process.env.OPEN_DEVTOOLS === 'true') {
                    mainWindow.webContents.openDevTools();
                }
            }
        }, 1000);
    } else {
        const distIndex = path.join(__dirname, '../dist/index.html');
        if (!fs.existsSync(distIndex)) {
            console.error(`[prod] 缺少前端资源: ${distIndex}`);
            showStartupPage({
                title: '前端资源不存在',
                message: `没有找到 ${distIndex}，所以窗口里没有内容。`,
                hints: [
                    '先运行 <code>npm run build</code> 生成 dist 目录',
                    '发布安装包请用 <code>npm run electron:build</code>'
                ]
            });
        } else {
            mainWindow.loadURL('app://index.html').catch((err) => {
                console.error('[prod] 加载 app://index.html 失败:', err);
                showStartupPage({
                    title: '页面加载失败',
                    message: err && err.message ? err.message : String(err),
                    hints: [
                        '重新运行 <code>npm run build</code> 后再启动',
                        `如果仍然失败，把 <code>${escapeHtml(logFile)}</code> 一并反馈`
                    ]
                });
            });
            mainWindow.webContents.closeDevTools();
        }
    }

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            event.preventDefault();
        }
        if (input.key === 'F12') {
            event.preventDefault();
        }
    });

    mainWindow.webContents.on('context-menu', (event) => {
        event.preventDefault();
    });
}

const CLEAN_ENV_ONLY = process.argv.includes('--clean-env');
const PURGE_ENV_ONLY = process.argv.includes('--purge-env');
const ADOPT_ENV_INDEX = process.argv.indexOf('--adopt-env');
const ADOPT_ENV_ONLY = ADOPT_ENV_INDEX >= 0;
const ADOPT_ENV_TOOL = ADOPT_ENV_ONLY ? String(process.argv[ADOPT_ENV_INDEX + 1] || '') : '';
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
    if (!CLEAN_ENV_ONLY && !ADOPT_ENV_ONLY && !PURGE_ENV_ONLY) app.quit();
} else {
    app.on('second-instance', () => {
        showMainWindow();
    });
}

app.whenReady().then(() => {
    // 卸载模式：把本工具写进注册表的环境变量与 PATH 条目撤干净，然后退出
    if (PURGE_ENV_ONLY) {
        sandbox.purgeInjectedEnv()
            .then((res) => logToFile(`[PurgeEnv] vars=${res.removedVars.length} paths=${res.removedPathEntries.length} needsAdmin=${res.needsAdmin}`))
            .catch((err) => logToFile(`[PurgeEnv] 失败：${err.message}`))
            .finally(() => setTimeout(() => app.quit(), 500));
        return;
    }

    // 提权清理模式：只清一遍环境变量就退出，不建窗口
    if (CLEAN_ENV_ONLY) {
        sandbox.cleanLegacyAll()
            .then((res) => logToFile(`[CleanEnv] 管理员清理完成 removed=${res.removed.length} warnings=${res.warnings.length}`))
            .catch((err) => logToFile(`[CleanEnv] 失败：${err.message}`))
            .finally(() => setTimeout(() => app.quit(), 500));
        return;
    }

    // 提权接管模式：只把系统 PATH 里该工具的旧条目摘掉，然后退出
    if (ADOPT_ENV_ONLY) {
        const writeResult = (payload) => {
            try {
                const dir = app.getPath('userData');
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, 'last-env-clean.json'), JSON.stringify(payload, null, 2), 'utf8');
            } catch (err) {
                logToFile(`[AdoptEnv] 写回执失败：${err.message}`);
            }
        };
        sandbox.removeSystemToolEntries(ADOPT_ENV_TOOL)
            .then((res) => {
                logToFile(`[AdoptEnv] tool=${ADOPT_ENV_TOOL} ok=${res.ok} removed=${(res.removed || []).length} message=${res.message}`);
                writeResult({
                    tool: ADOPT_ENV_TOOL,
                    ok: !!res.ok,
                    removed: (res.removed || []).length,
                    entries: res.removed || [],
                    message: res.message || '',
                    at: new Date().toISOString()
                });
            })
            .catch((err) => {
                logToFile(`[AdoptEnv] 失败：${err.message}`);
                writeResult({
                    tool: ADOPT_ENV_TOOL,
                    ok: false,
                    removed: 0,
                    message: err.message,
                    at: new Date().toISOString()
                });
            })
            .finally(() => setTimeout(() => app.quit(), 500));
        return;
    }

    // 初始化配置管理器
    configManager.initConfig(app.getPath('userData'));

    // 读取窗口行为设置（关闭按钮：托盘 / 退出）
    loadWindowSettings();

    // 初始化沙箱目录（%LOCALAPPDATA%\Muling\env）
    sandbox.ensureRoot();

    // ============ 沙箱模式 IPC ============
    ipcMain.handle('sandbox-info', () => {
        try {
            return {success: true, data: sandbox.getInfo()};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('sandbox-set-active', (event, tool, version) => {
        try {
            sandbox.setActive(tool, version);
            return {success: true, message: `已切换到 ${tool} ${version}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('sandbox-get-env-command', (event, tool) => {
        try {
            return {success: true, data: sandbox.getEnvCommand(tool)};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('sandbox-open-terminal', async () => {
        try {
            await sandbox.openTerminal();
            return {success: true};
        } catch (err) {
            return {success: false, message: `打开终端失败: ${err.message}`};
        }
    });

    ipcMain.handle('sandbox-regenerate-terminal', async () => {
        try {
            const result = await sandbox.syncLauncher();
            return {success: true, data: result};
        } catch (err) {
            return {success: false, message: `生成终端失败: ${err.message}`};
        }
    });

    ipcMain.handle('sandbox-set-injection', async (event, tool, enabled) => {
        try {
            const result = await sandbox.setInjection(tool, enabled);
            mainWindow.webContents.send('sandbox-changed');
            return {
                success: true,
                enabled: result.enabled,
                selfCheck: result.selfCheck || null,
                message: enabled ? '已注入到当前用户环境变量' : '已从环境变量中移除',
            };
        } catch (err) {
            const needAdmin = /需要管理员|EACCES|EPERM|拒绝访问/i.test(err.message);
            return {
                success: false,
                message: needAdmin ? `${err.message}（该操作可能需要以管理员身份运行）` : err.message,
            };
        }
    });

    ipcMain.handle('sandbox-injection-info', async (event, tool) => {
        try {
            const info = await sandbox.getInjectionInfo(tool);
            return {success: true, data: info};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('sandbox-detach-all', async () => {
        try {
            const detached = await sandbox.detachAllInjections();
            mainWindow.webContents.send('sandbox-changed');
            return {
                success: true,
                detached,
                message: detached.length
                    ? `已撤出 ${detached.join('、')} 的系统变量`
                    : '没有需要撤出的系统变量',
            };
        } catch (err) {
            return {success: false, message: `撤出失败: ${err.message}`};
        }
    });

    ipcMain.handle('sandbox-migrate', async (event, tool, version, legacyDir) => {
        try {
            const result = await sandbox.migrate(tool, version, legacyDir);
            mainWindow.webContents.send('sandbox-changed');
            return {
                success: true,
                message: result.cleanup.ok
                    ? '已迁移到沙箱，并清理了旧的环境变量'
                    : `已迁移到沙箱，但旧环境变量清理不完整：${result.cleanup.warnings.join('；')}`,
                data: result,
            };
        } catch (err) {
            return {success: false, message: `迁移失败: ${err.message}`};
        }
    });

    ipcMain.handle('sandbox-clean-legacy-env', async (event, tool) => {
        try {
            const result = await sandbox.cleanLegacyEnv(tool);
            return {
                success: true,
                message: result.ok ? '旧环境变量已清理' : `部分清理失败：${result.warnings.join('；')}`,
                data: result,
            };
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('sandbox-open-root', async () => {
        const {shell} = require('electron');
        await shell.openPath(sandbox.getRoot());
        return {success: true};
    });

    ipcMain.handle('sandbox-detect-existing', async () => {
        try {
            return {success: true, data: sandbox.detectExistingInstalls()};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('probe-env', async () => {
        try {
            const envProbe = require('./utils/envProbe.cjs');
            const items = await envProbe.diagnoseAll();
            logToFile(`[Probe] ${items.map((i) => `${i.tool}:${i.probe && i.probe.verdict}`).join(' ')}`);
            return {success: true, data: items};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('clean-legacy-env', async () => {
        try {
            const result = await sandbox.cleanLegacyAll();
            logToFile(`[CleanEnv] 清理完成 removed=${(result.removed || []).length} needsAdmin=${result.needsAdmin} broken=${(result.probe || []).filter((i) => i.broken).length}`);
            return {success: true, data: result};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('clean-legacy-env-elevated', async () => {
        try {
            const {execFile} = require('child_process');
            const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
            const exe = String(process.execPath).replace(/'/g, "''");
            const script = `Start-Process -FilePath '${exe}' -ArgumentList '--clean-env' -Verb RunAs`;
            await new Promise((resolve, reject) => {
                execFile(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {windowsHide: true}, (err) => (err ? reject(err) : resolve()));
            });
            return {success: true, message: '已请求管理员权限，确认后会自动把系统级旧条目清掉'};
        } catch (err) {
            return {success: false, message: `提权失败：${err.message}`};
        }
    });

    ipcMain.handle('env-conflicts', async (_event, tool) => {
        try {
            const report = await sandbox.inspectEnvConflicts(tool);
            let lastResult = null;
            try {
                const file = path.join(app.getPath('userData'), 'last-env-clean.json');
                if (fs.existsSync(file)) {
                    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
                    if (!parsed || !parsed.tool || parsed.tool === tool) lastResult = parsed;
                }
            } catch (err) {
                // 回执读不到就当作没有
            }
            return {success: true, data: {...report, lastResult}};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('adopt-env-elevated', async (_event, tool) => {
        try {
            const {execFile} = require('child_process');
            const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
            const exe = String(process.execPath).replace(/'/g, "''");
            const safeTool = String(tool || '').replace(/'/g, '');
            const script = `Start-Process -FilePath '${exe}' -ArgumentList '--adopt-env','${safeTool}' -Verb RunAs`;
            await new Promise((resolve, reject) => {
                execFile(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {windowsHide: true}, (err) => (err ? reject(err) : resolve()));
            });
            logToFile(`[AdoptEnv] 请求管理员权限清理系统 PATH tool=${safeTool}`);
            return {success: true, message: '已请求管理员权限，确认后会自动把系统 PATH 里的旧条目清掉，重开终端就生效'};
        } catch (err) {
            return {success: false, message: `提权失败：${err.message}`};
        }
    });

    ipcMain.handle('sandbox-adopt', async (_event, tool, dir, version) => {
        try {
            const result = await sandbox.adopt(tool, dir, version);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('sandbox-changed');
            }
            return {success: true, data: result};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('sandbox-open-dir', async (_event, targetPath) => {
        const {shell} = require('electron');
        try {
            if (!targetPath || typeof targetPath !== 'string') {
                return {success: false, message: '目录无效'};
            }
            const root = path.resolve(sandbox.getRoot());
            const target = path.resolve(targetPath);
            if (target !== root && !target.startsWith(root + path.sep)) {
                return {success: false, message: '只能打开沙箱内的目录'};
            }
            if (!fs.existsSync(target)) {
                return {success: false, message: '目录不存在'};
            }
            const error = await shell.openPath(target);
            if (error) {
                return {success: false, message: error};
            }
            return {success: true};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('sandbox-tool-dir', async (_event, tool, version) => {
        try {
            if (!tool || !version) {
                return {success: false, message: '参数无效'};
            }
            return {success: true, dir: sandbox.installDir(tool, version)};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    const INSTALL_LOG_TOOLS = ['jdk', 'python', 'mysql', 'redis', 'maven', 'gradle', 'nodejs', 'nginx', 'uv'];

    const resolveInstallLog = (tool) => {
        if (!INSTALL_LOG_TOOLS.includes(tool)) return null;
        return path.join(app.getPath('userData'), `${tool}_install.log`);
    };

    ipcMain.handle('read-install-log', async (_event, tool) => {
        try {
            const logPath = resolveInstallLog(tool);
            if (!logPath) return {success: false, message: '未知的工具'};
            if (!fs.existsSync(logPath)) return {success: false, message: '还没有生成安装日志'};
            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
            return {success: true, path: logPath, lines: lines.slice(-400)};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('open-install-log', async (_event, tool) => {
        const {shell} = require('electron');
        try {
            const logPath = resolveInstallLog(tool);
            if (!logPath) return {success: false, message: '未知的工具'};
            if (!fs.existsSync(logPath)) return {success: false, message: '还没有生成安装日志'};
            const error = await shell.openPath(logPath);
            if (error) return {success: false, message: error};
            return {success: true, path: logPath};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('is-admin', () => ({admin: isAdmin()}));

    registerTerminalHandlers(() => mainWindow);
    registerIntegrityHandlers(mainWindow, app.getPath('userData'));
    registerBackupHandlers(mainWindow, app.getPath('userData'));

    // 生成/刷新「沐柠环境终端」快捷方式（失败不影响主流程）
    sandbox.syncLauncher().catch((err) => {
        console.error('[Sandbox] 生成环境终端失败:', err.message);
    });

    protocol.handle('app', async (request) => {
        let filePath = request.url.slice('app://'.length);
        if (filePath.includes('?')) filePath = filePath.split('?')[0];
        filePath = filePath.replace(/^\.?\//, '').replace(/\/+/g, '/');
        if (filePath.startsWith('index.html/')) {
            filePath = filePath.slice('index.html/'.length);
        }
        if (filePath === '' || filePath === 'index.html') filePath = 'index.html';

        const realPath = path.join(__dirname, '../dist', filePath);
        const logMsg = `Request: ${request.url} -> ${realPath} (exists: ${fs.existsSync(realPath)})`;
        console.log(logMsg);
        logToFile(logMsg);

        if (!fs.existsSync(realPath)) {
            return new Response(`File not found: ${realPath}`, {status: 404});
        }

        const fileContent = fs.readFileSync(realPath);
        const ext = path.extname(realPath).toLowerCase();
        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
        };
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        return new Response(fileContent, {
            status: 200,
            headers: {'Content-Type': mimeType}
        });

    });

    createWindow();
    ensureTray();
    registerNginxHandlers(mainWindow, app.getPath('userData'));
    registerJDKHandlers(mainWindow, app.getPath('userData'));
    registerPythonHandlers(mainWindow, app.getPath('userData'));
    registerMysqlHandlers(mainWindow, app.getPath('userData'));
    registerRedisHandlers(mainWindow, app.getPath('userData'));
    registerMavenHandlers(mainWindow, app.getPath('userData'));
    registerGradleHandlers(mainWindow, app.getPath('userData'));
    registerUvHandlers(mainWindow, app.getPath('userData'));
    registerNodejsHandlers(mainWindow, app.getPath('userData'));

    ipcMain.handle('get-system-stats', async () => {
        const os = require('os');
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const getCpuUsage = () => {
            const start = os.cpus().map(cpu => cpu.times);
            return new Promise((resolve) => {
                setTimeout(() => {
                    const end = os.cpus().map(cpu => cpu.times);
                    const usage = start.map((s, i) => {
                        const idle = end[i].idle - s.idle;
                        const total = (end[i].user + end[i].nice + end[i].sys + end[i].idle + end[i].irq) - (s.user + s.nice + s.sys + s.idle + s.irq);
                        return 1 - idle / total;
                    });
                    const avgUsage = usage.reduce((a, b) => a + b, 0) / usage.length;
                    resolve(avgUsage * 100);
                }, 100);
            });
        };
        const cpuUsage = await getCpuUsage();
        return {
            cpu: Math.round(cpuUsage),
            memory: Math.round((totalMem - freeMem) / totalMem * 100)
        };
    });

    ipcMain.handle('get-username', async () => {
        const os = require('os');
        return os.userInfo().username;
    });

    ipcMain.handle('get-cache-size', async () => {
        const downloadDir = path.join(app.getPath('userData'), 'downloads');
        const logsDir = app.getPath('userData');
        let cacheSize = 0;
        let logsSize = 0;
        const getFolderSize = (folder) => {
            if (!fs.existsSync(folder)) return 0;
            let size = 0;
            const files = fs.readdirSync(folder);
            for (const file of files) {
                const filePath = path.join(folder, file);
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    size += getFolderSize(filePath);
                } else {
                    size += stat.size;
                }
            }
            return size;
        };
        if (fs.existsSync(downloadDir)) cacheSize = getFolderSize(downloadDir);
        const logFiles = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
        for (const log of logFiles) {
            const stat = fs.statSync(path.join(logsDir, log));
            logsSize += stat.size;
        }
        return {cacheSize, logsSize};
    });

    ipcMain.handle('clear-cache', async () => {
        const downloadDir = path.join(app.getPath('userData'), 'downloads');
        if (fs.existsSync(downloadDir)) {
            fs.rmSync(downloadDir, {recursive: true, force: true});
            fs.mkdirSync(downloadDir);
        }
        return {success: true};
    });

    ipcMain.handle('clear-logs', async () => {
        const logsDir = app.getPath('userData');
        const logFiles = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
        for (const log of logFiles) {
            fs.unlinkSync(path.join(logsDir, log));
        }
        return {success: true};
    });

    ipcMain.handle('get-version-info', async () => {
        return {
            version: app.getVersion(),
            electron: process.versions.electron,
            node: process.versions.node,
            chrome: process.versions.chrome
        };
    });

    ipcMain.handle('open-github', async () => {
        const {shell} = require('electron');
        await shell.openExternal('https://github.com/Auspicious3798/muling-dev-toolbox');
    });

    ipcMain.handle('select-directory', async (event, title) => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: title || '选择安装目录'
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0];
    });

    ipcMain.handle('open-file-dialog', async (event, options) => {
        const result = await dialog.showOpenDialog(mainWindow, options);
        if (result.canceled) return null;
        return result.filePaths[0];
    });

    ipcMain.handle('check-path-exists', async (event, dirPath) => {
        try {
            const fs = require('fs');
            if (!fs.existsSync(dirPath)) return false;
            const files = fs.readdirSync(dirPath);
            return files.length > 0;
        } catch (err) {
            return false;
        }
    });

    ipcMain.handle('get-user-data-path', () => app.getPath('userData'));

    // 配置管理 IPC
    ipcMain.handle('get-download-config', () => {
        return configManager.getConfig();
    });

    ipcMain.handle('get-tool-config', (event, toolName, version) => {
        return configManager.getToolConfig(toolName, version);
    });

    ipcMain.on('minimize-window', () => mainWindow.minimize());
    ipcMain.on('close-window', () => mainWindow.close());

    ipcMain.on('set-close-behavior', (event, value) => {
        closeBehavior = value === 'exit' ? 'exit' : 'tray';
        saveWindowSettings();
    });

    ipcMain.handle('get-close-behavior', () => ({closeBehavior}));

    // ---- 渲染档位 ----
    ipcMain.handle('get-render-profile', () => {
        const p = lastRenderProfile || computeRenderProfile();
        return {
            success: true,
            mode: p.mode,
            lite: p.lite,
            transparent: p.transparent,
            source: p.source,
            compositing: p.compositing,
            vramMb: p.vramBytes ? Math.round(p.vramBytes / 1048576) : 0,
            hint: p.hint,
        };
    });

    ipcMain.handle('set-render-mode', (event, mode) => {
        renderMode = (mode === 'lite' || mode === 'full') ? mode : 'auto';
        saveWindowSettings();
        const current = lastRenderProfile || computeRenderProfile();
        const next = computeRenderProfile();
        // 透明窗口没法在运行时切换，只能重启生效
        return {success: true, restartRequired: next.lite !== current.lite};
    });

    ipcMain.on('relaunch-app', () => {
        app.relaunch();
        app.exit(0);
    });

    ipcMain.on('show-main-window', () => showMainWindow());

    // ---- 开机自启 / 服务状态记忆 ----
    ipcMain.handle('get-auto-launch', () => {
        let enabled = false;
        try {
            enabled = app.getLoginItemSettings().openAtLogin;
        } catch (err) {
            enabled = false;
        }
        return {success: true, enabled};
    });

    ipcMain.handle('set-auto-launch', (event, enabled) => {
        try {
            app.setLoginItemSettings({
                openAtLogin: Boolean(enabled),
                path: process.execPath,
                args: app.isPackaged ? ['--autostart'] : [app.getAppPath(), '--autostart']
            });
            logToFile(`[Launch] 开机自启设为 ${Boolean(enabled)}`);
            return {success: true, enabled: Boolean(enabled)};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('get-service-state', () => ({success: true, services: readLaunchState().services || {}}));

    ipcMain.handle('set-service-state', (event, services) => {
        const state = readLaunchState();
        state.services = services && typeof services === 'object' ? services : {};
        writeLaunchState(state);
        return {success: true};
    });

    // ---- 检查更新（读取 OSS 根的 version.json） ----
    ipcMain.handle('check-app-update', async () => {
        try {
            const axios = require('axios');
            const url = require('./utils/assetBase.cjs').resolve('/version.json');
            const res = await axios.get(url, {timeout: 8000});
            const data = res.data && typeof res.data === 'object' ? res.data : {};
            const latest = String(data.version || '').trim();
            const current = app.getVersion();
            const normalizeVersion = (value) => String(value || '').trim().replace(/^[vV]/, '');
            const compare = (a, b) => {
                const pa = normalizeVersion(a).split('.').map((n) => parseInt(n, 10) || 0);
                const pb = normalizeVersion(b).split('.').map((n) => parseInt(n, 10) || 0);
                for (let i = 0; i < 3; i += 1) {
                    const x = pa[i] || 0;
                    const y = pb[i] || 0;
                    if (x !== y) return x > y ? 1 : -1;
                }
                return 0;
            };
            return {
                success: true,
                current,
                latest,
                hasUpdate: Boolean(latest) && compare(latest, current) > 0,
                notes: typeof data.notes === 'string' ? data.notes : '',
                url: typeof data.url === 'string' ? data.url : '',
                publishedAt: data.publishedAt || ''
            };
        } catch (err) {
            const status = err && err.response && err.response.status;
            if (status === 404) {
                return {success: false, message: '服务端还没有 version.json，暂时无法检查更新'};
            }
            return {success: false, message: err.message};
        }
    });

    // 改端口时顺手把已安装的配置文件也改掉，界面上的端口和下次启动用的端口就一致
    function patchInstalledServicePort(tool, version, port) {
        try {
            const dir = sandbox.installDir(tool, version);
            if (!dir || !fs.existsSync(dir)) return false;
            if (tool === 'mysql') {
                const conf = path.join(dir, 'my.ini');
                if (!fs.existsSync(conf)) return false;
                const content = fs.readFileSync(conf, 'utf8');
                const next = /^\s*port\s*=/im.test(content)
                    ? content.replace(/^\s*port\s*=.*$/im, `port=${port}`)
                    : `${content.trimEnd()}\nport=${port}\n`;
                fs.writeFileSync(conf, next, 'utf8');
                return true;
            }
            if (tool === 'redis') {
                const conf = path.join(dir, 'redis.windows.conf');
                if (!fs.existsSync(conf)) return false;
                const content = fs.readFileSync(conf, 'utf8');
                const next = /^\s*port\s+\d+/im.test(content)
                    ? content.replace(/^\s*port\s+\d+\s*$/im, `port ${port}`)
                    : `port ${port}\n${content}`;
                fs.writeFileSync(conf, next, 'utf8');
                return true;
            }
            return false;
        } catch (err) {
            logToFile(`[ServicePort] 写配置文件失败：${err.message}`);
            return false;
        }
    }

    // ---- 服务端口：读取 / 校验 / 保存 ----
    ipcMain.handle('get-service-port', async (event, tool, version) => {
        try {
            const servicePorts = require('./utils/servicePorts.cjs');
            const port = servicePorts.getPort(app.getPath('userData'), tool, version);
            return {
                success: true,
                port,
                defaultPort: servicePorts.defaultPortOf(tool, version),
            };
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('check-service-port', async (event, port) => {
        try {
            const portUtils = require('./utils/port.cjs');
            const numeric = Number(port);
            if (!Number.isInteger(numeric) || numeric < 1 || numeric > 65535) {
                return {success: false, available: false, message: '端口必须是 1 - 65535 之间的整数'};
            }
            const available = await portUtils.isPortAvailable(numeric);
            return {
                success: true,
                available,
                message: available ? `端口 ${numeric} 可以绑定` : `端口 ${numeric} 已被占用`,
            };
        } catch (err) {
            return {success: false, available: false, message: err.message};
        }
    });

    ipcMain.handle('set-service-port', async (event, tool, version, port) => {
        try {
            const portUtils = require('./utils/port.cjs');
            const servicePorts = require('./utils/servicePorts.cjs');
            const numeric = Number(port);
            if (!servicePorts.isValidPort(numeric)) {
                return {success: false, message: '端口必须是 1 - 65535 之间的整数'};
            }
            const available = await portUtils.isPortAvailable(numeric);
            if (!available) {
                return {success: false, message: `端口 ${numeric} 已被占用，换一个再试`};
            }
            const saved = servicePorts.setPort(app.getPath('userData'), tool, version, numeric);
            if (!saved.success) return saved;
            const configPatched = patchInstalledServicePort(tool, version, numeric);
            logToFile(`[ServicePort] ${tool}${version ? ` ${version}` : ''} 端口改为 ${numeric}（配置已更新：${configPatched}）`);
            return {success: true, port: numeric, configPatched, message: `端口已改为 ${numeric}`};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    // ---- 沙箱占用统计 ----
    ipcMain.handle('get-sandbox-usage', () => {
        const dirSize = (target) => {
            let total = 0;
            const walk = (current) => {
                let entries = [];
                try {
                    entries = fs.readdirSync(current, {withFileTypes: true});
                } catch (err) {
                    return;
                }
                for (const entry of entries) {
                    const full = path.join(current, entry.name);
                    if (entry.isDirectory()) walk(full);
                    else if (entry.isFile()) {
                        try {
                            total += fs.statSync(full).size;
                        } catch (err) {}
                    }
                }
            };
            walk(target);
            return total;
        };
        try {
            const root = sandbox.getRoot();
            const tools = ['jdk', 'python', 'mysql', 'redis', 'maven', 'gradle', 'nodejs', 'nginx', 'uv'];
            const items = [];
            let total = 0;
            if (fs.existsSync(root)) {
                for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
                    if (!entry.isDirectory() || !tools.includes(entry.name)) continue;
                    const toolDir = path.join(root, entry.name);
                    for (const versionEntry of fs.readdirSync(toolDir, {withFileTypes: true})) {
                        if (!versionEntry.isDirectory()) continue;
                        const versionDir = path.join(toolDir, versionEntry.name);
                        const bytes = dirSize(versionDir);
                        total += bytes;
                        items.push({
                            tool: entry.name,
                            dir: versionEntry.name,
                            version: versionEntry.name.replace(/^[a-z]+-/, ''),
                            bytes
                        });
                    }
                }
            }
            items.sort((a, b) => b.bytes - a.bytes);
            return {success: true, root, total, items};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });

    // ---- 运行日志（MySQL / Redis / Nginx） ----
    ipcMain.handle('read-service-log', (event, tool) => {
        try {
            if (!['mysql', 'redis', 'nginx'].includes(tool)) {
                return {success: false, message: '该服务没有运行日志'};
            }
            const dir = sandbox.getActiveDir(tool) || sandbox.installDir(tool, '');
            const candidates = {
                mysql: ['mysql-error.log', 'mysql.log'],
                redis: ['redis.log', 'redis-server.log'],
                nginx: ['logs/error.log', 'logs/access.log']
            }[tool];
            let target = null;
            for (const name of candidates) {
                const full = path.join(dir, name);
                if (fs.existsSync(full)) {
                    target = full;
                    break;
                }
            }
            if (!target) {
                return {success: false, message: `还没有日志文件（${dir}）`};
            }
            const content = fs.readFileSync(target, 'utf8');
            const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(-400);
            return {success: true, path: target, lines};
        } catch (err) {
            return {success: false, message: err.message};
        }
    });
});

app.on('before-quit', (event) => {
    if (!isQuitting) {
        // 真正退出前确认：还有服务在跑就提醒一次
        const running = Object.entries(readLaunchState().services || {})
            .filter(([, value]) => value)
            .map(([tool]) => SERVICE_LABELS[tool] || tool);
        if (running.length && !quitConfirmed) {
            event.preventDefault();
            const choice = dialog.showMessageBoxSync({
                type: 'warning',
                buttons: ['退出并停止服务', '取消'],
                defaultId: 1,
                cancelId: 1,
                title: '还有服务正在运行',
                message: `以下服务正在运行：${running.join('、')}`,
                detail: '退出沐柠环境盒会同时停止这些服务。如果你只是想让它待在后台，可以关掉窗口或最小化到托盘。'
            });
            if (choice === 1) return;
            quitConfirmed = true;
        }
    }
    isQuitting = true;
    destroySplash();
    if (tray) {
        tray.destroy();
        tray = null;
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});