import { expect, test } from "@playwright/test";

async function seedFollowedArtists(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "meewav:tremplin:demo:followed-artists",
      JSON.stringify(["lunae", "mina-roze", "neo-sillage"]),
    );
  });
}

test.describe("navigation artiste du Tremplin", () => {
  test.setTimeout(30_000);

  test("Découvrir restaure recherche et scroll après un profil", async ({ page }) => {
    await page.goto("/tremplin/decouvrir");
    const search = page.getByRole("searchbox", { name: "Rechercher un artiste, un projet, un style ou un symbole de jeton" });
    await expect(search).toBeVisible({ timeout: 20_000 });
    await search.fill("Jo Varenne");
    const scroll = page.locator(".tremplin-scroll");
    const originalScrollTop = await scroll.evaluate((element) => { element.scrollTop = 420; return element.scrollTop; });
    expect(originalScrollTop).toBeGreaterThan(50);

    await page.getByRole("button", { name: "Jo Varenne", exact: true }).click();
    await expect(page).toHaveURL(/\/tremplin\/artistes\//);
    await expect(page.getByRole("button", { name: "Retour à Découvrir" })).toBeVisible();
    await page.getByRole("button", { name: "Retour à Découvrir" }).click();

    await expect(page).toHaveURL(/\/tremplin\/decouvrir$/);
    await expect(search).toHaveValue("Jo Varenne");
    await expect.poll(async () => Math.abs(await scroll.evaluate((element) => element.scrollTop) - originalScrollTop)).toBeLessThan(48);
  });

  test("Mes artistes conserve ses filtres et l’état lu", async ({ page }) => {
    await seedFollowedArtists(page);
    await page.goto("/tremplin/mes-artistes");
    const artistFilter = page.locator(".tremplin-my-artists__now select").first();
    await expect(artistFilter).toBeVisible({ timeout: 20_000 });
    await artistFilter.selectOption("lunae");
    const firstActivity = page.locator(".tremplin-my-artists__activity article").first();
    await firstActivity.getByRole("button", { name: "Voir cette étape" }).click();
    await expect(page).toHaveURL(/\/tremplin\/artistes\/lunae#/);

    await page.getByRole("button", { name: "Retour à Mes artistes" }).click();
    await expect(page).toHaveURL(/\/tremplin\/mes-artistes$/);
    await expect(artistFilter).toHaveValue("lunae");
    await expect(page.locator(".tremplin-my-artists__activity article.is-read")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Mes artistes", exact: true })).toHaveAttribute("aria-current", "page");
  });

  test("achat et Room reviennent au profil d’origine", async ({ page }) => {
    await page.goto("/tremplin/artistes/lunae");
    const profile = page.locator(".tremplin-token-artist");
    await expect(profile).toBeVisible({ timeout: 20_000 });

    await profile.getByRole("link", { name: "Jeton de talent", exact: true }).click();
    await expect(profile.locator("#profile-support")).toHaveAttribute("open", "");
    await profile.getByRole("button", { name: "Acheter des jetons" }).last().click();
    await expect(page).toHaveURL(/\/tremplin\/soutien-mw\/lunae\/achat$/);
    await expect(page.getByRole("button", { name: "Retour au profil artiste" })).toBeVisible();
    await page.getByRole("button", { name: "Retour au profil artiste" }).click();
    await expect(page).toHaveURL(/\/tremplin\/artistes\/lunae#profile-support$/);

    await page.getByRole("button", { name: "Voir sa prochaine Room" }).click();
    await expect(page).toHaveURL(/\/rooms$/);
    await expect(page.locator(".rooms-page")).toHaveAttribute("data-room-destination", "scene");
    await expect(page.locator(".rooms-tremplin-return")).toContainText("Écoute privée · EP Minuit clair");
    await page.getByRole("button", { name: "Retour au profil artiste" }).click();
    await expect(page).toHaveURL(/\/tremplin\/artistes\/lunae#profile-support$/);
  });

  test("une Room conserve l’origine complète du profil", async ({ page }) => {
    await seedFollowedArtists(page);
    await page.goto("/tremplin/mes-artistes");
    const artistFilter = page.locator(".tremplin-my-artists__now select").first();
    await expect(artistFilter).toBeVisible({ timeout: 20_000 });
    await artistFilter.selectOption("lunae");
    await page.locator(".tremplin-my-artists__activity article").first().getByRole("button", { name: "Voir cette étape" }).click();
    await expect(page).toHaveURL(/\/tremplin\/artistes\/lunae#/);

    await page.getByRole("button", { name: "Voir sa prochaine Room" }).click();
    await expect(page.locator(".rooms-tremplin-return")).toContainText("Lunaé");
    await page.getByRole("button", { name: "Retour au profil artiste" }).click();
    await expect(page).toHaveURL(/\/tremplin\/artistes\/lunae#/);
    await page.getByRole("button", { name: "Retour à Mes artistes" }).click();

    await expect(page).toHaveURL(/\/tremplin\/mes-artistes$/);
    await expect(artistFilter).toHaveValue("lunae");
    await expect(page.locator(".tremplin-my-artists__activity article.is-read")).toHaveCount(1);
  });

  test("un profil inconnu affiche une issue explicite", async ({ page }) => {
    await page.goto("/tremplin/artistes/profil-inconnu");

    await expect(page.getByRole("heading", { name: "Cet artiste n’est pas disponible." })).toBeVisible();
    await page.getByRole("button", { name: "Retour à Découvrir" }).click();
    await expect(page).toHaveURL(/\/tremplin\/decouvrir$/);
  });
});
