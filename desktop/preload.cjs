const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omniyomiDesktop', {
  getState: () => ipcRenderer.invoke('omniyomi:get-state'),
  start: () => ipcRenderer.invoke('omniyomi:start'),
  stop: () => ipcRenderer.invoke('omniyomi:stop'),
  openApp: () => ipcRenderer.invoke('omniyomi:open-app'),
  openData: () => ipcRenderer.invoke('omniyomi:open-data'),
  openLogs: () => ipcRenderer.invoke('omniyomi:open-logs'),
  showLogFile: () => ipcRenderer.invoke('omniyomi:show-log-file'),
  checkUpdates: () => ipcRenderer.invoke('omniyomi:check-updates'),
  installUpdate: () => ipcRenderer.invoke('omniyomi:install-update'),
  quit: () => ipcRenderer.invoke('omniyomi:quit'),
  onStatus: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('omniyomi:status', listener);
    return () => ipcRenderer.removeListener('omniyomi:status', listener);
  },
  onUpdate: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('omniyomi:update', listener);
    return () => ipcRenderer.removeListener('omniyomi:update', listener);
  },\n  onLog: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('omniyomi:log', listener);
    return () => ipcRenderer.removeListener('omniyomi:log', listener);
  }
});
