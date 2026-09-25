import { expect, test } from "@playwright/test";

const GRADE_COLORS = ["#FFFFFF", "#F59E0B", "#34D399", "#EC4899", "#2563FF", "#6A00FF"] as const;
const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1440, height: 1000 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`les six grades reprennent la couleur de leur badge à ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/tremplin/comprendre#tremplin-grades");
    await page.emulateMedia({ reducedMotion: "reduce" });

    const section = page.locator("#tremplin-grades");
    const definition = section.locator(".tremplin-how__grade-definition");
    const activeBorders = new Set<string>();

    await expect(section.getByRole("heading", { name: "Les six grades situent le parcours." })).toBeVisible();

    for (let index = 0; index < GRADE_COLORS.length; index += 1) {
      const level = index + 1;
      const card = section.locator(`[data-grade-level="${level}"]`);
      const button = card.getByRole("button");

      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(card).toHaveClass(/is-active/);

      const cardColor = await card.evaluate((element) => getComputedStyle(element).getPropertyValue("--how-grade-main").trim());
      const sectionColor = await section.evaluate((element) => getComputedStyle(element).getPropertyValue("--how-active-grade-main").trim());
      expect(cardColor.toUpperCase()).toBe(GRADE_COLORS[index]);
      expect(sectionColor.toUpperCase()).toBe(GRADE_COLORS[index]);

      await page.waitForTimeout(200);
      activeBorders.add(await card.evaluate((element) => getComputedStyle(element).borderColor));
      await expect(definition.getByText(`Niveau ${level}`, { exact: true })).toBeVisible();
    }

    expect(activeBorders.size).toBe(6);
  });
}
