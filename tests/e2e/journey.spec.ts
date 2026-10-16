import path from "node:path";
import { expect, test } from "@playwright/test";
import { expectAccessible, onboard, signUp, uniqueEmail } from "./helpers";

/**
 * The core journey of a new merchant, in order: sign up, onboarding, the
 * sample store, a real CSV import with review, cost entry, undo, settings,
 * data export and account deletion.
 */
test.describe.configure({ mode: "serial" });

test.describe("merchant journey", () => {
  const email = uniqueEmail("e2e");
  let context: import("@playwright/test").BrowserContext;
  let page: import("@playwright/test").Page;

  test.beforeAll(async ({ browser }) => {
    // axe needs pages created from an explicit context.
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("signs up, confirms the email and explores the sample store", async () => {
    await signUp(page, email);
    await onboard(page, { storeName: "E2E Goods", pricesIncludeTax: false, sample: true });
    await expect(page.getByText("You are viewing the sample store")).toBeVisible();
    await expect(page.getByText("Net revenue").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Profit breakdown" })).toBeVisible();
    await expectAccessible(page);
  });

  test("imports orders into the real store, reviewing errors before confirming", async () => {
    await page.locator("aside").getByRole("button", { name: /switch store/i }).click();
    await page.getByRole("menuitem", { name: /E2E Goods/ }).click();
    await expect(page.locator("aside").getByRole("button", { name: /E2E Goods/ })).toBeVisible();

    await page.goto("/app/imports/new?kind=orders");
    // A file chosen before hydration would never reach the wizard's change handler.
    await page.waitForLoadState("networkidle");
    await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "fixtures/shopify-orders.csv"));
    await expect(page.getByText("Shopify order export recognised")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Check the rows" }).click();
    await expect(page.getByText('Quantity is not a number: "two".')).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: /Upload 3 rows for review/ }).click();
    await page.waitForURL(/\/app\/imports\/[0-9a-f-]{36}/);
    await expect(page.getByText("Nothing has been saved yet")).toBeVisible();
    await page.getByRole("button", { name: /Import 3 rows/ }).click();
    await expect(page.getByText("Import complete")).toBeVisible();
    await expect(page.getByText("3 rows added")).toBeVisible();
  });

  test("shows imported sales and flags products without costs", async () => {
    await page.goto("/app?from=2026-10-01&to=2026-10-16");
    // 2 × 24 + 24 + 45 product sales + 4.90 shipping charged
    await expect(page.getByText("€122").first()).toBeVisible();
    await expect(page.getByText("Some sales have no product cost")).toBeVisible();

    await page.goto("/app/products?from=2026-10-01&to=2026-10-16");
    await expect(page.getByText("3 products have no unit cost")).toBeVisible();
    await page.getByRole("button", { name: /No cost\s?: add a unit cost for Linen tote bag/ }).click();
    await page.getByLabel("Unit cost for Linen tote bag, excluding VAT").fill("6.80");
    await page.getByRole("button", { name: "Save cost" }).click();
    await expect(page.getByText("Cost saved for Linen tote bag.")).toBeVisible();
    await expect(page.getByText("2 products have no unit cost")).toBeVisible();
  });

  test("undoes the import", async () => {
    await page.goto("/app/imports");
    await page.getByRole("link", { name: /\d{1,2} \w{3} \d{4}/ }).first().click();
    await page.getByRole("button", { name: "Undo import" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Undo import" }).click();
    await expect(page.getByText(/Import undone/)).toBeVisible();
    await page.goto("/app?from=2026-10-01&to=2026-10-16");
    await expect(page.getByText("No sales data yet")).toBeVisible();
  });

  test("saves cost rules and exports all data", async () => {
    await page.goto("/app/settings?section=costs");
    await page.getByLabel("Payment fee rate").fill("1.4");
    await page.getByLabel("Fixed fee per order").fill("0.25");
    await page.getByLabel("Shipping cost per order").fill("5");
    await page.getByRole("button", { name: "Save store settings" }).click();
    await expect(page.getByText(/Store settings saved/)).toBeVisible();

    await page.goto("/app/settings?section=data");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Download all data/ }).click()]);
    const file = await download.path();
    const data = JSON.parse(await (await import("node:fs/promises")).readFile(file, "utf8"));
    expect(data.format).toBe("narixia-export/1");
    expect(data.user.email).toBe(email);
    expect(data.stores.length).toBe(2);
  });

  test("deletes the account and everything in it", async () => {
    await page.goto("/app/settings?section=data");
    await page.getByRole("button", { name: "Delete account" }).click();
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete account" }).click();
    await page.waitForURL(/account=deleted/);
    await expect(page.getByText("Your account and all its data have been deleted")).toBeVisible();
    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
