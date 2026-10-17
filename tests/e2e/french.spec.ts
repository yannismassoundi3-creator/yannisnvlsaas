import { expect, test } from "@playwright/test";
import { expectAccessible, onboard, signUp, uniqueEmail } from "./helpers";

/** The French version: public pages under /fr, the app in the language chosen by the user. */
test.describe("French version", () => {
  test("public pages are served in French under /fr and are accessible", async ({ page }) => {
    await page.goto("/fr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Maîtrisez vos marges");
    await expect(page.getByRole("link", { name: "Commencer l'essai gratuit" }).first()).toBeVisible();
    await expectAccessible(page);

    for (const path of ["/fr/pricing", "/fr/glossary", "/fr/privacy", "/fr/tools/profit-margin-calculator"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await expectAccessible(page);
    }
  });

  test("the browser language and the language switch choose the version", async ({ browser }) => {
    const context = await browser.newContext({ locale: "fr-FR", extraHTTPHeaders: { "Accept-Language": "fr-FR,fr;q=0.9" } });
    const page = await context.newPage();
    await page.goto("/pricing");
    await expect(page).toHaveURL(/\/fr\/pricing$/);
    await page.goto("/pricing?hl=en");
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // The choice is remembered: the English page no longer redirects.
    await page.goto("/pricing");
    await expect(page).toHaveURL(/\/pricing$/);
    await context.close();
  });

  test("the application follows the chosen language", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signUp(page, uniqueEmail("e2e-fr"));
    await onboard(page, { storeName: "Boutique E2E", pricesIncludeTax: true, sample: true });
    await page.goto("/app?hl=fr");
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { name: "Vue d'ensemble" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Produits" }).first()).toBeVisible();
    await expect(page.getByText("Chiffre d'affaires net").first()).toBeVisible();
    await expectAccessible(page);
    await page.goto("/app/products");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expectAccessible(page);
    await context.close();
  });
});
