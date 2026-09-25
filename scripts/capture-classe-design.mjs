import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const label = process.argv[2] ?? "current";
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error("Use a simple capture label.");
const directory = path.resolve("artifacts", "classe-design", label);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });

try {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 1024, height: 640 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:5179/rooms/classe", { waitUntil: "domcontentloaded" });
    const tools = page.getByRole("tab", { name: "Classe", exact: true });
    await tools.waitFor({ state: "visible", timeout: 30000 });
    // Let the isolated Room finish hydrating before choosing the studio tab.
    await page.waitForTimeout(700);
    await tools.click();
    await page.getByRole("tab", { name: "La Classe", exact: true }).click();
    await page.getByRole("button", { name: "Replier le lecteur audio de La Classe" }).click();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll(".classroom-seat img")].map((img) => img.decode().catch(() => {})));
    });
    const panel = page.locator(".place-mixer.has-classroom-player");
    const prefix = `${viewport.width}x${viewport.height}`;
    await panel.screenshot({ path: path.join(directory, `${prefix}-classe.png`), animations: "disabled" });
    const metrics = await page.evaluate(() => {
      const roster = document.querySelector(".classroom-roster");
      const seats = [...document.querySelectorAll(".classroom-seat")];
      return {
        seats: seats.length,
        overflow: getComputedStyle(roster).overflowY,
        height: roster.clientHeight,
        scroll: roster.scrollHeight,
        portraits: seats.map((seat) => {
          const image = seat.querySelector(".classroom-seat__portrait").getBoundingClientRect();
          const name = seat.querySelector("strong").getBoundingClientRect();
          const rect = seat.getBoundingClientRect();
          return { width: image.width, height: image.height, bottom: name.bottom, cardBottom: rect.bottom, imageBottom: image.bottom, nameTop: name.top };
        }),
        icons: [...document.querySelectorAll(".classroom-command-dock__controls > button > svg")].map((svg) => svg.getBoundingClientRect().top),
      };
    });
    assert.equal(metrics.seats, 24);
    assert.equal(metrics.overflow, "hidden", "The collapsed player must remove roster scrolling.");
    assert.ok(metrics.scroll <= metrics.height + 1, "The collapsed roster must show all 24 seats without scrolling.");
    for (const portrait of metrics.portraits) {
      assert.ok(Math.abs(portrait.width - portrait.height) < 1, "Portraits must remain circular.");
      assert.ok(portrait.bottom <= portrait.cardBottom + 1, "A student name is clipped.");
      assert.ok(portrait.imageBottom <= portrait.nameTop + 1, "A portrait overlaps its name.");
    }
    assert.ok(Math.max(...metrics.icons) - Math.min(...metrics.icons) < 1, "Dock icons are misaligned.");

    await page.getByRole("button", { name: /Noé Rivière, place 2/ }).click();
    assert.equal(await page.locator(".classroom-seat.is-selected").count(), 1);
    await panel.screenshot({ path: path.join(directory, `${prefix}-selected.png`), animations: "disabled" });
    await page.getByRole("button", { name: "Écrire un message privé à Noé Rivière" }).click();
    const dialog = page.getByRole("dialog", { name: "Message privé à Noé Rivière" });
    await dialog.getByRole("textbox").fill("Prends ton temps sur la mesure 12, puis reprends avec nous.");
    await dialog.screenshot({ path: path.join(directory, `${prefix}-private.png`), animations: "disabled" });
    await dialog.getByRole("button", { name: "Fermer le message privé" }).click();
    await page.getByRole("button", { name: "Ouvrir les ressources du cours" }).click();
    const resources = page.getByRole("region", { name: "Ressources du cours" });
    await resources.screenshot({ path: path.join(directory, `${prefix}-resources.png`), animations: "disabled" });
    await resources.getByRole("button", { name: "Fermer les ressources" }).click();
    await page.getByRole("button", { name: "Fermer les demandes de prise de parole" }).click();
    await page.waitForFunction(() => document.querySelectorAll(".classroom-seat.is-hand-raised").length === 0);
    assert.equal(await page.locator(".classroom-seat.is-selected").count(), 1);
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.deepEqual(errors, []);
    console.log(`${prefix}: 24 seats, no overflow, circular portraits, aligned controls, selection + private dialog + resources + hands OK.`);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`Captures: ${directory}`);
