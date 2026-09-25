import { expect, test, type Page } from "@playwright/test";

const BASELINE_HEIGHT_1440 = 6491.375;
const VIEWPORTS = [
  { width: 320, height: 812 },
  { width: 375, height: 812 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
  { width: 1280, height: 960 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 },
] as const;

const SECTION_SELECTORS = {
  entry: "#tremplin-entry",
  spotlight: "#a-la-une",
  journey: "#comment-ca-marche",
  grades: "#niveaux",
  final: "#protections",
} as const;

test.describe.configure({ mode: "serial" });

async function openHome(page: Page) {
  await page.goto("/tremplin");
  await expect(page.locator(".tremplin-gateway")).toBeVisible({ timeout: 15_000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".tremplin-gateway__feature-media img")).toHaveJSProperty("complete", true);
}

for (const viewport of VIEWPORTS) {
  test(`accueil passerelle sans débordement à ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openHome(page);

    const layout = await page.evaluate(({ selectors, baseline }) => {
      const home = document.querySelector<HTMLElement>(".tremplin-gateway");
      const actionButtons = [...document.querySelectorAll<HTMLElement>(".tremplin-gateway button")]
        .filter((button) => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });

      return {
        baseline,
        pageHeight: home?.getBoundingClientRect().height ?? 0,
        globalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        sections: Object.fromEntries(Object.entries(selectors).map(([name, selector]) => [
          name,
          document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().height ?? 0,
        ])),
        invalidButtons: actionButtons
          .filter((button) => {
            if (button.closest(".tremplin-public-home__level-track")) return false;
            const style = getComputedStyle(button);
            return button.scrollWidth > button.clientWidth + 1
              || style.textOverflow === "ellipsis"
              || (button.textContent?.includes("…") ?? false);
          })
          .map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim() ?? button.className),
        undersizedButtons: actionButtons
          .filter((button) => {
            if (button.closest(".tremplin-public-home__level-track")) return false;
            const rect = button.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          })
          .map((button) => ({
            name: button.getAttribute("aria-label") ?? button.textContent?.trim(),
            width: button.getBoundingClientRect().width,
            height: button.getBoundingClientRect().height,
          })),
        viewportMinHeightSections: [...document.querySelectorAll<HTMLElement>(".tremplin-gateway section")]
          .filter((section) => {
            const minHeight = getComputedStyle(section).minHeight;
            return minHeight.includes("vh") || Number.parseFloat(minHeight) >= window.innerHeight;
          })
          .map((section) => section.id || section.className),
      };
    }, { selectors: SECTION_SELECTORS, baseline: BASELINE_HEIGHT_1440 });

    expect(layout.globalOverflow).toBeLessThanOrEqual(1);
    expect(layout.invalidButtons).toEqual([]);
    expect(layout.undersizedButtons).toEqual([]);
    expect(layout.viewportMinHeightSections).toEqual([]);
    await expect(page.getByRole("group", { name: "Explorer les six niveaux MeeWav" }).getByRole("button")).toHaveCount(6);
    await expect(page.getByRole("search").getByRole("combobox")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Consulte son parcours");
    await expect(page.getByRole("button", { name: /^Acheter/ })).toHaveCount(0);
    await expect(page.getByText("Écouter l’extrait", { exact: true })).toHaveCount(1);

    const mainNavigation = page.getByRole("navigation", { name: "Navigation du Tremplin" });
    for (const name of ["Accueil", "Découvrir", "Comment ça marche", "Mes artistes"]) {
      await expect(mainNavigation.getByRole("button", { name, exact: true })).toHaveAccessibleName(name);
    }

    if (viewport.width >= 1024) {
      await expect(page.locator(".tremplin-gateway__feature")).toBeVisible();
      await expect(page.getByRole("button", { name: /Voir le jeton de talent/ }).first()).toBeVisible();
    }

    if (viewport.width === 1440) {
      expect(layout.pageHeight).toBeLessThanOrEqual(5200);
      expect(layout.pageHeight).toBeLessThanOrEqual(BASELINE_HEIGHT_1440 * 0.8);
      expect(layout.sections.entry).toBeLessThanOrEqual(900);
      expect(layout.sections.journey).toBeLessThanOrEqual(460);
      expect(layout.sections.grades).toBeLessThanOrEqual(680);
    }
  });
}

test("le premier écran mène vers un artiste ciblé, pas vers un catalogue d’écoute", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openHome(page);

  await expect(page.getByRole("combobox", { name: "Nom de l’artiste ou symbole de son jeton de talent" })).toBeInViewport();
  await expect(page.locator(".tremplin-gateway__feature-actions button").first()).toBeInViewport();
  await expect(page.getByText(/Tu l’as découvert dans les Shorts, une Room, le Globe ou son profil/)).toBeInViewport();
  await expect(page.locator(".tremplin-gateway__feature").getByRole("button", { name: /Écouter un bref aperçu/ })).toBeVisible();
  await expect(page.locator(".tremplin-gateway__preview")).toHaveCount(1);
});

test("la recherche par jeton met à jour l’aperçu avant la consultation volontaire du jeton de talent", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await openHome(page);

  const search = page.getByRole("combobox", { name: "Nom de l’artiste ou symbole de son jeton de talent" });
  await search.fill("LUNAE");
  await search.press("ArrowDown");
  await search.press("Enter");

  await expect(page).toHaveURL(/\/tremplin\/?$/);
  const resolver = page.locator(".tremplin-gateway__feature");
  await expect(resolver.getByRole("heading", { name: "Lunaé" })).toBeVisible();
  await resolver.getByRole("button", { name: /Voir le jeton de talent/ }).click();
  await expect(page).toHaveURL(/\/tremplin\/artistes\/lunae#profile-support/);
  await expect(page.locator("#profile-support")).toBeVisible();
});

test("une recherche libre continue vers le catalogue du Tremplin", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await openHome(page);

  const search = page.getByRole("combobox", { name: "Nom de l’artiste ou symbole de son jeton de talent" });
  await search.fill("Grenoble");
  await search.press("Enter");

  await expect(page).toHaveURL(/\/tremplin\/decouvrir/);
  await expect(page.locator("#tremplin-home-search")).toHaveValue("Grenoble");
});

test("les liens de découverte renvoient vers les vraies surfaces MeeWav", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openHome(page);

  const discovery = page.getByLabel("Découvrir les artistes sur MeeWav");
  await discovery.getByRole("button", { name: /La Scène/ }).click();
  await expect(page).toHaveURL(/\/scene/);
});

test("la recherche et les grades restent utilisables au clavier", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await openHome(page);

  const search = page.getByRole("combobox", { name: "Nom de l’artiste ou symbole de son jeton de talent" });
  await search.fill("MINA");
  await search.press("ArrowDown");
  const activeId = await search.getAttribute("aria-activedescendant");
  expect(activeId).toBeTruthy();
  await expect(page.locator(`#${activeId}`)).toHaveAttribute("aria-selected", "true");
  await search.press("Escape");
  await expect(search).toHaveAttribute("aria-expanded", "false");

  const firstGrade = page.getByRole("group", { name: "Explorer les six niveaux MeeWav" }).getByRole("button").first();
  await firstGrade.scrollIntoViewIfNeeded();
  await firstGrade.focus();
  const focus = await firstGrade.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  expect(focus.style).not.toBe("none");
  expect(focus.width).toBeGreaterThanOrEqual(2);
});

test("captures de livraison desktop et mobile de l’accueil", async ({ page }) => {
  test.setTimeout(60_000);
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 375, height: 812 },
  ] as const) {
    await page.setViewportSize(viewport);
    await openHome(page);
    await page.screenshot({
      path: `docs/tremplin/screenshots/${viewport.name}/accueil.png`,
      fullPage: false,
      animations: "disabled",
    });
    for (const [slug, selector] of Object.entries({
      "accueil-projets": SECTION_SELECTORS.spotlight,
      "accueil-fonctionnement": SECTION_SELECTORS.journey,
      "accueil-grades": SECTION_SELECTORS.grades,
      "accueil-conclusion": SECTION_SELECTORS.final,
    })) {
      const section = page.locator(selector);
      await section.scrollIntoViewIfNeeded();
      await section.screenshot({
        path: `docs/tremplin/screenshots/${viewport.name}/${slug}.png`,
        animations: "disabled",
      });
    }
  }

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 900 },
    { width: 1024, height: 900 },
    { width: 1440, height: 1000 },
    { width: 1920, height: 1080 },
  ] as const) {
    await page.setViewportSize(viewport);
    await openHome(page);
    await page.screenshot({
      path: `docs/tremplin/screenshots/home-2026/accueil-${viewport.width}.png`,
      fullPage: false,
      animations: "disabled",
    });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await openHome(page);
  const grades = page.locator(SECTION_SELECTORS.grades);
  await grades.scrollIntoViewIfNeeded();
  await grades.screenshot({
    path: "docs/tremplin/screenshots/home-2026/grades-regression-1440.png",
    animations: "disabled",
  });
});
