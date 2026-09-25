import { expect, test, type Locator, type Page } from "@playwright/test";

const FIXED_NOW = new Date("2026-08-04T10:00:00.000Z");

const currencyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function compactText(value: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

async function currentStep(flow: Locator, label: string) {
  await expect(flow.locator('[aria-current="step"] .tremplin-token-flow__step-label')).toHaveText(label);
}

async function expectNoEstimateBeforeInput(flow: Locator) {
  await expect(flow.locator(".tremplin-token-flow__quote.is-empty")).toBeVisible();
  await expect(flow.locator(".tremplin-token-flow__quote:not(.is-empty)")).toHaveCount(0);
  await expect(flow.locator(".tremplin-token-flow__artist-share")).toHaveCount(0);
  await expect(flow.getByText("Frais totaux estimés", { exact: true })).toHaveCount(0);
  await expect(flow.getByText("Estimation valable jusqu’à", { exact: false })).toHaveCount(0);
  await expect(flow.getByRole("button", { name: "Voir le récapitulatif" })).toBeDisabled();
}

async function openFlow(page: Page, operation: "achat" | "revente") {
  await page.clock.install({ time: FIXED_NOW });
  await page.goto(`/tremplin/soutien-mw/lunae/${operation}`);
  const flow = page.locator(".tremplin-token-flow");
  await expect(flow).toBeVisible({ timeout: 20_000 });
  await expect(flow.getByText("Mode démonstration — aucune transaction réelle n’est effectuée.")).toBeVisible();
  await currentStep(flow, "Montant");
  return flow;
}

test.describe("simulations MW de bout en bout", () => {
  test.setTimeout(120_000);

  test("parcourt les quatre étapes d’un achat avec sa répartition et son CTA exact", async ({ page }) => {
    const flow = await openFlow(page, "achat");

    await expectNoEstimateBeforeInput(flow);
    await flow.getByRole("textbox", { name: "Montant libre en euros" }).fill("25");

    const firstQuote = flow.locator(".tremplin-token-flow__quote:not(.is-empty)");
    await expect(firstQuote).toBeVisible();
    await expect(flow.locator(".tremplin-token-flow__artist-share")).toContainText(currencyFormatter.format(5));
    await expect(firstQuote.locator(".tremplin-token-flow__row").filter({ hasText: "Frais totaux estimés" })).toContainText(currencyFormatter.format(0.73));
    const estimatedQuantity = compactText(await firstQuote.locator(".tremplin-token-flow__quote-hero strong").textContent());
    expect(estimatedQuantity).toMatch(/^\d+(?:,\d{1,2})? LUNAE$/);

    await flow.getByRole("button", { name: "Voir le récapitulatif" }).click();
    await currentStep(flow, "Récapitulatif");
    await expect(flow.getByRole("heading", { name: "Vérifie les informations essentielles." })).toBeVisible();
    await expect(flow.locator(".tremplin-token-flow__risk-panel").getByText("Part reçue directement par Lunaé", { exact: true }).locator(".."))
      .toContainText(currencyFormatter.format(5));
    await expect(flow.locator(".tremplin-token-flow__risk-panel").getByText("Frais totaux", { exact: true }).locator(".."))
      .toContainText(currencyFormatter.format(0.73));
    await expect(flow.locator(".tremplin-token-flow__risk-panel").getByText("Condition de revente", { exact: true }).locator(".."))
      .toContainText("À partir du 7 août 2026");

    await flow.getByRole("button", { name: "Voir les règles et risques" }).click();
    await currentStep(flow, "Règles et risques");
    await expect(flow.getByText("Risque de perte", { exact: true })).toBeVisible();
    await expect(flow.getByText("Revente encadrée", { exact: true })).toBeVisible();

    const exactPurchaseCta = `Simuler l’achat de ${estimatedQuantity} pour ${currencyFormatter.format(25)}`;
    const purchaseCta = flow.getByRole("button", { name: exactPurchaseCta });
    await expect(purchaseCta).toHaveAttribute("aria-label", exactPurchaseCta);
    await expect(purchaseCta).toBeDisabled();
    await flow.getByRole("checkbox").check();
    await expect(purchaseCta).toBeEnabled();
    await purchaseCta.click();

    await currentStep(flow, "Confirmation");
    await expect(flow.getByRole("heading", { name: "La simulation d’achat pour Lunaé est terminée." })).toBeVisible();
    await expect(flow.getByText("Aucune transaction réelle n’a été effectuée.", { exact: false })).toBeVisible();
    await expect(flow.locator(".tremplin-token-flow__confirmation-summary")).toContainText(currencyFormatter.format(25));
    await expect(flow.locator(".tremplin-token-flow__confirmation-summary")).toContainText(estimatedQuantity);
    await expect(flow.getByText(/^MW-T-LUNA-/)).toBeVisible();
  });

  test("parcourt les quatre étapes d’une revente sans présélection et confirme le montant net", async ({ page }) => {
    const flow = await openFlow(page, "revente");

    await expect(flow.getByText("Aucune quantité ni estimation n’est présélectionnée.", { exact: true })).toBeVisible();
    await expectNoEstimateBeforeInput(flow);
    await expect(flow.getByText("Après cette revente", { exact: true })).toHaveCount(0);

    await flow.getByRole("tab", { name: "Pourcentage" }).click();
    await expect(flow.getByText("0 % · 0 LUNAE", { exact: true })).toBeVisible();
    await expectNoEstimateBeforeInput(flow);
    await flow.getByRole("button", { name: "25 %" }).click();

    const firstQuote = flow.locator(".tremplin-token-flow__quote:not(.is-empty)");
    await expect(firstQuote).toBeVisible();
    const resoldQuantity = compactText(await firstQuote.locator(".tremplin-token-flow__quote-hero small").textContent())
      .replace(/^Pour /, "")
      .replace(/ revendus$/, "");
    expect(resoldQuantity).toBe("13,1 LUNAE");
    const netAmount = compactText(await firstQuote.locator(".tremplin-token-flow__quote-hero strong").textContent());
    expect(netAmount).toMatch(/^\d+,\d{2} €$/);
    const firstFeeRow = firstQuote.locator(".tremplin-token-flow__row").filter({ hasText: "Frais totaux estimés" });
    const feeAmount = compactText(await firstFeeRow.locator("strong").textContent());
    expect(feeAmount).not.toBe(currencyFormatter.format(0));
    await expect(flow.locator(".tremplin-token-flow__artist-share")).toContainText("Jetons acquis le 21 juin 2026");
    await expect(flow.getByText("Part reçue directement par l’artiste", { exact: true })).toHaveCount(0);

    await flow.getByRole("button", { name: "Voir le récapitulatif" }).click();
    await currentStep(flow, "Récapitulatif");
    await expect(flow.getByRole("heading", { name: "Vérifie les informations essentielles." })).toBeVisible();
    await expect(flow.locator(".tremplin-token-flow__risk-panel").getByText("Frais totaux", { exact: true }).locator(".."))
      .toContainText(feeAmount);
    await expect(flow.locator(".tremplin-token-flow__risk-panel").getByText("Condition de revente", { exact: true }).locator(".."))
      .toContainText("Délai confirmé avant exécution");

    await flow.getByRole("button", { name: "Voir les règles et risques" }).click();
    await currentStep(flow, "Règles et risques");
    await expect(flow.getByText("Valeur variable", { exact: true })).toBeVisible();
    await expect(flow.getByText("Revente encadrée", { exact: true })).toBeVisible();

    const exactResaleCta = `Simuler la revente de ${resoldQuantity}`;
    const resaleCta = flow.getByRole("button", { name: exactResaleCta });
    await expect(resaleCta).toHaveAttribute("aria-label", exactResaleCta);
    await expect(resaleCta).toBeDisabled();
    await flow.getByRole("checkbox").check();
    await expect(resaleCta).toBeEnabled();
    await resaleCta.click();

    await currentStep(flow, "Confirmation");
    await expect(flow.getByRole("heading", { name: "Ta simulation de revente est terminée." })).toBeVisible();
    await expect(flow.getByText("Aucune transaction réelle n’a été effectuée.", { exact: false })).toBeVisible();
    await expect(flow.locator(".tremplin-token-flow__confirmation-summary")).toContainText(netAmount);
    await expect(flow.locator(".tremplin-token-flow__confirmation-summary")).toContainText(resoldQuantity);
    await expect(flow.getByText(/^MW-T-LUNA-/)).toBeVisible();
  });
});
