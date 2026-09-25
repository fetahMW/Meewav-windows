import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tileServerDirectory = path.join(repositoryRoot, "server", "mvt-tile-server");
const viteCli = path.join(repositoryRoot, "node_modules", "vite", "bin", "vite.js");
const tileHealthUrl = "http://127.0.0.1:5000/health";
const ROOMS_WORKSPACE_PREVIEW_FLAG = "--rooms-workspace-preview";
const ROOMS_HOME_WORKSPACE_PREVIEW_FLAG = "--rooms-home-workspace-preview";
const CLASSE_WORKSPACE_PREVIEW_FLAG = "--classe-workspace-preview";
const AUTH_ENTRY_PREVIEW_FLAG = "--auth-entry-preview";
const developmentArguments = process.argv.slice(2);
const authEntryPreview = developmentArguments.includes(AUTH_ENTRY_PREVIEW_FLAG);
// The vinyl globe owns its prepared geography and avatar Worker. The former
// MVT service remains available explicitly for maintenance of archived maps.
const legacyGlobeTiles = developmentArguments.includes('--legacy-globe-tiles');
const roomsWorkspacePreview = developmentArguments.includes(ROOMS_WORKSPACE_PREVIEW_FLAG);
const roomsHomeWorkspacePreview = developmentArguments.includes(ROOMS_HOME_WORKSPACE_PREVIEW_FLAG);
const classeWorkspacePreview = developmentArguments.includes(CLASSE_WORKSPACE_PREVIEW_FLAG);

const isolatedWorkspacePreviewCount = [
  roomsHomeWorkspacePreview,
  classeWorkspacePreview,
].filter(Boolean).length;

if (isolatedWorkspacePreviewCount > 1 || (roomsWorkspacePreview && isolatedWorkspacePreviewCount > 0)) {
  throw new Error("Choisis un seul mode de preview Rooms à la fois.");
}

const viteArguments = developmentArguments.filter((argument) => (
  argument !== AUTH_ENTRY_PREVIEW_FLAG
  && argument !== ROOMS_WORKSPACE_PREVIEW_FLAG
  && argument !== '--legacy-globe-tiles'
  && argument !== ROOMS_HOME_WORKSPACE_PREVIEW_FLAG
  && argument !== CLASSE_WORKSPACE_PREVIEW_FLAG
));

let stopping = false;
let tileServer = null;
let viteServer = null;
let tileRestartTimer = null;
let tileHealthTimer = null;

async function isTileServerReady(timeoutMs = 650) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(tileHealthUrl, { signal: controller.signal });
    if (!response.ok) return false;
    const health = await response.json();
    return health?.ok === true
      && health?.dataReady === true
      && Number(health?.avatarCount) > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

function scheduleTileServerRestart() {
  if (stopping || tileRestartTimer !== null) return;
  tileRestartTimer = setTimeout(async () => {
    tileRestartTimer = null;
    if (stopping || await isTileServerReady()) return;
    startTileServer();
  }, 700);
}

function startTileServer() {
  if (stopping || tileServer) return;
  tileServer = spawn(process.execPath, ["index.js"], {
    cwd: tileServerDirectory,
    env: {
      ...process.env,
      PORT: process.env.PORT || "5000",
      // A local host must always have avatars even when PostGIS is offline.
      MEEWAV_ALLOW_DETERMINISTIC_50K_FALLBACK:
        process.env.MEEWAV_ALLOW_DETERMINISTIC_50K_FALLBACK || "1",
      MEEWAV_MVT_LOCAL_ONLY: process.env.MEEWAV_MVT_LOCAL_ONLY || "1",
    },
    stdio: "inherit",
    windowsHide: true,
  });
  tileServer.once("exit", () => {
    tileServer = null;
    scheduleTileServerRestart();
  });
}

async function ensureTileServerReady() {
  if (!await isTileServerReady()) startTileServer();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await isTileServerReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  console.warn("[dev] Le serveur d’avatars démarre encore ; Vite continue sans bloquer.");
}

function stopChild(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  child.kill();
}

function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  if (tileRestartTimer !== null) clearTimeout(tileRestartTimer);
  if (tileHealthTimer !== null) clearInterval(tileHealthTimer);
  stopChild(tileServer);
  stopChild(viteServer);
  setTimeout(() => process.exit(exitCode), 50).unref();
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));

if (legacyGlobeTiles && !classeWorkspacePreview && !roomsHomeWorkspacePreview) {
  await ensureTileServerReady();

  // Also supervise a tile server that was already running when Vite started.
  // If it disappears later, the development host replaces it automatically.
  tileHealthTimer = setInterval(async () => {
    if (stopping || tileServer || await isTileServerReady()) return;
    startTileServer();
  }, 1500);
  tileHealthTimer.unref();
}

viteServer = spawn(process.execPath, [viteCli, ...viteArguments], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    VITE_AUTH_ENTRY_PREVIEW: authEntryPreview ? "true" : "false",
    // Only explicit Rooms launchers may expose an anonymous Rooms shell.
    VITE_ROOMS_WORKSPACE_PREVIEW: roomsWorkspacePreview ? "true" : "false",
    // The integration branch gets a strict, development-only landing-page boundary.
    VITE_ROOMS_HOME_WORKSPACE_PREVIEW: roomsHomeWorkspacePreview ? "true" : "false",
    // La Classe gets its own narrower, development-only routing boundary.
    VITE_CLASSE_WORKSPACE_PREVIEW: classeWorkspacePreview ? "true" : "false",
  },
  stdio: "inherit",
  windowsHide: true,
});
viteServer.once("exit", (code) => shutdown(code ?? 0));
