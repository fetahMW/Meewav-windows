const { app, BrowserWindow, Menu, session, ipcMain, desktopCapturer } = require('electron');
const { isAbsolute, join } = require('node:path');
const { appendFileSync } = require('node:fs');

const studioUrl = `http://127.0.0.1:${process.env.MEEWAV_DESKTOP_DEV_PORT || '5197'}/`;
const trustedOrigin = new URL(studioUrl).origin;
const capabilities = process.platform === 'win32' ? require('./platforms/windows.cjs')
  : process.platform === 'darwin' ? require('./platforms/macos.cjs')
  : Object.freeze({ runtime: 'desktop-unsupported', screenCapture: false, windowCapture: false, systemAudioCapture: false, professionalAudioDriver: false });
const captureSelections = new Map();

// An explicit QA profile isolates automated Room sessions from the artist's desktop session.
const qaUserData = process.env.MEEWAV_DESKTOP_QA_USER_DATA;
if (qaUserData && !isAbsolute(qaUserData)) throw new Error('QA userData must be an absolute path');
app.setPath('userData', qaUserData || join(app.getPath('appData'), 'Meewav Studio Dev'));
app.setAppUserModelId('com.meewav.studio');

function logLifecycle(event, details = {}) {
  try {
    appendFileSync(join(app.getPath('userData'), 'desktop-lifecycle.log'),
      `${JSON.stringify({ time: new Date().toISOString(), event, ...details })}\n`);
  } catch (error) { console.error('Desktop diagnostic log unavailable:', error.message); }
}

function isTrusted(url) {
  try { return new URL(url).origin === trustedOrigin; }
  catch { return false; }
}

function createWindow() {
  const window = new BrowserWindow({
    title: 'Meewav',
    icon: join(__dirname, 'assets', process.platform === 'win32' ? 'meewav.ico' : 'meewav.png'),
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#060609',
    ...(process.platform === 'win32' ? {
      frame: false,
      thickFrame: true,
    } : {}),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: join(__dirname, 'preload.cjs'),
      backgroundThrottling: false,
    },
  });
  if (process.platform === 'win32') {
    window.removeMenu();
    window.setMenuBarVisibility(false);
  }
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // The frameless Windows shell has no application menu to supply Ctrl+R.
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && ((input.control && input.key.toLowerCase() === 'r') || input.key === 'F5')) {
      event.preventDefault();
      window.webContents.reload();
    }
  });
  let recoveredRenderer = false;
  window.webContents.on('render-process-gone', (_event, details) => {
    logLifecycle('render-process-gone', details);
    if (details.reason === 'clean-exit' || recoveredRenderer || window.isDestroyed()) return;
    recoveredRenderer = true;
    // Recover once only: a repeat crash must not create an endless reload loop.
    window.webContents.reload();
  });
  window.webContents.on('did-finish-load', () => logLifecycle('did-finish-load'));
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (isMainFrame) logLifecycle('did-fail-load', { errorCode, errorDescription });
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrusted(url)) event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());
  void window.loadURL(studioUrl).catch(error => logLifecycle('load-error', { message: error.message }));
}

app.whenReady().then(() => {
  logLifecycle('app-ready', { electron: process.versions.electron });
  // Remove the default Electron menu after initialization and on each window.
  if (process.platform === 'win32') Menu.setApplicationMenu(null);
  const assertTrusted = (event) => {
    if (!isTrusted(event.senderFrame?.url || '') || event.senderFrame !== event.sender.mainFrame) throw new Error('Unsupported caller');
  };
  ipcMain.handle('meewav:capabilities', (event) => { assertTrusted(event); return capabilities; });
  ipcMain.handle('meewav:window-control', (event, action) => {
    assertTrusted(event);
    if (process.platform !== 'win32') return false;
    const target = BrowserWindow.fromWebContents(event.sender);
    if (!target || target.isDestroyed()) return false;
    if (action === 'minimize') target.minimize();
    else if (action === 'toggle-maximize') {
      if (target.isMaximized()) target.unmaximize();
      else target.maximize();
    } else if (action === 'close') target.close();
    else return false;
    return true;
  });
  ipcMain.handle('meewav:window-menu', (event, action) => {
    assertTrusted(event);
    const target = BrowserWindow.fromWebContents(event.sender);
    if (!target || target.isDestroyed()) return false;
    const contents = target.webContents;
    if (action === 'undo') contents.undo();
    else if (action === 'redo') contents.redo();
    else if (action === 'cut') contents.cut();
    else if (action === 'copy') contents.copy();
    else if (action === 'paste') contents.paste();
    else if (action === 'select-all') contents.selectAll();
    else if (action === 'reload') contents.reload();
    else if (action === 'zoom-in') contents.setZoomFactor(Math.min(2, contents.getZoomFactor() + 0.1));
    else if (action === 'zoom-out') contents.setZoomFactor(Math.max(0.5, contents.getZoomFactor() - 0.1));
    else if (action === 'zoom-reset') contents.setZoomFactor(1);
    else if (action === 'fullscreen') target.setFullScreen(!target.isFullScreen());
    else return false;
    return true;
  });
  ipcMain.handle('meewav:capture-sources', async (event) => {
    assertTrusted(event);
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 240, height: 135 } });
    return sources.map((source) => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL() }));
  });
  ipcMain.handle('meewav:select-capture-source', (event, value) => {
    assertTrusted(event);
    if (!value || typeof value.id !== 'string' || !/^(screen|window):/.test(value.id)) throw new Error('Invalid source');
    captureSelections.set(event.sender.id, { id: value.id, systemAudio: value.systemAudio === true && capabilities.systemAudioCapture, expiresAt: Date.now() + 30000 });
  });
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const contents = BrowserWindow.getAllWindows().find((window) => window.webContents.mainFrame === request.frame)?.webContents;
    const selection = contents && captureSelections.get(contents.id);
    if (contents) captureSelections.delete(contents.id);
    if (!isTrusted(request.securityOrigin) || !selection || selection.expiresAt < Date.now()) { callback({}); return; }
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const source = sources.find((candidate) => candidate.id === selection.id);
      callback(source ? { video: source, ...(request.audioRequested && selection.systemAudio ? { audio: 'loopback' } : {}) } : {});
    } catch { callback({}); }
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const frameUrl = details.requestingUrl || webContents.getURL();
    callback(permission === 'media' && isTrusted(frameUrl));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) =>
    permission === 'media' && Boolean(webContents) && isTrusted(requestingOrigin));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
