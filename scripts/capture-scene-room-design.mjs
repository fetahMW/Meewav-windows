import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const baseUrl = process.env.MEEWAV_CAPTURE_URL ?? 'http://127.0.0.1:5181';
const directory = 'artifacts/scene-room-redesign';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const report = [];
try {
  for (const viewport of [{ width: 1600, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => {
      // Existing room view transitions can be cancelled when changing surfaces.
      if (error.message !== 'Transition was skipped') errors.push(error.message);
    });
    await page.goto(`${baseUrl}/rooms/scene`, { waitUntil: 'domcontentloaded' });
    const studio = page.locator('.place-studio-panel');
    await expect(studio).toBeVisible();
    const expand = studio.getByRole('button', { name: 'Ouvrir le panneau', exact: true });
    if (await expand.isVisible()) await expand.click();
    await studio.locator('.place-studio-panel__tabs [data-surface="tools"]').click();
    await expect(studio.locator('.place-studio-panel__tabs [data-surface="tools"]')).toHaveCSS('color', 'rgb(255, 255, 255)');
    for (const [label, id] of [['Programme', 'program'], ['Évaluation', 'evaluation'], ['Cagnotte', 'fundraiser'], ['Prompteur', 'prompter']]) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      const panel = page.locator(`.room-tool-panel.is-${id}`);
      await expect(panel).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await panel.evaluate(el => { el.scrollTop = 0; });
      const overflow = await panel.evaluate(el => el.scrollWidth - el.clientWidth);
      assert.ok(overflow <= 1, `${id} horizontal overflow at ${viewport.width}: ${overflow}`);
      await studio.screenshot({ path: `${directory}/${id}-${viewport.width}.png` });
      if (id === 'program') {
        await expect(panel.getByRole('button', { name: 'Terminer le passage' })).toBeVisible();
        const unclipped = await panel.locator('.scene-running-order__on-air').evaluate(el => el.scrollHeight <= el.clientHeight + 1);
        assert.ok(unclipped, 'Now and next controls must fit their card');
        assert.equal(await studio.locator('.place-mixer-audio.is-empty').evaluate(el => {
          const deck = el.getBoundingClientRect();
          const controls = el.querySelector('.place-mixer-audio__controls').getBoundingClientRect();
          return controls.top >= deck.top && controls.bottom <= deck.bottom + 1;
        }), true, 'Compact empty audio deck must keep its transport controls visible');
      }
      if (id === 'prompter') {
        assert.equal(await panel.locator('.scene-prompter__launch').evaluate(el => el.scrollHeight <= el.clientHeight + 1), true, 'The prompter launch card must not clip its start button');
      }
    }
    await page.getByRole('button', { name: 'Démarrer sur mon écran' }).click();
    const reader = page.getByRole('dialog', { name: /Prompteur privé/ });
    await expect(reader).toBeVisible();
    const bounds = await reader.boundingBox();
    assert.ok(bounds && bounds.x === 0 && bounds.y === 0 && bounds.width === viewport.width && bounds.height === viewport.height, 'Private reader must cover the viewport');
    assert.equal(await reader.evaluate(el => el.parentElement === document.body), true);
    await expect(reader.locator('.scene-prompter-screen__countdown')).toBeVisible();
    await reader.screenshot({ path: `${directory}/countdown-${viewport.width}.png` });
    await expect(reader.locator('.scene-prompter-screen__countdown')).toHaveCount(0, { timeout: 7000 });
    await reader.getByRole('button', { name: 'Pause', exact: true }).click();
    await reader.getByRole('button', { name: 'Ligne suivante' }).click();
    await expect(reader.locator('p[aria-current="true"]')).not.toHaveText("La ville s'endort sous les néons");
    await expect.poll(() => reader.evaluate(el => {
      const focus = el.querySelector('p[aria-current="true"]').getBoundingClientRect();
      const guide = el.querySelector('.scene-prompter-screen__guide').getBoundingClientRect();
      return Math.abs(focus.top + focus.height / 2 - guide.top - guide.height / 2);
    })).toBeLessThan(3);
    await reader.screenshot({ path: `${directory}/reading-${viewport.width}.png` });
    await page.keyboard.press('Escape');
    await expect(reader).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Démarrer sur mon écran' })).toBeFocused();
    await studio.locator('.place-studio-panel__tabs [data-surface="chat"]').click();
    await studio.locator('.mw-emoticon-composer').fill('Une belle soirée');
    await expect(studio.locator('.place-chat__composer button[type="submit"]')).toHaveCSS('color', 'rgb(255, 225, 196)');
    const emojiTrigger = studio.locator('.place-chat__emoji > button');
    await emojiTrigger.click();
    await expect(emojiTrigger).toHaveCSS('color', 'rgb(228, 209, 255)');
    const emojiWall = page.locator('.mw-emoticon-wall--room-chat');
    await expect(emojiWall).toBeVisible();
    await expect(emojiWall.locator('.mw-emoticon-wall__search')).toHaveCSS('border-top-color', 'rgb(177, 138, 218)');
    await expect(emojiWall.locator('.mw-emoticon-wall__categories button.is-active')).toHaveCSS('color', 'rgb(219, 193, 255)');
    const emoji = emojiWall.locator('.mw-emoticon-wall__grid > button').first();
    await emoji.hover();
    await expect(emoji).toHaveCSS('color', 'rgb(228, 206, 255)');
    await emojiWall.screenshot({ path: `${directory}/emoticons-${viewport.width}.png` });
    assert.deepEqual(errors, [], `Unexpected page errors at ${viewport.width}`);
    report.push({ viewport, tools: 4, overflow: false, privateReaderCoversViewport: true, countdown: true, keyboardCloseRestoresFocus: true, emojiTheme: 'violet', chatTheme: 'orange', errors });
    await context.close();
  }
  await writeFile(`${directory}/checks.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
