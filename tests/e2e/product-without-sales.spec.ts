import { expect, test } from "@playwright/test";
import { onboard, signUp, uniqueEmail } from "./helpers";

/** A product added by hand has no sales yet: its page and charts must still render. */
test("a product without sales opens without error", async ({ page }) => {
  await signUp(page, uniqueEmail("e2e-nosales"));
  await onboard(page, { storeName: "Empty Store", pricesIncludeTax: true, sample: false });
  await page.goto("/app/products", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add product" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Vintage denim jacket");
  await dialog.getByLabel(/Unit cost/).fill("12.50");
  await dialog.getByRole("button", { name: "Add product" }).click();
  await page.waitForURL(/\/app\/products\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { name: "Vintage denim jacket" })).toBeVisible();
  await expect(page.getByText(/could not load this page/i)).toHaveCount(0);
});
