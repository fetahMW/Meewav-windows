import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

// Use the assigned worktree servers, with a fresh browser context per room.
const rooms = [
  { id: "classe", label: "Classe", port: 5179, icon: "graduation-cap" },
  { id: "place", label: "Place", port: 5178, icon: "users-round" },
  { id: "loge", label: "Loge", port: 5178, icon: "door-open" },
  { id: "wave", label: "Wave", port: 5178, icon: "audio-lines" },
  { id: "cage", label: "Cage", port: 5180, icon: "radio" },
  { id: "scene", label: "Scène", port: 5181, icon: "mic-vocal" },
];
const label = process.argv[2] ?? "current";
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error("Use a simple capture label.");
const selected = process.argv.slice(3);
assert.ok(selected.every((id) => rooms.some((room) => room.id === id)), "Unknown room.");
const directory = path.resolve("artifacts", "room-studio-design", label);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const results = [];

try {
  for (const room of rooms.filter(({ id }) => !selected.length || selected.includes(id))) {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const prefix = `${room.id}-${viewport.width}`;
      try {
        await page.goto(`http://127.0.0.1:${room.port}/rooms/${room.id}`, { waitUntil: "domcontentloaded" });
        const panel = page.locator(".place-studio-panel");
        await panel.waitFor({ state: "visible", timeout: 30000 });
        await page.waitForTimeout(900);
        await page.evaluate(async () => document.fonts.ready);
        // Cage intentionally opens its mobile duel with the studio folded.
        if (await panel.getByRole("button", { name: "Ouvrir le panneau", exact: true }).isVisible()) {
          await panel.getByRole("button", { name: "Ouvrir le panneau", exact: true }).click();
        }
        const tabs = panel.locator(".place-studio-panel__tabs");
        assert.deepEqual(await tabs.getByRole("tab").allTextContents(), ["Chat", "Mixeur", room.label, "Invités"]);
        assert.equal(await tabs.locator(`[data-surface="tools"] svg.lucide-${room.icon}`).count(), 1, `${prefix}: room icon`);
        assert.equal(await page.locator(".place-stage__controls .place-stage__screen-share-action").count(), 1, `${prefix}: stage screen sharing`);
        assert.equal(await panel.getByRole("button", { name: /partager.*écran|partage.*écran/i }).count(), 0, `${prefix}: duplicate screen sharing`);
        assert.equal(await panel.locator(".place-studio-panel__hifi-feet:visible").count(), 0, `${prefix}: feet`);
        assert.equal(await panel.evaluate((node) => getComputedStyle(node).marginBottom), "0px");
        const captures = [];
        for (const surface of ["chat", "mixer", "tools", "guests"]) {
          await tabs.locator(`[data-surface="${surface}"]`).click();
          await page.waitForTimeout(150);
          if (surface === "chat") {
            const actions = panel.getByRole("tablist", { name: "Actions du Chat" });
            assert.deepEqual(await actions.getByRole("tab").allTextContents(), ["Messages", "Sondages", "Épinglés", "Cadeaux"]);
            assert.equal(await actions.getByRole("tab", { name: "Messages", exact: true }).evaluate((node) => getComputedStyle(node).color), "rgb(255, 211, 172)");
            for (const action of ["Sondages", "Épinglés", "Cadeaux", "Messages"]) {
              const tab = actions.getByRole("tab", { name: action, exact: true });
              await tab.click();
              assert.equal(await tab.getAttribute("aria-selected"), "true");
              if (action !== "Messages" && viewport.width === 1440) {
                const file = `${prefix}-chat-${action === "Sondages" ? "polls" : action === "Épinglés" ? "pins" : "gifts"}.png`;
                await panel.screenshot({ path: path.join(directory, file), animations: "disabled" });
                captures.push(file);
              }
            }
          }
          if (surface === "mixer") {
            assert.equal(await tabs.locator('[data-surface="mixer"] svg').evaluate((node) => getComputedStyle(node).color), "rgb(199, 128, 255)");
            assert.ok(await panel.locator(".place-mixer-audio:visible").count(), `${prefix}: audio player`);
          }
          if (surface === "tools") {
            const toolLabels = await panel.getByRole("tab").allTextContents();
            assert.ok(!toolLabels.some((text) => /^(Sondages|Épinglés|Cadeaux|Partage d’écran)$/.test(text)), `${prefix}: generic tools duplicated`);
          }
          const overflow = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth);
          assert.ok(overflow <= 1, `${prefix}/${surface}: ${overflow}px horizontal overflow`);
          const file = `${prefix}-${surface}.png`;
          await panel.screenshot({ path: path.join(directory, file), animations: "disabled" });
          captures.push(file);
          if (surface === "chat") await page.screenshot({ path: path.join(directory, `${prefix}-full.png`), animations: "disabled" });
        }
        // Public roles must retain the Chat actions without production-only sharing.
        await page.goto(`http://127.0.0.1:${room.port}/rooms/${room.id}?demoRole=viewer`, { waitUntil: "domcontentloaded" });
        await page.locator(".place-studio-panel.is-viewer-panel").waitFor({ timeout: 30000 });
        if (await panel.getByRole("button", { name: "Ouvrir le panneau", exact: true }).isVisible()) {
          await panel.getByRole("button", { name: "Ouvrir le panneau", exact: true }).click();
        }
        assert.equal(await page.getByRole("button", { name: "Partager mon écran", exact: true }).count(), 0);
        await page.locator('[data-surface="chat"]').click();
        assert.deepEqual(await page.getByRole("tablist", { name: "Actions du Chat" }).getByRole("tab").allTextContents(), ["Messages", "Sondages", "Épinglés", "Cadeaux"]);
        assert.deepEqual(errors, [], `${prefix}: browser errors`);
        results.push({ room: room.id, port: room.port, viewport, host: "passed", viewer: "passed", captures });
        console.log(`${prefix}: host + viewer, Chat actions, room icon, purple mixer, stage screen sharing, no feet/overflow OK`);
      } catch (error) {
        await page.screenshot({ path: path.join(directory, `${prefix}-failure.png`), fullPage: true }).catch(() => {});
        throw error;
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await writeFile(path.join(directory, "verification.json"), JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(`Captures: ${directory}`);
