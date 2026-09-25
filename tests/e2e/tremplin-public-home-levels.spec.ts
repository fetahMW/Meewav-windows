import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1440, height: 1000 },
  { width: 1832, height: 900 },
] as const;

test.describe("section des grades sur l’accueil Tremplin", () => {
  for (const viewport of VIEWPORTS) {
    test(`sépare les conteneurs et colore la sélection à ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/tremplin");
      await page.emulateMedia({ reducedMotion: "reduce" });

      const levelsSection = page.locator("#niveaux");
      await levelsSection.scrollIntoViewIfNeeded();

      const gap = await levelsSection.evaluate((levels, precedingSelector) => {
        const preceding = document.querySelector(precedingSelector);
        if (!(preceding instanceof HTMLElement)) return -1;
        return levels.getBoundingClientRect().top - preceding.getBoundingClientRect().bottom;
      }, "#comment-ca-marche");
      expect(gap).toBeGreaterThanOrEqual(30);

      const gradeButtons = levelsSection
        .getByRole("group", { name: "Explorer les six niveaux MeeWav" })
        .getByRole("button");
      const activeBorders = new Set<string>();

      for (let index = 0; index < 6; index += 1) {
        const button = gradeButtons.nth(index);
        await button.click();
        await expect(button).toHaveAttribute("aria-pressed", "true");
        await page.waitForTimeout(240);
        activeBorders.add(await button.evaluate((element) => getComputedStyle(element).borderTopColor));
      }

      expect(activeBorders.size).toBe(6);
    });
  }
});
