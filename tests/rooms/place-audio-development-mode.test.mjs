import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the default local launcher exposes the Place audio adapters and plugin scanner", async () => {
  const [packageSource, launcher, app, viteEnvironment] = await Promise.all([
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/start-development.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/vite-env.d.ts", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);
  const command = packageJson.scripts?.dev ?? "";

  assert.match(command, /scripts\/start-development\.mjs/u);
  assert.match(command, /--rooms-workspace-preview/u);
  assert.match(command, /--mode audio-lab/u);
  assert.match(command, /--host 127\.0\.0\.1/u);
  assert.match(command, /--port 5178/u);
  assert.match(command, /--open \/rooms/u);
  assert.equal(packageJson.scripts?.["dev:web"], "vite");
  assert.doesNotMatch(packageJson.scripts?.["dev:audio-lab"] ?? "", /--rooms-workspace-preview/u);

  assert.match(launcher, /ROOMS_WORKSPACE_PREVIEW_FLAG\s*=\s*["']--rooms-workspace-preview["']/u);
  assert.match(launcher, /developmentArguments\.filter\(\(argument\)\s*=>\s*argument\s*!==\s*ROOMS_WORKSPACE_PREVIEW_FLAG\)/u);
  assert.match(launcher, /VITE_ROOMS_WORKSPACE_PREVIEW:\s*roomsWorkspacePreview\s*\?\s*["']true["']\s*:\s*["']false["']/u);
  assert.match(viteEnvironment, /VITE_ROOMS_WORKSPACE_PREVIEW\?:\s*["']true["']\s*\|\s*["']false["']/u);

  assert.match(app, /IS_ROOMS_WORKSPACE_PREVIEW_MODE\s*=\s*import\.meta\.env\.DEV[\s\S]*?VITE_ROOMS_WORKSPACE_PREVIEW\s*===\s*["']true["']/u);
  assert.match(app, /function\s+RoomsRoute\(\)[\s\S]*?<PreviewAuthenticatedRoute\s+allowRoomsWorkspacePreview=\{IS_ROOMS_WORKSPACE_PREVIEW_MODE\}>[\s\S]*?<RoomsPage\s*\/>/u);
  assert.match(app, /function\s+AuthenticationRoute\(\)[\s\S]*?IS_ROOMS_WORKSPACE_PREVIEW_MODE[\s\S]*?<Navigate\s+to=["']\/rooms["']\s+replace\s*\/>/u);
  assert.match(app, /path=["']\/["'][\s\S]*?to=\{IS_ROOMS_WORKSPACE_PREVIEW_MODE\s*\?\s*["']\/rooms["']\s*:\s*["']\/auth["']\}/u);

  for (const route of ["Profile", "Messaging", "Market", "Tremplin", "Scene", "InternalAudioEngine"]) {
    const routeStart = app.indexOf(`function ${route}Route()`);
    const nextRouteStart = app.indexOf("\nfunction ", routeStart + 1);
    const routeSource = app.slice(routeStart, nextRouteStart === -1 ? undefined : nextRouteStart);
    assert.doesNotMatch(routeSource, /allowRoomsWorkspacePreview/u, `${route} must keep its normal auth policy`);
  }
});
