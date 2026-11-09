import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { expectAccessible, signUp, uniqueEmail } from "./helpers";

/**
 * The offers, in French: the pricing page shows Gratuit, Revendeur and Pro;
 * a reseller workspace whose trial has ended (trial dates moved into the past
 * in the local database) is on the free plan, sees it on Billing, and gets
 * the upgrade message when adding a 31st item in stock.
 *
 * Set SCREENSHOT_DIR to save screenshots of each step.
 */

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function shot(page: Page, name: string, fullPage = false) {
  const dir = process.env.SCREENSHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage });
}

/** Runs SQL for the organisation of `email` (local stack only). */
async function withOrg<T>(email: string, fn: (client: pg.Client, orgId: string, storeId: string) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ organization_id: string; store_id: string }>(
      `select m.organization_id, s.id as store_id
       from public.organization_members m
       join auth.users u on u.id = m.user_id
       join public.stores s on s.organization_id = m.organization_id and not s.is_demo
       where u.email = $1`,
      [email],
    );
    return await fn(client, rows[0].organization_id, rows[0].store_id);
  } finally {
    await client.end();
  }
}

test("the pricing page shows the three offers in French", async ({ page }) => {
  await page.goto("/fr/pricing");
  const offers = page.getByRole("article");
  await expect(offers).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Gratuit", level: 3, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Revendeur", level: 3, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pro", level: 3, exact: true })).toBeVisible();
  const reseller = offers.filter({ has: page.getByRole("heading", { name: "Revendeur", exact: true }) });
  await expect(reseller.getByText(/^7,99\s€$/)).toBeVisible();
  await expect(reseller.getByText("Stock illimité", { exact: true })).toBeVisible();
  await expect(offers.filter({ has: page.getByRole("heading", { name: "Pro", exact: true }) }).getByText(/^19\s€$/)).toBeVisible();
  await expect(offers.filter({ has: page.getByRole("heading", { name: "Gratuit", exact: true }) }).getByText("Jusqu'à 30 articles en stock", { exact: true })).toBeVisible();
  // AI listings are not switched on locally: never promised as live.
  await expect(reseller.getByText("Annonces générées par IA (bientôt)", { exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Articles en stock");
  await expect(page.getByRole("heading", { name: "Quelle offre choisir ?" })).toBeVisible();
  await expectAccessible(page);
  await shot(page, "1-tarifs", true);
});

test("a reseller after the trial is on the free plan and is stopped at 30 items in stock", async ({ page }) => {
  const email = uniqueEmail("e2e-free");
  await signUp(page, email);
  await page.goto("/onboarding?hl=fr");
  await page.getByLabel("Nom de la boutique").fill("Mes trouvailles");
  await page.getByLabel("Où vendez-vous ?").selectOption("vinted");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Créer mon espace de travail" }).click();
  await expect(page.getByRole("heading", { name: "Ajoutez votre premier article" })).toBeVisible();

  // 30 items in stock, then the trial ends (dates moved into the past).
  await withOrg(email, async (client, orgId, storeId) => {
    await client.query(
      "insert into public.products (organization_id, store_id, name, sku, unit_cost_e4) select $1, $2, 'Article ' || g, 'E2E-' || substr(md5(random()::text), 1, 10), 50000 from generate_series(1, 30) g",
      [orgId, storeId],
    );
    await client.query("update public.organizations set trial_started_at = now() - interval '20 days', trial_ends_at = now() - interval '6 days' where id = $1", [orgId]);
  });

  await page.goto("/app");
  await expect(page.getByText("Offre gratuite : jusqu'à 30 articles en stock.")).toBeVisible();
  await expect(page.getByText("Offre gratuite : 30 articles en stock sur 30.")).toBeVisible();

  await page.goto("/app/billing");
  await expect(page.getByText("Offre gratuite", { exact: true })).toBeVisible();
  await expect(page.getByText("Vous avez 30 articles en stock sur 30.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Offre Revendeur" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Offre Pro" })).toBeVisible();
  await expect(page.getByText("Recommandé pour les revendeurs")).toBeVisible();
  // No Revendeur price on this deployment: never a Pro checkout instead.
  await expect(page.getByRole("button", { name: "Bientôt disponible" })).toBeDisabled();
  await expectAccessible(page);
  await shot(page, "2-facturation-revendeur", true);

  // The 31st item is refused with the upgrade message.
  await page.goto("/app");
  await page.getByRole("button", { name: "Ajouter un article" }).first().click();
  const add = page.getByRole("dialog", { name: "Ajouter un article" });
  await add.getByLabel("Nom de l'article").fill("Veste en jean");
  await add.getByLabel("Prix d'achat").fill("8");
  await add.getByRole("button", { name: "Ajouter", exact: true }).click();
  const message = add.getByRole("alert").filter({ hasText: "Vous avez atteint 30 articles en stock avec l'offre gratuite. Passez à l'offre Revendeur pour un stock illimité." });
  await expect(message).toBeVisible();
  await expect(add.getByRole("link", { name: "Voir les offres" })).toHaveAttribute("href", /\/app\/billing$/);
  await expectAccessible(page);
  await shot(page, "3-limite-30-articles");
  expect(await withOrg(email, async (client, orgId) => (await client.query("select count(*)::int as n from public.products where organization_id = $1", [orgId])).rows[0].n)).toBe(30);

  // Recording a sale still works on the free plan.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Vendu !", exact: true }).click();
  const sell = page.getByRole("dialog", { name: "Vendu !" });
  await sell.getByRole("button", { name: /Article 1\b/ }).first().click();
  await sell.getByLabel("Prix de vente").fill("20");
  await sell.getByLabel("Prix de vente").press("Enter");
  await expect(page.getByText("Offre gratuite : 29 articles en stock sur 30.")).toBeVisible();
});
