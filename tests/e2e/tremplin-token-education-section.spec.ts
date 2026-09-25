import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 },
] as const;

test.describe("présentation pédagogique du jeton de talent", () => {
  for (const viewport of VIEWPORTS) {
    test(`reste premium et progressive à ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/tremplin/comprendre#tremplin-token-mw");
      await page.emulateMedia({ reducedMotion: "reduce" });

      const section = page.locator("#tremplin-token-mw");
      await section.evaluate((element) => element.scrollIntoView({ block: "start" }));
      const title = section.getByRole("heading", { name: "Le jeton de talent, simplement." });
      await expect(title).toBeVisible();
      const titleBox = await title.boundingBox();
      expect(titleBox?.y ?? 0).toBeGreaterThan(64);

      const visual = section.locator(".tremplin-how__mw-visual");
      const coin = section.locator(".tremplin-how__mw-premium-coin");
      await expect(visual).toBeVisible();
      await expect(coin).toHaveAttribute("src", "/images/tremplin/mw-token-premium-reference-cropped-v2.png");
      await expect(coin).toHaveAttribute("alt", /Pièce lumineuse représentant le jeton de talent/);
      await expect(coin).toBeVisible();
      await expect(section.getByText("Facultatif", { exact: true })).toBeVisible();
      await expect(section.getByText("Part de l’artiste visible", { exact: true })).toBeVisible();
      await expect(section.getByText("Aucun gain garanti", { exact: true })).toBeVisible();
      await expect(section.getByText("Premier EP en production")).toHaveCount(0);

      const [visualBox, coinBox] = await Promise.all([visual.boundingBox(), coin.boundingBox()]);
      const coinWidthRatio = (coinBox?.width ?? 0) / (visualBox?.width ?? 1);
      expect(coinWidthRatio).toBeGreaterThan(0.78);
      expect(coinWidthRatio).toBeLessThan(0.9);
      await expect(coin).toHaveCSS("object-fit", "contain");

      const essential = section.locator(".tremplin-how__mw-essential");
      const essentialBox = await essential.boundingBox();
      expect(visualBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(440);
      if (viewport.width >= 1024) {
        expect(essentialBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(620);
        expect((essentialBox?.y ?? Number.POSITIVE_INFINITY) + (essentialBox?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
      }

      await expect(section.locator(".tremplin-how__mw-before li")).toHaveCount(5);
      const beforeBox = await section.locator(".tremplin-how__mw-before").boundingBox();
      if (viewport.width >= 1024) expect(beforeBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(190);

      const detailButtons = section.locator(".tremplin-how__mw-details h3 > button");
      await expect(detailButtons).toHaveCount(0);

      const summaryButton = section.getByRole("button", { name: /Voir un exemple de récapitulatif/ });
      await expect(summaryButton).toHaveAttribute("aria-expanded", "false");
      await summaryButton.click();
      await expect(summaryButton).toHaveAttribute("aria-expanded", "true");
      const summary = section.getByRole("region", { name: "Exemple pédagogique de récapitulatif" });
      await expect(summary).toBeVisible();
      await expect(summary.locator("dl > div")).toHaveCount(6);
      await expect(summary).toContainText("25,00 €");
      await expect(summary).toContainText("27,70 jetons");
      await expect(summary).toContainText("0,73 €");
      await expect(summary).toContainText("0,75 €");
      await expect(summary).toContainText("Selon les conditions affichées");
      await summaryButton.click();
      await expect(summaryButton).toHaveAttribute("aria-expanded", "false");

      const conclusion = section.locator(".tremplin-how__mw-conclusion");
      await expect(conclusion.getByRole("heading", { name: "La musique d’abord. La force, seulement si tu le souhaites." })).toBeVisible();
      await expect(conclusion.getByText(/Si tu veux donner de la force à un projet/)).toBeVisible();
      await expect(conclusion.getByRole("button", { name: /Découvrir les artistes/ })).toBeVisible();
      await expect(conclusion.getByRole("button", { name: "Retour à l’accueil" })).toBeVisible();
      const rulesTrigger = conclusion.getByRole("button", { name: /Consulter les règles détaillées/ });
      await expect(rulesTrigger).toBeVisible();
      await expect(page.getByRole("button", { name: /Consulter les règles détaillées/ })).toHaveCount(1);

      const conclusionBox = await conclusion.boundingBox();
      if (viewport.width >= 1024) {
        expect(conclusionBox?.height ?? 0).toBeGreaterThanOrEqual(220);
        expect(conclusionBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(280);
      }

      await rulesTrigger.click();
      const rulesDialog = page.getByRole("dialog", { name: "Comprendre les jetons de talent." });
      await expect(rulesDialog).toBeVisible();
      const dialogDetails = rulesDialog.locator(".tremplin-how__mw-details h3 > button");
      await expect(dialogDetails).toHaveCount(4);
      for (let index = 0; index < 4; index += 1) await expect(dialogDetails.nth(index)).toHaveAttribute("aria-expanded", "false");
      await dialogDetails.nth(1).click();
      await expect(dialogDetails.nth(1)).toHaveAttribute("aria-expanded", "true");
      await expect(rulesDialog.getByText(/Une hausse passée ne garantit aucune hausse future/)).toBeVisible();
      await rulesDialog.getByRole("button", { name: "Fermer les règles détaillées" }).click();
      await expect(rulesDialog).toBeHidden();
      await expect(rulesTrigger).toBeFocused();

      if (viewport.width <= 820) {
        const blocks = await Promise.all([
          visual.boundingBox(),
          section.locator(".tremplin-how__mw-explanation").boundingBox(),
          section.locator(".tremplin-how__mw-before").boundingBox(),
          section.locator(".tremplin-how__mw-conclusion").boundingBox(),
        ]);
        const tops = blocks.map((box) => box?.y ?? 0);
        expect(tops).toEqual([...tops].sort((left, right) => left - right));
      }
    });
  }
});
