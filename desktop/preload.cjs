const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omniyomiDesktop', {
  getState: () => ipcRenderer.invoke('omniyomi:get-state'),
  start: () => ipcRenderer.invoke('omniyomi:start'),
  stop: () => ipcRenderer.invoke('omniyomi:stop'),
  openApp: () => ipcRenderer.invoke('omniyomi:open-app'),
  openData: () => ipcRenderer.invoke('omniyomi:open-data'),
  openLogs: () => ipcRenderer.invoke('omniyomi:open-logs'),
  showLogFile: () => ipcRenderer.invoke('omniyomi:show-log-file'),
  quit: () => ipcRenderer.invoke('omniyomi:quit'),
  onStatus: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('omniyomi:status', listener);
    return () => ipcRenderer.removeListener('omniyomi:status', listener);
  },
  onLog: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('omniyomi:log', listener);
    return () => ipcRenderer.removeListener('omniyomi:log', listener);
  }
});
