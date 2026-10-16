import { expect, test } from "@playwright/test";
import { expectAccessible } from "./helpers";

test.describe("public site", () => {
  test("home page presents the product and its trial honestly", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Know your margins");
    await expect(page.getByRole("link", { name: "Start your free trial" }).first()).toBeVisible();
    await expect(page.getByText("Demo data").first()).toBeVisible();
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });

  for (const path of ["/pricing", "/glossary", "/privacy", "/terms", "/legal", "/contact", "/tools/profit-margin-calculator"]) {
    test(`${path} renders and is accessible`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectAccessible(page);
    });
  }

  test("the public calculator computes a break-even price", async ({ page }) => {
    await page.goto("/tools/profit-margin-calculator");
    await expect(page.getByText(/break-even/i).first()).toBeVisible();
  });

  test("application pages require signing in", async ({ page }) => {
    await page.goto("/app/products");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fproducts/);
    const exportResponse = await page.request.get("/api/account/export");
    expect(exportResponse.status()).toBe(401);
  });

  test("security headers are set", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response!.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
});
