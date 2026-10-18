import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { expectAccessible, signUp, uniqueEmail } from "./helpers";

/**
 * Item photos and the AI listing, in French at a 390 px phone width: a
 * generated photo is enhanced on the device (before/after, download), the AI
 * button says « Bientôt disponible » when the feature is off, and with the
 * canned listing of LISTING_AI_FAKE (set by playwright.config.ts; Anthropic is
 * never called) the result card can be copied and its title used. Saving the
 * item stores a thumbnail shown in « Mes articles » and in the sale picker;
 * deleting the item deletes the file.
 *
 * Set SCREENSHOT_DIR to save screenshots of each step.
 */

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function shot(page: Page, name: string) {
  const dir = process.env.SCREENSHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: false });
}

/** A dark, slightly blue-tinted photo of a "jacket" drawn on a canvas, as JPEG bytes. */
async function testPhoto(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 900;
    const ctx = c.getContext("2d")!;
    const bg = ctx.createLinearGradient(0, 0, 1200, 900);
    bg.addColorStop(0, "#2b3040");
    bg.addColorStop(1, "#4a5068");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 900);
    ctx.fillStyle = "#1f3a66";
    ctx.beginPath();
    ctx.moveTo(420, 180);
    ctx.lineTo(780, 180);
    ctx.lineTo(900, 330);
    ctx.lineTo(820, 380);
    ctx.lineTo(800, 760);
    ctx.lineTo(400, 760);
    ctx.lineTo(380, 380);
    ctx.lineTo(300, 330);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#b8a77a";
    for (let i = 0; i < 5; i++) ctx.fillRect(592, 240 + i * 100, 16, 16);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  return Buffer.from(base64, "base64");
}

async function storedPhotos(email: string): Promise<number> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: number }>(
      `select count(*)::int as n from storage.objects o
       where o.bucket_id = 'item-photos'
         and split_part(o.name, '/', 1)::uuid in (select m.organization_id from public.organization_members m join auth.users u on u.id = m.user_id where u.email = $1)`,
      [email],
    );
    return rows[0].n;
  } finally {
    await client.end();
  }
}

