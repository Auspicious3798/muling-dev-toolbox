const {contextBridge, ipcRenderer, shell} = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    installJDK: (version) => ipcRenderer.invoke('install-jdk', version),
    installFromLocal: (version) => ipcRenderer.invoke('install-from-local', version),
    importLocalJDK: (filePath) => ipcRenderer.invoke('import-local-jdk', filePath),
    checkJDK: () => ipcRenderer.invoke('check-jdk'),
    switchJDK: (version) => ipcRenderer.invoke('switch-jdk', version),
    deleteJDK: (version) => ipcRenderer.invoke('delete-jdk', version),
    cancelDownload: () => ipcRenderer.send('cancel-download'),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_, data) => callback(data)),
    onJDKChanged: (callback) => ipcRenderer.on('jdk-changed', callback),
    openExternal: (url) => shell.openExternal(url),
    getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
    openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options)
});