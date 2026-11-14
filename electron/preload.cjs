const {contextBridge, ipcRenderer, shell} = require('electron');

// 主进程判定当前环境（虚拟机 / 远程桌面 / 无硬件合成）撑不起透明窗口时，
// 会在 webPreferences.additionalArguments 里带上 --muling-opaque。
// 这里在首帧之前给根节点打标记，让 theme.css 铺一层不透明底色，
// 否则透明窗口会退化成整块白屏。
if (process.argv.includes('--muling-opaque')) {
    const markOpaque = () => {
        const root = document.documentElement;
        if (!root) return false;
        root.classList.add('is-opaque');
        return true;
    };
    if (!markOpaque()) {
        document.addEventListener('DOMContentLoaded', markOpaque, {once: true});
    }
}

// 订阅 ipcRenderer 事件并返回取消订阅函数，避免渲染进程反复挂载时监听器泄漏
function ipcOn(channel, callback) {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('electronAPI', {
    installJDK: (version, customPath) => ipcRenderer.invoke('install-jdk', version, customPath),
    checkJDK: () => ipcRenderer.invoke('check-jdk'),
    switchJDK: (version) => ipcRenderer.invoke('switch-jdk', version),
    deleteJDK: (version) => ipcRenderer.invoke('delete-jdk', version),
    cancelDownload: () => ipcRenderer.send('cancel-download'),
    onDownloadProgress: (callback) => ipcOn('download-progress', callback),
    onJDKChanged: (callback) => ipcOn('jdk-changed', callback),

    installPython: (version, mirror) => ipcRenderer.invoke('install-python', version, mirror),
    checkPython: () => ipcRenderer.invoke('check-python'),
    switchPython: (version) => ipcRenderer.invoke('switch-python', version),
    deletePython: (version) => ipcRenderer.invoke('delete-python', version),
    cancelPythonDownload: () => ipcRenderer.send('cancel-python-download'),
    onPythonChanged: (callback) => ipcOn('python-changed', callback),

    installMySQL: (version, password) => ipcRenderer.invoke('install-mysql', version, password),
    checkMySQL: () => ipcRenderer.invoke('check-mysql'),
    switchMySQL: (version) => ipcRenderer.invoke('switch-mysql', version),
    deleteMySQL: (version) => ipcRenderer.invoke('delete-mysql', version),
    startMySQLService: (version) => ipcRenderer.invoke('start-mysql-service', version),
    stopMySQLService: (version) => ipcRenderer.invoke('stop-mysql-service', version),
    restartMySQLService: (version) => ipcRenderer.invoke('restart-mysql-service', version),
    getMySQLServiceStatus: (version) => ipcRenderer.invoke('get-mysql-service-status', version),
    getMySQLPassword: (version) => ipcRenderer.invoke('get-mysql-password', version),
    changeMySQLPassword: (version, oldPassword, newPassword) => ipcRenderer.invoke('change-mysql-password', version, oldPassword, newPassword),
    getMySQLConfig: (version) => ipcRenderer.invoke('get-mysql-config', version),
    cancelMySQLDownload: () => ipcRenderer.send('cancel-mysql-download'),
    onMySQLProgress: (callback) => ipcOn('mysql-progress', callback),
    onMySQLChanged: (callback) => ipcOn('mysql-changed', callback),

    installRedis: (version, password, maxmemory, customPort) => ipcRenderer.invoke('install-redis', version, password, maxmemory, customPort),
    checkRedis: () => ipcRenderer.invoke('check-redis'),
    switchRedis: (version) => ipcRenderer.invoke('switch-redis', version),
    deleteRedis: (version) => ipcRenderer.invoke('delete-redis', version),
    startRedisService: (version) => ipcRenderer.invoke('start-redis-service', version),
    stopRedisService: (version) => ipcRenderer.invoke('stop-redis-service', version),
    restartRedisService: (version) => ipcRenderer.invoke('restart-redis-service', version),
    getRedisServiceStatus: (version) => ipcRenderer.invoke('get-redis-service-status', version),
    getRedisConfig: (version) => ipcRenderer.invoke('get-redis-config', version),
    changeRedisPassword: (version, oldPassword, newPassword) => ipcRenderer.invoke('change-redis-password', version, oldPassword, newPassword),
    cancelRedisDownload: () => ipcRenderer.send('cancel-redis-download'),
    onRedisProgress: (callback) => ipcOn('redis-progress', callback),
    onRedisChanged: (callback) => ipcOn('redis-changed', callback),

    checkPort: (port) => ipcRenderer.invoke('check-port', port),

    installMaven: (version) => ipcRenderer.invoke('install-maven', version),
    switchMaven: (version) => ipcRenderer.invoke('switch-maven', version),
    checkMaven: () => ipcRenderer.invoke('check-maven'),
    uninstallMaven: (version) => ipcRenderer.invoke('uninstall-maven', version),
    cancelMavenDownload: () => ipcRenderer.send('cancel-maven-download'),
    onMavenProgress: (callback) => ipcOn('maven-progress', callback),
    onMavenChanged: (callback) => ipcOn('maven-changed', callback),

    installGradle: (version) => ipcRenderer.invoke('install-gradle', version),
    checkGradle: () => ipcRenderer.invoke('check-gradle'),
    switchGradle: (version) => ipcRenderer.invoke('switch-gradle', version),
    uninstallGradle: (version) => ipcRenderer.invoke('uninstall-gradle', version),
    cancelGradleDownload: () => ipcRenderer.send('cancel-gradle-download'),
    onGradleProgress: (callback) => ipcOn('gradle-progress', callback),
    onGradleChanged: (callback) => ipcOn('gradle-changed', callback),

    installNodejs: (version) => ipcRenderer.invoke('install-nodejs', version),
    checkNodejs: () => ipcRenderer.invoke('check-nodejs'),
    switchNodejs: (version) => ipcRenderer.invoke('switch-nodejs', version),
    uninstallNodejs: (version) => ipcRenderer.invoke('uninstall-nodejs', version),
    cancelNodejsDownload: () => ipcRenderer.send('cancel-nodejs-download'),
    onNodejsProgress: (callback) => ipcOn('nodejs-progress', callback),
    onNodejsChanged: (callback) => ipcOn('nodejs-changed', callback),

    installUv: (version) => ipcRenderer.invoke('install-uv', version),
    checkUv: () => ipcRenderer.invoke('check-uv'),
    switchUv: (version) => ipcRenderer.invoke('switch-uv', version),
    uninstallUv: (version) => ipcRenderer.invoke('uninstall-uv', version),
    cancelUvDownload: () => ipcRenderer.send('cancel-uv-download'),
    onUvProgress: (callback) => ipcOn('uv-progress', callback),
    onUvChanged: (callback) => ipcOn('uv-changed', callback),

    getSystemStats: () => ipcRenderer.invoke('get-system-stats'),

    getCacheSize: () => ipcRenderer.invoke('get-cache-size'),
    clearCache: () => ipcRenderer.invoke('clear-cache'),
    clearLogs: () => ipcRenderer.invoke('clear-logs'),
    getVersionInfo: () => ipcRenderer.invoke('get-version-info'),
    getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
    setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
    getServiceState: () => ipcRenderer.invoke('get-service-state'),
    setServiceState: (services) => ipcRenderer.invoke('set-service-state', services),
    checkAppUpdate: () => ipcRenderer.invoke('check-app-update'),
    readServiceLog: (tool) => ipcRenderer.invoke('read-service-log', tool),
    getSandboxUsage: () => ipcRenderer.invoke('get-sandbox-usage'),
    openGitHub: () => ipcRenderer.invoke('open-github'),

    getUsername: () => ipcRenderer.invoke('get-username'),

    listPackages: (version) => ipcRenderer.invoke('list-packages', version),
    installPackage: (version, packageName) => ipcRenderer.invoke('install-package', version, packageName),
    uninstallPackage: (version, packageName) => ipcRenderer.invoke('uninstall-package', version, packageName),

    openExternal: (url) => {
        // 白名单：仅允许 http/https，阻止 file:// 等危险协议
        try {
            const u = new URL(url);
            if (u.protocol === 'http:' || u.protocol === 'https:') return shell.openExternal(url);
            return Promise.reject(new Error(`不允许打开的协议: ${u.protocol}`));
        } catch (e) {
            return Promise.reject(new Error('无效的 URL'));
        }
    },
    getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
    openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
    selectDirectory: (title) => ipcRenderer.invoke('select-directory', title),
    checkPathExists: (path) => ipcRenderer.invoke('check-path-exists', path),
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    setCloseBehavior: (value) => ipcRenderer.send('set-close-behavior', value),
    getCloseBehavior: () => ipcRenderer.invoke('get-close-behavior'),
    showMainWindow: () => ipcRenderer.send('show-main-window'),
    
    // 配置管理
    getDownloadConfig: () => ipcRenderer.invoke('get-download-config'),
    getToolConfig: (toolName, version) => ipcRenderer.invoke('get-tool-config', toolName, version),

    installNginx: (version) => ipcRenderer.invoke('install-nginx', version),
    switchNginx: (version) => ipcRenderer.invoke('switch-nginx', version),
    uninstallNginx: (version) => ipcRenderer.invoke('uninstall-nginx', version),
    checkNginx: () => ipcRenderer.invoke('check-nginx'),
    getNginxSites: () => ipcRenderer.invoke('get-nginx-sites'),
    getNginxStatus: () => ipcRenderer.invoke('get-nginx-status'),
    startNginx: () => ipcRenderer.invoke('start-nginx'),
    stopNginx: () => ipcRenderer.invoke('stop-nginx'),
    reloadNginx: () => ipcRenderer.invoke('reload-nginx'),
    addNginxSite: (site) => ipcRenderer.invoke('add-nginx-site', site),
    deleteNginxSite: (port) => ipcRenderer.invoke('delete-nginx-site', port),
    updateNginxSite: (site) => ipcRenderer.invoke('update-nginx-site', site),
    checkPortAvailable: (port) => ipcRenderer.invoke('check-port-available', port),
    cancelNginxDownload: () => ipcRenderer.send('cancel-nginx-download'),
    onNginxProgress: (callback) => ipcOn('nginx-progress', callback),
    onNginxChanged: (callback) => ipcOn('nginx-changed', callback),
    
    // 下载速度警告
    onDownloadSpeedWarning: (callback) => ipcOn('download-speed-warning', callback),

    // 沙箱模式
    getSandboxInfo: () => ipcRenderer.invoke('sandbox-info'),
    detectExistingInstalls: () => ipcRenderer.invoke('sandbox-detect-existing'),
    adoptExistingInstall: (tool, dir, version) => ipcRenderer.invoke('sandbox-adopt', tool, dir, version),
    setSandboxActive: (tool, version) => ipcRenderer.invoke('sandbox-set-active', tool, version),
    getSandboxEnvCommand: (tool) => ipcRenderer.invoke('sandbox-get-env-command', tool),
    openEnvTerminal: () => ipcRenderer.invoke('sandbox-open-terminal'),
    regenerateEnvTerminal: () => ipcRenderer.invoke('sandbox-regenerate-terminal'),
    setSandboxInjection: (tool, enabled) => ipcRenderer.invoke('sandbox-set-injection', tool, enabled),
    migrateToSandbox: (tool, version, legacyDir) => ipcRenderer.invoke('sandbox-migrate', tool, version, legacyDir),
    cleanLegacyEnv: (tool) => ipcRenderer.invoke('sandbox-clean-legacy-env', tool),
    openSandboxRoot: () => ipcRenderer.invoke('sandbox-open-root'),
    openSandboxDir: (dir) => ipcRenderer.invoke('sandbox-open-dir', dir),
    getSandboxToolDir: (tool, version) => ipcRenderer.invoke('sandbox-tool-dir', tool, version),
    readInstallLog: (tool) => ipcRenderer.invoke('read-install-log', tool),
    openInstallLog: (tool) => ipcRenderer.invoke('open-install-log', tool),
    checkIntegrity: () => ipcRenderer.invoke('check-integrity'),
    exportEnvConfig: (options) => ipcRenderer.invoke('export-env-config', options),
    inspectEnvConfig: () => ipcRenderer.invoke('inspect-env-config'),
    importEnvConfig: (payload) => ipcRenderer.invoke('import-env-config', payload),
    getIntegrityTargets: () => ipcRenderer.invoke('get-integrity-targets'),
    getInjectionInfo: (tool) => ipcRenderer.invoke('sandbox-injection-info', tool),
    detachAllInjections: () => ipcRenderer.invoke('sandbox-detach-all'),
    isAdmin: () => ipcRenderer.invoke('is-admin'),
    onSandboxChanged: (callback) => ipcOn('sandbox-changed', callback),
  onWindowMaximized: (callback) => ipcOn('window-maximized', (_event, maximized) => callback(maximized)),

    // 内置终端（xterm.js + node-pty）
    terminalCreate: (options) => ipcRenderer.invoke('terminal-create', options),
    terminalWrite: (id, data) => ipcRenderer.send('terminal-write', {id, data}),
    terminalResize: (id, cols, rows) => ipcRenderer.send('terminal-resize', {id, cols, rows}),
    terminalDispose: (id) => ipcRenderer.send('terminal-dispose', {id}),
    terminalDisposeAll: () => ipcRenderer.send('terminal-dispose-all'),
    terminalSummary: () => ipcRenderer.invoke('terminal-summary'),
    onTerminalData: (callback) => ipcOn('terminal-data', callback),
    onTerminalExit: (callback) => ipcOn('terminal-exit', callback),
});