test("a reseller enhances a photo, writes the listing with AI and saves the item with its thumbnail", async ({ page, context }) => {
  const email = uniqueEmail("e2e-photos");
  await signUp(page, email);
  await page.goto("/onboarding?hl=fr");
  await page.getByLabel("Nom de la boutique").fill("Mes trouvailles");
  await page.getByLabel("Où vendez-vous ?").selectOption("vinted");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Créer mon espace de travail" }).click();
  await expect(page.getByRole("heading", { name: "Ajoutez votre premier article" })).toBeVisible();
  await page.goto("/app");
  await page.setViewportSize({ width: 390, height: 844 });

  // The AI is off (test cookie, honoured only in fake mode): « Bientôt disponible ».
  await context.addCookies([{ name: "narixia_ai", value: "off", url: page.url() }]);
  await page.getByRole("button", { name: "Ajouter un article" }).first().click();
  let dialog = page.getByRole("dialog", { name: "Ajouter un article" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Narixia ajuste seulement la lumière, les couleurs et le cadrage")).toBeVisible();
  const photo = await testPhoto(page);
  await dialog.locator('input[type="file"]').setInputFiles({ name: "veste.jpg", mimeType: "image/jpeg", buffer: photo });
  const after = dialog.getByRole("img", { name: "Photo 1 après amélioration" });
  await expect(after).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Télécharger la photo 1" })).toHaveAttribute("download", "photo-article-1.jpg");
  // Square framing by default.
  const box = await after.boundingBox();
  expect(Math.abs((box?.width ?? 0) - (box?.height ?? 1))).toBeLessThan(2);
  const soon = dialog.getByRole("button", { name: "Bientôt disponible" });
  await expect(soon).toBeVisible();
  await expect(soon).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Créer l'annonce avec l'IA" })).toHaveCount(0);
  await soon.scrollIntoViewIfNeeded();
  await shot(page, "4-bientot-disponible");
  await expectAccessible(page);
  await page.keyboard.press("Escape");
  await context.clearCookies({ name: "narixia_ai" });

  // Fake AI on: photo with before/after, then the listing.
  await page.getByRole("button", { name: "Ajouter un article" }).first().click();
  dialog = page.getByRole("dialog", { name: "Ajouter un article" });
  await dialog.locator('input[type="file"]').setInputFiles({ name: "veste.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(dialog.getByRole("img", { name: "Photo 1 après amélioration" })).toBeVisible();
  const compare = dialog.getByRole("button", { name: "Avant / après (photo 1)" });
  await compare.click();
  await expect(compare).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("img", { name: "Photo 1 avant amélioration" })).toBeVisible();
  await dialog.getByRole("heading", { name: "Photos" }).scrollIntoViewIfNeeded();
  await shot(page, "1-photo-avant-apres");
  await compare.click();
  await expect(dialog.getByRole("img", { name: "Photo 1 après amélioration" })).toBeVisible();

  await expect(dialog.getByText("50 analyses restantes ce mois-ci")).toBeVisible();
  await expect(dialog.getByText("Vos photos sont envoyées à Claude (Anthropic) pour cette analyse")).toBeVisible();
  await dialog.getByRole("button", { name: "Créer l'annonce avec l'IA" }).click();
  const result = dialog.getByTestId("listing-result");
  await expect(result).toBeVisible();
  await expect(result.getByText("Données de test", { exact: true })).toBeVisible();
  await expect(dialog.getByText("49 analyses restantes ce mois-ci")).toBeVisible();
  await expect(result.getByText("Estimation de l'IA, sans données de marché — à vérifier")).toBeVisible();
  await expect(result.getByLabel("De", { exact: true })).toHaveValue("15");
  await expect(result.getByLabel("À", { exact: true })).toHaveValue("25");
  await expect(result.getByText("Vinted", { exact: true })).toBeVisible();
  const title = result.getByLabel("Titre", { exact: true });
  await expect(title).toHaveValue(/Veste en jean bleue/);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await result.getByRole("button", { name: "Copier pour Vinted" }).click();
  await expect(page.getByText("Copié", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Veste en jean bleue");
  await title.fill("Veste en jean bleue Levi's");
  await result.getByRole("button", { name: "Utiliser ce titre" }).click();
  await expect(dialog.getByLabel("Nom de l'article")).toHaveValue("Veste en jean bleue Levi's");
  await result.getByRole("heading", { name: "Annonce proposée par l'IA" }).scrollIntoViewIfNeeded();
  if (process.env.SCREENSHOT_DIR) {
    await expect(page.getByText("Titre repris comme nom de l'article")).toBeHidden({ timeout: 15_000 });
    await shot(page, "2-annonce-ia-donnees-de-test");
  }
  await expectAccessible(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Nothing is saved until the item is: then the thumbnail is stored.
  expect(await storedPhotos(email)).toBe(0);
  await dialog.getByLabel("Prix d'achat").fill("6,50");
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("« Veste en jean bleue Levi's » ajouté à votre stock")).toBeVisible();
  expect(await storedPhotos(email)).toBe(1);

  await page.goto("/app/items");
  const row = page.getByRole("main").getByRole("listitem").filter({ hasText: "Veste en jean bleue Levi's" });
  const thumb = row.locator('img[src*="/storage/v1/object/sign/item-photos/"]');
  await expect(thumb).toBeVisible();
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(480);
  await shot(page, "3-mes-articles-miniature");
  await expectAccessible(page);

  // The sale picker shows it too.
  await page.getByRole("button", { name: "Vendu !", exact: true }).first().click();
  const sell = page.getByRole("dialog", { name: "Vendu !" });
  await expect(sell.locator('img[src*="item-photos"]')).toBeVisible();
  await page.keyboard.press("Escape");

  // Deleting the item deletes its photo.
  await row.getByRole("button", { name: "Supprimer : Veste en jean bleue Levi's" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
  await expect(page.getByText("Article supprimé")).toBeVisible();
  await expect.poll(() => storedPhotos(email)).toBe(0);
});

test("a photo the browser cannot decode gets a clear message", async ({ page }) => {
  await signUp(page, uniqueEmail("e2e-heic"));
  await page.goto("/onboarding?hl=fr");
  await page.getByLabel("Nom de la boutique").fill("Boutique HEIC");
  await page.getByLabel("Où vendez-vous ?").selectOption("vinted");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Créer mon espace de travail" }).click();
  await expect(page.getByRole("heading", { name: "Ajoutez votre premier article" })).toBeVisible();
  await page.goto("/app?add=1");
  const dialog = page.getByRole("dialog", { name: "Ajouter un article" });
  // Not a real image (like a HEIC file in a browser without HEIC support).
  await dialog.locator('input[type="file"]').setInputFiles({ name: "IMG_0001.HEIC", mimeType: "image/heic", buffer: Buffer.from("ftypheic not decodable") });
  await expect(dialog.getByRole("alert").filter({ hasText: "Impossible d'ouvrir cette photo (format HEIC ?)" })).toBeVisible();
  await expect(dialog.getByRole("img")).toHaveCount(0);
});
