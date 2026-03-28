const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    installJDK: (version, installPath) => ipcRenderer.invoke('install-jdk', version, installPath),
    importLocalJDK: (filePath, installPath) => ipcRenderer.invoke('import-local-jdk', filePath, installPath),
    checkJDK: () => ipcRenderer.invoke('check-jdk'),
    switchJDK: (version) => ipcRenderer.invoke('switch-jdk', version),
    deleteJDK: (version) => ipcRenderer.invoke('delete-jdk', version),
    cancelDownload: () => ipcRenderer.send('cancel-download'),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_, data) => callback(data)),
    selectPath: () => ipcRenderer.send('select-install-path'),
    onSelectPath: (callback) => ipcRenderer.on('selected-install-path', (_, path) => callback(path)),
    openExternal: (url) => shell.openExternal(url),
    getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
    openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options)
});