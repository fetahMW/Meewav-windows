import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.MEEWAV_CAPTURE_URL ?? "http://127.0.0.1:5173";
const label = process.argv[2] ?? "current";
const outputDirectory = path.resolve("artifacts", "scene-design", label);

const routes = [
  { id: "home", path: "/scene" },
  { id: "following", path: "/scene/suivis" },
  { id: "tv", path: "/scene/tv" },
  { id: "explore", path: "/scene/explorer" },
  { id: "studio", path: "/scene/studio" },
];

const viewports = [
  { id: "320", width: 320, height: 720 },
  { id: "375", width: 375, height: 812 },
  { id: "430", width: 430, height: 932 },
  { id: "768", width: 768, height: 1024 },
  { id: "1024", width: 1024, height: 900 },
  { id: "1280", width: 1280, height: 960 },
  { id: "1440", width: 1440, height: 1200 },
  { id: "1920", width: 1920, height: 1080 },
];

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      colorScheme: "dark",
      reducedMotion: "reduce",
      viewport: { width: viewport.width, height: viewport.height },
    });
    await context.addInitScript(() => {
      window.sessionStorage.setItem("meewav:local-auth-preview", "enabled");
    });

    for (const route of routes) {
      const page = await context.newPage();
      await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded" });
      await page.locator(".scene-page").waitFor({ state: "visible", timeout: 30_000 });
      await page.evaluate(async () => document.fonts.ready);
      await page.waitForTimeout(1_200);

      const overflow = await page.evaluate(() => ({
        body: document.body.scrollWidth,
        document: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }));
      const widestSurface = Math.max(overflow.body, overflow.document);
      if (widestSurface > overflow.viewport + 1) {
        throw new Error(
          `${route.id} (${viewport.id}px) déborde horizontalement : ${widestSurface}px pour ${overflow.viewport}px`,
        );
      }

      if (route.id === "home" && viewport.width >= 1_200) {
        const homeMetrics = await page.evaluate(() => {
          const search = document.querySelector(".scene-search-filter");
          const input = document.querySelector(".scene-search-filter input");
          const firstRecommendation = document.querySelector("#scene-for-you article");
          if (!(search instanceof HTMLElement) || !(input instanceof HTMLInputElement)) return null;
          const inputStyle = getComputedStyle(input);
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (context) context.font = inputStyle.font;
          return {
            firstRecommendationTop: firstRecommendation?.getBoundingClientRect().top ?? null,
            placeholderAvailable: input.clientWidth
              - Number.parseFloat(inputStyle.paddingLeft)
              - Number.parseFloat(inputStyle.paddingRight),
            placeholderWidth: context?.measureText(input.placeholder).width ?? 0,
            searchWidth: search.getBoundingClientRect().width,
          };
        });

        if (!homeMetrics) throw new Error("Impossible de mesurer le hero La Scène");
        if (homeMetrics.searchWidth < 515 || homeMetrics.searchWidth > 530) {
          throw new Error(`Recherche desktop hors cible : ${homeMetrics.searchWidth}px`);
        }
        if (homeMetrics.placeholderWidth > homeMetrics.placeholderAvailable) {
          throw new Error(`Le placeholder de recherche est encore tronqué : ${homeMetrics.placeholderWidth}px pour ${homeMetrics.placeholderAvailable}px`);
        }
        if (
          homeMetrics.firstRecommendationTop === null
          || homeMetrics.firstRecommendationTop >= viewport.height
        ) {
          throw new Error("Les miniatures Pour toi ne sont pas visibles dans le premier viewport");
        }
      }

      await page.screenshot({
        path: path.join(outputDirectory, `${route.id}-${viewport.id}.png`),
        animations: "disabled",
      });
      await page.close();
    }

    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`Captures La Scène enregistrées dans ${outputDirectory} · aucun débordement global`);
