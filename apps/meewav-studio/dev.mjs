import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import electronPath from 'electron';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const desktopPort = process.env.MEEWAV_DESKTOP_DEV_PORT || '5197';
const vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'),
  '--host', '127.0.0.1', '--port', desktopPort, '--strictPort'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_MEEWAV_STUDIO_DESKTOP: 'false', VITE_ROOMS_WORKSPACE_PREVIEW: 'false', VITE_ROOMS_HOME_WORKSPACE_PREVIEW: 'false', VITE_CLASSE_WORKSPACE_PREVIEW: 'false' },
});

let electron;
let closed = false;
function close(code = 0) {
  if (closed) return;
  closed = true;
  electron?.kill();
  vite.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => close(130));
process.on('SIGTERM', () => close(143));
vite.on('exit', (code) => close(code || 1));

try {
  let ready = false;
  for (let attempt = 0; attempt < 80 && !closed; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${desktopPort}/`, { signal: AbortSignal.timeout(500) });
      if (response.ok) { ready = true; break; }
    } catch { /* Vite is still starting. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  if (!ready) throw new Error(`Le serveur local Studio n’a pas démarré sur 127.0.0.1:${desktopPort}.`);
  electron = spawn(electronPath, [resolve(here, 'main.cjs')], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env },
  });
  electron.on('exit', (code) => close(code || 0));
} catch (error) {
  console.error(error);
  close(1);
}
