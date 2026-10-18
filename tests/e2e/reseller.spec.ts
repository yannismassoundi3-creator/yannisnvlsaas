import { expect, type Page, test } from "@playwright/test";
import { expectAccessible, localEnv, signUp, uniqueEmail } from "./helpers";

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

    // Sales received by email: the seller's forwarded sale email becomes a pending entry, confirmed in one tap.
    const secret = localEnv("INBOUND_WEBHOOK_SECRET");
    test.skip(!secret || !localEnv("INBOUND_EMAIL_ADDRESS_TEMPLATE"), "Set INBOUND_WEBHOOK_SECRET and INBOUND_EMAIL_ADDRESS_TEMPLATE in .env.local to test sales received by email.");
    await expect(page.getByRole("heading", { name: "Recevoir mes ventes automatiquement" })).toBeVisible();
    const address = (await page.getByTestId("inbound-address").textContent()) ?? "";
    const token = /\+([a-z0-9]+)@/.exec(address)?.[1] ?? "";
    expect(token).toMatch(/^[a-f0-9]{32}$/);
    const post = (data: object, password = secret!) =>
      page.request.post("/api/inbound/email", { headers: { authorization: `Basic ${Buffer.from(`narixia:${password}`).toString("base64")}` }, data });
    expect((await post({ MailboxHash: token, Subject: "x" }, "wrong-secret")).status()).toBe(401);
    const sale = await post({
      From: "vendeuse@gmail.com",
      FromFull: { Email: "vendeuse@gmail.com", Name: "Vendeuse", MailboxHash: "" },
      To: address,
      OriginalRecipient: address,
      MailboxHash: token,
      Subject: "Fwd: Votre article « Robe fleurie » a été vendu !",
      TextBody: "---------- Forwarded message ---------\nFrom: Vinted <no-reply@vinted.fr>\nSubject: Votre article « Robe fleurie » a été vendu !\n\nBonne nouvelle !\nPrix : 25,00 €\nFrais de port : 2,99 €",
      HtmlBody: "",
      Date: "Sat, 17 Oct 2026 10:00:00 +0200",
      MessageID: `e2e-${token}-sale`,
    });
    expect(sale.status()).toBe(200);
    const gmail = await post({
      From: "forwarding-noreply@google.com",
      FromFull: { Email: "forwarding-noreply@google.com" },
      To: address,
      MailboxHash: token,
      Subject: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from vendeuse@gmail.com",
      TextBody: "Confirmation code: 123456789\nhttps://mail-settings.google.com/mail/vf-e2e",
      MessageID: `e2e-${token}-gmail`,
    });
    expect(gmail.status()).toBe(200);

    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Ventes reçues par e-mail (2 à valider)" })).toBeVisible();
    await page.getByRole("link", { name: "Vérifier les ventes" }).click();
    await page.waitForURL(/\/app\/inbox$/);
    await expect(page.getByText("Code de confirmation :")).toBeVisible();
    await expect(page.getByText("123456789", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ouvrir le lien de confirmation Gmail" })).toHaveAttribute("href", "https://mail-settings.google.com/mail/vf-e2e");
    await expect(page.getByText("Correspond à « Robe fleurie » dans votre stock")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Valider : Robe fleurie" }).click();
    const confirm = page.getByRole("dialog", { name: "Vendu !" });
    await expect(confirm.getByText("Prérempli depuis un e-mail de vente : vérifiez avant d'enregistrer.")).toBeVisible();
    await expect(confirm.getByText("Robe fleurie", { exact: true })).toBeVisible();
    await expect(confirm.getByLabel("Prix de vente")).toHaveValue("25,00");
    await expect(confirm.getByLabel("Plateforme", { exact: true })).toHaveValue("vinted");
    await expectAccessible(page);
    await confirm.getByRole("button", { name: "Enregistrer la vente" }).click();
    await expect(page.getByText("Vente enregistrée")).toBeVisible();
    await expect(page.getByRole("button", { name: "Valider : Robe fleurie" })).toHaveCount(0);
    await page.getByRole("button", { name: "C'est fait" }).click();
    await expect(page.getByText("E-mail ignoré")).toBeVisible();
    await expect(page.getByText("Aucun e-mail à vérifier.")).toBeVisible();
    await page.goto("/app/items?tab=sold");
    const confirmed = page.getByRole("main").getByRole("listitem").filter({ hasText: "Robe fleurie", visible: true });
    await expect(confirmed).toContainText(/25,00\s€/);
    await expect(confirmed).toContainText(/13,00\s€/);
  });

  test("a reseller records a lot of identical pieces and sells part of it", async ({ page }) => {
    await signUp(page, uniqueEmail("e2e-reseller-lot"));
    await page.goto("/onboarding?hl=fr");
    await page.getByLabel("Nom de la boutique").fill("Mes lots");
    await page.getByLabel("Où vendez-vous ?").selectOption("vinted");
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.getByRole("button", { name: "Créer mon espace de travail" }).click();
    await page.getByRole("button", { name: /Ajouter un article que j'ai acheté/ }).click();
    await page.waitForURL(/\/app\?add=1$/);

    // 3 polos bought as a lot for 24,00 €: 8,00 € each, shown before saving.
    const add = page.getByRole("dialog", { name: "Ajouter un article" });
    await add.getByLabel("Nom de l'article").fill("Polo Ralph Lauren");
    await expect(add.getByLabel("Quantité")).toHaveValue("1");
    await expect(add.getByRole("radio", { name: "Prix du lot" })).toHaveCount(0);
    await add.getByRole("button", { name: "Un de plus" }).click();
    await add.getByRole("button", { name: "Un de plus" }).click();
    await expect(add.getByLabel("Quantité")).toHaveValue("3");
    await add.getByRole("radio", { name: "Prix du lot" }).check();
    await add.getByLabel("Prix d'achat du lot").fill("24,00");
    await expect(add.getByText(/soit 8,00\s€ par article/)).toBeVisible();
    await expectAccessible(page);
    await add.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.getByText("« Polo Ralph Lauren » ajouté à votre stock (3 pièces)")).toBeVisible();
    await expect(add).toBeHidden();
    const stock = page.getByRole("region", { name: "Votre stock" });
    await expect(stock).toContainText(/3\s*articles en stock/);
    await expect(stock).toContainText(/24,00\s€/);

    // Sell 2 of them for 30,00 € in total.
    await page.getByRole("button", { name: "Vendu !", exact: true }).click();
    const sell = page.getByRole("dialog", { name: "Vendu !" });
    await sell.getByRole("button", { name: /Polo Ralph Lauren/ }).click();
    await expect(sell.getByText(/3 disponibles/)).toBeVisible();
    await expect(sell.getByLabel("Quantité vendue")).toHaveValue("1");
    await expect(sell.getByLabel("Prix de vente", { exact: true })).toBeVisible();
    await sell.getByRole("button", { name: "Un de plus" }).click();
    await expect(sell.getByLabel("Quantité vendue")).toHaveValue("2");
    const total = sell.getByLabel("Prix de vente total");
    await total.fill("30");
    await expect(sell.getByText("Ce que vous recevez pour les 2 articles au total", { exact: false })).toBeVisible();
    await expectAccessible(page);
    await total.press("Enter");
    await expect(page.getByText("Vente enregistrée")).toBeVisible();
    await expect(sell).toBeHidden();

    // Home: 2 pieces sold, 1 left worth 8,00 €; 30,00 − 2 × 8,00 = 14,00 € kept.
    await expect(stock).toContainText(/1\s*article en stock/);
    await expect(stock).toContainText(/8,00\s€/);
    const figures = page.getByRole("region", { name: "Chiffres clés" });
    await expect(figures).toContainText(/14,00\s€/);
    await expect(figures).toContainText(/30,00\s€/);

    // My items: one row with the quantities and the latest sale.
    await page.goto("/app/items");
    const row = page.getByRole("main").getByRole("listitem").filter({ hasText: "Polo Ralph Lauren", visible: true });
    await expect(row).toContainText("2 vendus · 1 restant");
    await expect(row).toContainText("Prix par article");
    await expect(row).toContainText(/8,00\s€/);
    await expect(row).toContainText("Dernière vente (2 articles)");
    await expect(row).toContainText(/30,00\s€/);
    await expect(row).toContainText(/14,00\s€/);
    await expectAccessible(page);

    // The last piece sells alone: no quantity to choose.
    await row.getByRole("button", { name: "Vendu : Polo Ralph Lauren" }).click();
    await expect(sell).toBeVisible();
    await expect(sell.getByLabel("Prix de vente", { exact: true })).toBeVisible();
    await expect(sell.getByLabel("Quantité vendue")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Editing: the quantity cannot go below the 2 pieces sold.
    await row.getByRole("button", { name: "Modifier : Polo Ralph Lauren" }).click();
    const edit = page.getByRole("dialog", { name: "Modifier l'article" });
    await expect(edit.getByLabel("Quantité")).toHaveValue("3");
    await expect(edit.getByText("2 pièces déjà vendues.")).toBeVisible();
    await edit.getByRole("button", { name: "Un de moins" }).click();
    await expect(edit.getByLabel("Quantité")).toHaveValue("2");
    await expect(edit.getByRole("button", { name: "Un de moins" })).toBeDisabled();
    await edit.getByRole("button", { name: "Un de plus" }).click();
    await edit.getByRole("button", { name: "Un de plus" }).click();
    await edit.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Article enregistré")).toBeVisible();
    await expect(row).toContainText("2 vendus · 2 restants");

    // Partly sold items are listed among the sales too.
    await page.getByRole("link", { name: "Vendus" }).click();
    await page.waitForURL(/tab=sold/);
    await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: "Polo Ralph Lauren", visible: true })).toContainText("2 vendus · 2 restants");

    // Phone width: the add dialog with a lot fits.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/items");
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Ajouter un article" }).click();
    const addPhone = page.getByRole("dialog", { name: "Ajouter un article" });
    await addPhone.getByLabel("Quantité").fill("10");
    await addPhone.getByRole("radio", { name: "Prix du lot" }).check();
    await addPhone.getByLabel("Prix d'achat du lot").fill("10");
    await expect(addPhone.getByText(/soit 1,00\s€ par article/)).toBeVisible();
    await addPhone.getByLabel("Quantité").fill("3");
    await expect(addPhone.getByText(/soit 3,3333\s€ par article \(arrondi à 4 décimales\)/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
