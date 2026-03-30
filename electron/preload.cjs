const {contextBridge, ipcRenderer, shell} = require('electron');
console.log('✅ Preload script loaded with Python API');

contextBridge.exposeInMainWorld('electronAPI', {
    // JDK API
    installJDK: (version) => ipcRenderer.invoke('install-jdk', version),
    installFromLocal: (version) => ipcRenderer.invoke('install-from-local', version),
    importLocalJDK: (filePath) => ipcRenderer.invoke('import-local-jdk', filePath),
    checkJDK: () => ipcRenderer.invoke('check-jdk'),
    switchJDK: (version) => ipcRenderer.invoke('switch-jdk', version),
    deleteJDK: (version) => ipcRenderer.invoke('delete-jdk', version),
    cancelDownload: () => ipcRenderer.send('cancel-download'),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_, data) => callback(data)),
    onJDKChanged: (callback) => ipcRenderer.on('jdk-changed', callback),

    // Python API
    installPython: (version, mirror) => ipcRenderer.invoke('install-python', version, mirror),
    installFromLocalPython: (version, mirror) => ipcRenderer.invoke('install-from-local-python', version, mirror),
    importLocalPython: (filePath) => ipcRenderer.invoke('import-local-python', filePath),
    checkPython: () => ipcRenderer.invoke('check-python'),
    switchPython: (version) => ipcRenderer.invoke('switch-python', version),
    deletePython: (version) => ipcRenderer.invoke('delete-python', version),
    cancelPythonDownload: () => ipcRenderer.send('cancel-python-download'),
    onPythonChanged: (callback) => ipcRenderer.on('python-changed', callback),

    // MySQL API
    installMySQL: (version, password) => ipcRenderer.invoke('install-mysql', version, password),
    installFromLocalMySQL: (version, password) => ipcRenderer.invoke('install-from-local-mysql', version, password),
    importLocalMySQL: (filePath) => ipcRenderer.invoke('import-local-mysql', filePath),
    checkMySQL: () => ipcRenderer.invoke('check-mysql'),
    switchMySQL: (version) => ipcRenderer.invoke('switch-mysql', version),
    deleteMySQL: (version) => ipcRenderer.invoke('delete-mysql', version),
    startMySQLService: (version) => ipcRenderer.invoke('start-mysql-service', version),
    stopMySQLService: (version) => ipcRenderer.invoke('stop-mysql-service', version),
    restartMySQLService: (version) => ipcRenderer.invoke('restart-mysql-service', version),
    getMySQLServiceStatus: (version) => ipcRenderer.invoke('get-mysql-service-status', version),
    changeMySQLPassword: (version, oldPassword, newPassword) => ipcRenderer.invoke('change-mysql-password', version, oldPassword, newPassword),
    cancelMySQLDownload: () => ipcRenderer.send('cancel-mysql-download'),
    onMySQLProgress: (callback) => ipcRenderer.on('mysql-progress', (_, data) => callback(data)),
    onMySQLChanged: (callback) => ipcRenderer.on('mysql-changed', callback),

    // Common utilities
    openExternal: (url) => shell.openExternal(url),
    getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
    openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
    checkPathExists: (path) => ipcRenderer.invoke('check-path-exists', path)
});