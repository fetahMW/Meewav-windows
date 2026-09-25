const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('meewavDesktop', Object.freeze({
  version: 1,
  getCapabilities: () => ipcRenderer.invoke('meewav:capabilities'),
  windowControl: (action) => ipcRenderer.invoke('meewav:window-control', action),
  windowMenu: (action) => ipcRenderer.invoke('meewav:window-menu', action),
  listCaptureSources: () => ipcRenderer.invoke('meewav:capture-sources'),
  selectCaptureSource: (id, systemAudio = false) => ipcRenderer.invoke('meewav:select-capture-source', { id, systemAudio }),
}));
