const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('meewavDesktop', Object.freeze({
  version: 1,
  openAuthUrl: (url) => ipcRenderer.invoke('meewav:open-auth-url', url),
  prepareAuthReturn: () => ipcRenderer.invoke('meewav:prepare-auth-return'),
  localTestAccountsEnabled: process.argv.includes('--meewav-local-test-accounts'),
  getTestAccountAliases: (supabaseUrl) => ipcRenderer.invoke('meewav:test-account-aliases', supabaseUrl),
  signInTestAccount: (alias, supabaseUrl) => ipcRenderer.invoke('meewav:test-account-sign-in', alias, supabaseUrl),
  getCapabilities: () => ipcRenderer.invoke('meewav:capabilities'),
  windowControl: (action) => ipcRenderer.invoke('meewav:window-control', action),
  windowMenu: (action) => ipcRenderer.invoke('meewav:window-menu', action),
  listCaptureSources: () => ipcRenderer.invoke('meewav:capture-sources'),
  selectCaptureSource: (id, systemAudio = false) => ipcRenderer.invoke('meewav:select-capture-source', { id, systemAudio }),
}));
