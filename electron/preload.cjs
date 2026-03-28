const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    installJDK: (version) => ipcRenderer.invoke('install-jdk', version),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_, data) => callback(data))
});