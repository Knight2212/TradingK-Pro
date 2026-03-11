const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    tvScan: (args) => ipcRenderer.invoke('tv-scan', args),
});
