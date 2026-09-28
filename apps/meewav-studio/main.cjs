const { app, BrowserWindow, Menu, session, ipcMain, desktopCapturer, protocol, net } = require('electron');
const { isAbsolute, join, resolve, extname, sep } = require('node:path');
const { pathToFileURL } = require('node:url');
const { appendFileSync, existsSync } = require('node:fs');
const { authReturnUrl } = require('./auth-links.cjs');

const studioUrl = app.isPackaged ? 'meewav://app/' : `http://127.0.0.1:${process.env.MEEWAV_DESKTOP_DEV_PORT || '5197'}/`;
const trustedOrigin = new URL(studioUrl).origin;
protocol.registerSchemesAsPrivileged([{ scheme: 'meewav', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
} }]);
const capabilities = process.platform === 'win32' ? require('./platforms/windows.cjs')
  : process.platform === 'darwin' ? require('./platforms/macos.cjs')
  : Object.freeze({ runtime: 'desktop-unsupported', screenCapture: false, windowCapture: false, systemAudioCapture: false, professionalAudioDriver: false });
const captureSelections = new Map();

// An explicit QA profile isolates automated Room sessions from the artist's desktop session.
const qaUserData = process.env.MEEWAV_DESKTOP_QA_USER_DATA;
if (qaUserData && !isAbsolute(qaUserData)) throw new Error('QA userData must be an absolute path');
app.setPath('userData', qaUserData || join(app.getPath('appData'), app.isPackaged ? 'Meewav Studio' : 'Meewav Studio Dev'));
app.setAppUserModelId('com.meewav.studio');
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
let mainWindow = null;
let pendingAuthUrl = app.isPackaged ? process.argv.map(authReturnUrl).find(Boolean) : null;
function acceptAuthReturn(value) {
  if (!app.isPackaged) return;
  const url = authReturnUrl(value);
  if (!url) return;
  pendingAuthUrl = url;
  if (mainWindow && !mainWindow.isDestroyed()) {
    const target = pendingAuthUrl; pendingAuthUrl = null;
    void mainWindow.loadURL(target).catch(() => logLifecycle('auth-return-load-failed'));
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
}
app.on('second-instance', (_event, argv) => {
  const link = argv.map(authReturnUrl).find(Boolean);
  if (link) acceptAuthReturn(link);
  else if (mainWindow && !mainWindow.isDestroyed()) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});
app.on('open-url', (event, url) => { event.preventDefault(); acceptAuthReturn(url); });

function logLifecycle(event, details = {}) {
  try {
    appendFileSync(join(app.getPath('userData'), 'desktop-lifecycle.log'),
      `${JSON.stringify({ time: new Date().toISOString(), event, ...details })}\n`);
  } catch (error) { console.error('Desktop diagnostic log unavailable:', error.message); }
}

function isTrusted(url) {
  try {
    const parsed = new URL(url);
    return app.isPackaged ? parsed.protocol === 'meewav:' && parsed.hostname === 'app' && !parsed.port
      : parsed.origin === trustedOrigin;
  }
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
  mainWindow = window;
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
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
  const initialUrl = pendingAuthUrl || studioUrl; pendingAuthUrl = null;
  // Auth return URLs can contain session tokens; never include them in diagnostics.
  void window.loadURL(initialUrl).catch(() => logLifecycle('load-error'));
}

app.whenReady().then(() => {
  if (!primaryInstance) return;
  if (app.isPackaged) {
    const root = resolve(app.getAppPath(), 'dist');
    protocol.handle('meewav', async (request) => {
      if (!isTrusted(request.url) || !['GET','HEAD'].includes(request.method)) return new Response(null, {status:403});
      let path;
      try { path = resolve(root, '.' + decodeURIComponent(new URL(request.url).pathname)); }
      catch { return new Response(null, {status:400}); }
      if (path !== root && !path.startsWith(root + sep)) return new Response(null, {status:403});
      if (path === root || (!extname(path) && !existsSync(path))) path = join(root, 'index.html');
      if (!existsSync(path)) return new Response(null, {status:404});
      const response = await net.fetch(pathToFileURL(path).href);
      const headers = new Headers(response.headers);
      headers.set('Cross-Origin-Opener-Policy','same-origin');
      headers.set('Cross-Origin-Embedder-Policy','credentialless');
      return new Response(response.body, {status:response.status, headers});
    });
  }
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
