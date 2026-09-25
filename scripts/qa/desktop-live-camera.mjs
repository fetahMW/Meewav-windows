// One bounded LIVE QA run: actual Windows camera -> Desktop Program -> independent viewer.
// Requires the existing Vite Desktop server on 127.0.0.1:5196 and the ignored
// Android QA credentials. Never use this script with a personal account.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { _electron, chromium } from 'playwright';

if (process.env.MEEWAV_QA_LIVE_CAMERA !== '1') {
  throw new Error('Set MEEWAV_QA_LIVE_CAMERA=1 to authorize this bounded LIVE QA run.');
}

const root = resolve(import.meta.dirname, '../..');
const androidRoot = resolve(root, '../Meewav-Android');
const runId = `QA_CAMERA_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
const roomId = randomUUID();
const title = `${runId}_${roomId.slice(0, 8)}`;
const reportPath = resolve(root, '.tmp', `desktop-live-camera-${roomId}.json`);
const profilePath = resolve(root, '.tmp', `desktop-live-camera-profile-${roomId}`);
const result = { runId, roomId, title, createdAt: new Date().toISOString(), checks: {}, cleanup: {} };
await mkdir(resolve(root, '.tmp'), { recursive: true });
await mkdir(profilePath, { recursive: true });
const record = async () => writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
await record();

const properties = await readFile(resolve(androidRoot, 'meewav.local.properties'), 'utf8');
const property = (name) => properties.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]
  ?.trim().replaceAll('\\:', ':').replace(/^['"]|['"]$/g, '');
const baseUrl = property('SUPABASE_URL');
const apiKey = property('SUPABASE_PUBLISHABLE_KEY');
if (!baseUrl?.includes('dqabekaqpznjsagoxzwc') || !apiKey) throw new Error('Expected LIVE QA backend configuration is unavailable.');
const accounts = JSON.parse(await readFile(resolve(androidRoot, 'app/build/messaging-dual-agent/accounts.json'), 'utf8'));
if (accounts.length < 2 || !accounts[0]?.email || !accounts[0]?.password
  || !accounts[1]?.email || !accounts[1]?.password || accounts[0].id === accounts[1].id) {
  throw new Error('Two distinct QA accounts are required.');
}
const safeError = (error) => {
  let message = (error instanceof Error ? error.message : String(error)).split('\n')[0];
  for (const account of accounts.slice(0, 2)) {
    message = message.replaceAll(account.password, '[secret]').replaceAll(account.email, '[QA account]');
  }
  return message;
};

async function api(path, { method = 'GET', token, body, prefer } = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: { apikey: apiKey, ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(prefer ? { Prefer: prefer } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`QA API ${method} ${path.split('?')[0]}: HTTP ${response.status}`);
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}

const login = (account) => api('/auth/v1/token?grant_type=password', {
  method: 'POST', body: { email: account.email, password: account.password },
});
const room = (token) => api(`/rest/v1/rooms_v2?id=eq.${roomId}&select=id,host_id,type,title,status,livekit_room_name,participants_count`, { token });
const reportPeerStats = async (page, direction) => page.evaluate(async (requestedDirection) => {
  const connections = window.__meewavQaPeerConnections ?? [];
  const entries = (await Promise.all(connections.map((connection) => connection.getStats().catch(() => null))))
    .flatMap((stats) => stats ? [...stats.values()] : []);
  return entries.filter((entry) => entry.type === `${requestedDirection}-rtp` && entry.kind === 'video')
    .map((entry) => ({ framesSent: entry.framesSent ?? 0, framesDecoded: entry.framesDecoded ?? 0,
      bytesSent: entry.bytesSent ?? 0, bytesReceived: entry.bytesReceived ?? 0 }));
}, direction);
const trackPeers = () => {
  const Native = window.RTCPeerConnection;
  window.__meewavQaPeerConnections = [];
  window.RTCPeerConnection = class extends Native {
    constructor(...args) { super(...args); window.__meewavQaPeerConnections.push(this); }
  };
};
async function signInUi(page, account) {
  await page.locator('input[placeholder="Adresse e-mail"]').fill(account.email, { timeout: 45_000 });
  await page.locator('input[placeholder="Mot de passe"]').fill(account.password);
  await page.getByRole('button', { name: /Se connecter/i }).click();
}
async function waitForVideoFrames(page, direction) {
  let last = [];
  for (let attempt = 0; attempt < 25; attempt += 1) {
    last = await reportPeerStats(page, direction);
    if (last.some((entry) => direction === 'outbound' ? entry.framesSent > 2 && entry.bytesSent > 0
      : entry.framesDecoded > 2 && entry.bytesReceived > 0)) return last;
    await page.waitForTimeout(1000);
  }
  throw new Error(`${direction} video frames not confirmed; stats=${JSON.stringify(last)}`);
}

let hostApp;
let viewerBrowser;
let hostPage;
let viewerPage;
let hostToken;
let roomMayExist = false;
const transportEvents = [];
try {
  const hostSession = await login(accounts[0]);
  const viewerSession = await login(accounts[1]);
  if (hostSession?.user?.id !== accounts[0].id || viewerSession?.user?.id !== accounts[1].id) {
    throw new Error('QA account IDs did not match the saved identities.');
  }
  hostToken = hostSession.access_token;
  const server = await fetch('http://127.0.0.1:5196/', { signal: AbortSignal.timeout(5000) });
  if (!server.ok) throw new Error('Desktop Vite server did not answer on 127.0.0.1:5196.');

  roomMayExist = true;
  const created = await api('/rest/v1/rooms_v2?select=id,host_id,type,title,status', {
    method: 'POST', token: hostToken, prefer: 'return=representation',
    body: { id: roomId, host_id: accounts[0].id, type: 'place', title, status: 'live',
      livekit_room_name: `room-${roomId}`, queue_open: false, video_format: 'landscape' },
  });
  if (created?.[0]?.id !== roomId || created[0].status !== 'live') throw new Error('Room creation was not confirmed.');
  await api('/rest/v1/room_participants_v2?on_conflict=room_id,user_id&select=room_id,user_id,role,left_at', {
    method: 'POST', token: hostToken, prefer: 'resolution=merge-duplicates,return=representation',
    body: { room_id: roomId, user_id: accounts[0].id, role: 'host', left_at: null },
  });
  const live = (await room(hostToken))?.[0];
  if (live?.id !== roomId || live.host_id !== accounts[0].id || live.status !== 'live' || live.type !== 'place') {
    throw new Error('Backend did not confirm the exact Place LIVE Room.');
  }
  result.checks.backendLive = true;
  await record();

  const requireFromDesktop = createRequire(resolve(root, 'apps/meewav-studio/package.json'));
  hostApp = await _electron.launch({
    executablePath: requireFromDesktop('electron'),
    args: [resolve(root, 'apps/meewav-studio/main.cjs')],
    cwd: root,
    env: { ...process.env, MEEWAV_DESKTOP_QA_USER_DATA: profilePath },
    timeout: 45_000,
  });
  hostPage = await hostApp.firstWindow();
  hostPage.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (path.endsWith('/functions/v1/livekit-token')) transportEvents.push({ kind: 'grant', status: response.status() });
  });
  hostPage.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'wss:' || url.pathname.endsWith('/functions/v1/livekit-token')) {
      transportEvents.push({ kind: 'network', host: url.host, failure: request.failure()?.split('\n')[0] });
    }
  });
  await hostPage.addInitScript(trackPeers);
  const authUrl = `http://127.0.0.1:5196/auth?returnTo=${encodeURIComponent(`/rooms/place?room=${roomId}`)}`;
  // Electron's initial loadURL('/') is asynchronous. Wait for it before driving
  // the QA window, or it can interrupt the Room navigation after page.goto().
  await hostPage.waitForURL((url) => url.origin === 'http://127.0.0.1:5196', { waitUntil: 'load', timeout: 45_000 });
  await hostPage.goto(authUrl);
  await signInUi(hostPage, accounts[0]);
  const production = hostPage.getByRole('region', { name: 'Production de la Room' });
  await production.waitFor({ timeout: 90_000 });
  result.checks.desktopHostRoom = await production.getAttribute('data-room-id') === roomId;
  if (!result.checks.desktopHostRoom) throw new Error('Desktop host is not in the exact QA Room.');

  await production.getByRole('button', { name: 'Détecter' }).first().click();
  const cameraSelect = production.getByLabel('Périphérique vidéo');
  // Native <option> nodes exist while the dropdown is closed, but Playwright
  // does not consider them visible. Waiting for visible falsely times out.
  const cameraOptions = cameraSelect.locator('option:not([value=""])');
  await cameraOptions.first().waitFor({ state: 'attached', timeout: 25_000 });
  const discovered = await cameraOptions.evaluateAll((options) => options.map((option) =>
    ({ id: option.value, label: option.textContent?.trim() ?? '' })));
  const camera = discovered.find((option) => /web camera|usb camera/i.test(option.label))
    ?? discovered.find((option) => !/virtual/i.test(option.label));
  if (!camera?.id || !camera.label) throw new Error('No physical Windows camera was discovered.');
  await cameraSelect.selectOption(camera.id);
  await production.getByRole('button', { name: 'Ajouter cette caméra' }).click();
  const preview = production.locator('.room-production__monitor.is-preview video');
  await preview.waitFor({ timeout: 25_000 });
  await hostPage.waitForFunction(() => {
    const video = document.querySelector('.room-production__monitor.is-preview video');
    return video?.srcObject?.getVideoTracks().some((track) => track.readyState === 'live') && video.videoWidth > 0;
  }, undefined, { timeout: 25_000 });
  result.checks.realCamera = { label: camera.label, framesAvailable: true };
  await production.getByRole('button', { name: 'TAKE' }).click();
  await production.getByRole('button', { name: 'Passer en direct' }).click();
  try {
    await hostPage.waitForFunction(() => {
      const status = document.querySelector('.room-production__status')?.textContent ?? '';
      return status.includes('TRANSPORT CONNECTÉ') || status.includes('CONNEXION IMPOSSIBLE');
    }, undefined, { timeout: 40_000 });
    if (!(await production.locator('.room-production__status').textContent())?.includes('TRANSPORT CONNECTÉ')) {
      throw new Error('RTC grant was rejected.');
    }
  } catch {
    result.checks.transportDiagnostics = {
      status: await production.locator('.room-production__status').textContent().catch(() => null),
      alerts: await hostPage.locator('[role="alert"]').allTextContents().catch(() => []),
      events: transportEvents,
    };
    throw new Error('RTC transport did not connect.');
  }
  result.checks.outboundVideo = await waitForVideoFrames(hostPage, 'outbound');
  await record();

  viewerBrowser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const viewerContext = await viewerBrowser.newContext();
  await viewerContext.addInitScript(trackPeers);
  viewerPage = await viewerContext.newPage();
  await viewerPage.goto(authUrl);
  await signInUi(viewerPage, accounts[1]);
  await viewerPage.getByRole('region', { name: 'La Place' }).waitFor({ timeout: 90_000 });
  result.checks.viewerSameRoom = new URL(viewerPage.url()).searchParams.get('room') === roomId;
  if (!result.checks.viewerSameRoom) throw new Error('Viewer joined a different Room.');
  result.checks.inboundVideo = await waitForVideoFrames(viewerPage, 'inbound');
  result.status = 'PASS';
  await record();
} catch (error) {
  result.status = 'FAIL';
  result.error = safeError(error);
  await record();
} finally {
  if (hostPage) {
    try {
      const stop = hostPage.getByRole('button', { name: 'Arrêter la diffusion' });
      if (await stop.isVisible()) { await stop.click({ timeout: 5000 }); result.cleanup.broadcastStopped = true; }
    } catch (error) { result.cleanup.stopError = safeError(error); }
  }
  if (hostToken && roomMayExist) {
    try {
      const exact = (await room(hostToken))?.[0];
      if (exact?.id === roomId && exact.host_id === accounts[0].id && exact.title === title) {
        if (exact.status === 'live') await api('/rest/v1/rpc/rooms_end_room_v1', {
          method: 'POST', token: hostToken, body: { p_room_id: roomId },
        });
        result.cleanup.roomEnded = (await room(hostToken))?.[0]?.status === 'ended';
      }
    } catch (error) { result.cleanup.roomError = safeError(error); }
  }
  try { if (viewerBrowser) { await viewerBrowser.close(); result.cleanup.viewerClosed = true; } }
  catch (error) { result.cleanup.viewerCloseError = safeError(error); }
  try { if (hostApp) { await hostApp.close(); result.cleanup.desktopClosed = true; } }
  catch (error) { result.cleanup.desktopCloseError = safeError(error); }
  result.finishedAt = new Date().toISOString();
  await record();
  console.log(JSON.stringify({ roomId, status: result.status, checks: result.checks,
    cleanup: result.cleanup, error: result.error, reportPath }));
  if (result.status !== 'PASS' || result.cleanup.roomEnded !== true) process.exitCode = 1;
}
