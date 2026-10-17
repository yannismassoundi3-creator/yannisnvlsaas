import { expect, type Page, test } from "@playwright/test";
import { expectAccessible, signUp, uniqueEmail } from "./helpers";

/**
 * Reseller mode, in French (the first testers resell on Vinted and Leboncoin):
 * onboarding picks the mode from the platform, items are added in a batch, a
 * sale is recorded with a comma decimal, and the home page and the items page
 * show the result. Also checked at a 390 px phone width.
 */

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe.serial("Reseller mode", () => {
  test("a reseller adds items and records a sale in a few seconds", async ({ page }) => {
    await signUp(page, uniqueEmail("e2e-reseller"));
    await page.goto("/onboarding?hl=fr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");

    // Step 1: choosing Vinted suggests the reseller mode.
    await page.getByLabel("Nom de la boutique").fill("Mes trouvailles");
    await expect(page.getByRole("radio", { name: /J'ai une boutique en ligne/ })).toBeChecked();
    await page.getByLabel("Où vendez-vous ?").selectOption("vinted");
    await expect(page.getByRole("radio", { name: /Je revends des articles/ })).toBeChecked();
    await page.getByRole("button", { name: "Continuer" }).click();
    // Most resellers are private sellers: "no VAT" is preselected.
    await expect(page.getByRole("radio", { name: /Je ne facture pas de TVA/ })).toBeChecked();
    await page.getByRole("button", { name: "Créer mon espace de travail" }).click();
    await expect(page.getByRole("heading", { name: "Ajoutez votre premier article" })).toBeVisible();
    await page.getByRole("button", { name: /Ajouter un article que j'ai acheté/ }).click();
    await page.waitForURL(/\/app\?add=1$/);

    // Add two items in a row.
    const add = page.getByRole("dialog", { name: "Ajouter un article" });
    await expect(add).toBeVisible();
    await expect(add.getByLabel("Nom de l'article")).toBeFocused();
    await expect(add.getByLabel("Prix d'achat")).toHaveAttribute("inputmode", "decimal");
    await expectAccessible(page);
    await add.getByLabel("Nom de l'article").fill("Veste en jean Levi's");
    await add.getByLabel("Prix d'achat").fill("6,50");
    await add.getByRole("button", { name: "Ajouter et en saisir un autre" }).click();
    await expect(page.getByText("« Veste en jean Levi's » ajouté à votre stock")).toBeVisible();
    await expect(add.getByLabel("Nom de l'article")).toHaveValue("");
    await expect(add.getByLabel("Nom de l'article")).toBeFocused();
    await add.getByLabel("Nom de l'article").fill("Robe fleurie");
    await add.getByLabel("Prix d'achat").fill("12");
    await add.getByLabel("Prix d'achat").press("Enter");
    await expect(add).toBeHidden();
    await expect(page.getByText("« Robe fleurie » ajouté à votre stock")).toBeVisible();

    // Sell one with « Vendu ! » and a French decimal comma.
    await page.getByRole("button", { name: "Vendu !", exact: true }).click();
    const sell = page.getByRole("dialog", { name: "Vendu !" });
    await expect(sell).toBeVisible();
    const search = sell.getByRole("searchbox", { name: "Rechercher dans mon stock" });
    await expect(search).toBeFocused();
    await expectAccessible(page);
    await search.fill("veste");
    await sell.getByRole("button", { name: /Veste en jean Levi's/ }).click();
    const price = sell.getByLabel("Prix de vente");
    await expect(price).toBeFocused();
    await expect(sell.getByLabel("Plateforme", { exact: true })).toHaveValue("vinted");
    await price.fill("18,50");
    await price.press("Enter");
    await expect(page.getByText("Vente enregistrée")).toBeVisible();
    await expect(sell).toBeHidden();

    // Home: the sale, what is left (18.50 − 6.50) and one item in stock.
    const figures = page.getByRole("region", { name: "Chiffres clés" });
    await expect(figures).toContainText("Ce qui vous reste");
    await expect(figures).toContainText(/12,00\s€/);
    await expect(figures).toContainText(/18,50\s€/);
    await expect(figures.getByText("Articles vendus")).toBeVisible();
    const stock = page.getByRole("region", { name: "Votre stock" });
    await expect(stock).toContainText(/1\s*article en stock/);
    await expect(stock).toContainText(/12,00\s€/);
    const platforms = page.getByRole("region", { name: "Par plateforme" });
    await expect(platforms).toContainText("Vinted");
    await expectAccessible(page);

    // Reseller navigation: no advertising section.
    const nav = page.getByRole("navigation", { name: "Application" });
    await expect(nav.getByRole("link", { name: "Accueil" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Publicité" })).toHaveCount(0);

    // My items: the jacket is sold, the dress still in stock.
    await nav.getByRole("link", { name: "Mes articles" }).click();
    await page.waitForURL(/\/app\/items/);
    await expect(page.getByText("Robe fleurie", { exact: true })).toBeVisible();
    // Visible only: the previous page may stay mounted but hidden.
    await expect(page.getByText("Veste en jean Levi's", { exact: true }).filter({ visible: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Vendus" }).click();
    await page.waitForURL(/tab=sold/);
    const sold = page.getByRole("main").getByRole("listitem").filter({ hasText: "Veste en jean Levi's", visible: true });
    await expect(sold).toContainText("Vendu");
    await expect(sold).toContainText(/sur Vinted/);
    await expect(sold).toContainText(/18,50\s€/);
    await expect(sold).toContainText(/12,00\s€/);
    await expectAccessible(page);

    // Phone width: no horizontal scrolling on the home page, the items page or in the sale dialog.
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await page.goto("/app");
    await expect(page.getByRole("button", { name: "Vendu !", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectAccessible(page);
    await page.getByRole("button", { name: "Vendu !", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Vendu !" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Ajouter un article" }).click();
    await expect(page.getByRole("dialog", { name: "Ajouter un article" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 720 });

    // Undoing a sale (with confirmation) puts the item back in stock.
    await page.goto("/app/items?tab=sold");
    await page.getByRole("button", { name: "Annuler la vente : Veste en jean Levi's" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Annuler la vente" }).click();
    await expect(page.getByText("Vente annulée : l'article est de nouveau en stock")).toBeVisible();
    await page.goto("/app/items?tab=in_stock");
    await expect(page.getByRole("main").getByText("Veste en jean Levi's", { exact: true })).toBeVisible();

    // The owner can switch the store's mode in the settings.
    await page.goto("/app/settings");
    await expect(page.getByRole("heading", { name: "Comment vendez-vous ?" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Je revends des articles/ })).toBeChecked();
    await expectAccessible(page);
  });
});
