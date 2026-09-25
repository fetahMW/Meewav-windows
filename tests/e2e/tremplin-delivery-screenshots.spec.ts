import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const SCREENS = [
  { slug: "accueil", path: "/tremplin", ready: "#tremplin-public-title" },
  { slug: "decouvrir", path: "/tremplin/decouvrir", ready: ".tremplin-home-discovery" },
  { slug: "profil", path: "/tremplin/artistes/lunae", ready: ".tremplin-token-artist" },
  { slug: "comment-ca-marche", path: "/tremplin/comprendre", ready: ".tremplin-how" },
  { slug: "grades", path: "/tremplin/comprendre#tremplin-grades", ready: "#tremplin-grades" },
  { slug: "jeton-mw", path: "/tremplin/comprendre#tremplin-token-mw", ready: "#tremplin-token-mw" },
  { slug: "mes-artistes", path: "/tremplin/mes-artistes", ready: ".tremplin-my-artists" },
  { slug: "achat", path: "/tremplin/soutien-mw/lunae/achat", ready: ".tremplin-token-flow-page" },
  { slug: "revente", path: "/tremplin/soutien-mw/lunae/revente", ready: ".tremplin-token-flow-page" },
  { slug: "demande-artiste", path: "/tremplin/demande", ready: ".tremplin-token-workspace" },
] as const;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 375, height: 812 },
] as const;

test("captures de livraison du Tremplin", async ({ page }) => {
  test.setTimeout(180_000);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const outputDirectory = `docs/tremplin/screenshots/${viewport.name}`;
    await mkdir(outputDirectory, { recursive: true });

    for (const screen of SCREENS) {
      await page.goto(screen.path);
      await expect(page.locator(screen.ready)).toBeVisible({ timeout: 20_000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.screenshot({
        path: `${outputDirectory}/${screen.slug}.png`,
        fullPage: false,
        animations: "disabled",
      });
    }
  }
});
