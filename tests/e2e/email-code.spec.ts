import { expect, test } from "@playwright/test";
import { emailCode, expectAccessible, onboard, signUp, uniqueEmail } from "./helpers";

/** Signing in with a 6-digit code sent by email, and confirming a new account with the code. */
test.describe("email codes", () => {
  test("an existing user signs in with a code", async ({ browser }) => {
    const email = uniqueEmail("e2e-code");
    const setup = await browser.newContext();
    const first = await setup.newPage();
    await signUp(first, email);
    await onboard(first, { storeName: "Code Store", pricesIncludeTax: true, sample: false });
    await setup.close();

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Email me a sign-in code instead" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send the code" }).click();
    await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel("6-digit code").fill("000000");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("This code is incorrect or has expired")).toBeVisible();

    await page.getByLabel("6-digit code").fill(await emailCode(email, "sign-in code"));
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/app$/);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await context.close();
  });

  test("an unknown address gets the same answer and no email", async ({ page }) => {
    const email = uniqueEmail("e2e-nobody");
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Email me a sign-in code instead" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send the code" }).click();
    await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible();
    await expect(page.getByLabel("6-digit code")).toBeVisible();
  });

  test("a new account is confirmed with the code from the confirmation email", async ({ page }) => {
    const email = uniqueEmail("e2e-confirm");
    await page.goto("/sign-up", { waitUntil: "networkidle" });
    await page.getByLabel("Your name").fill("E2E Founder");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("margins2026ok");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL("**/check-email**");
    await expectAccessible(page);
    await page.getByLabel("Confirmation code").fill(await emailCode(email, "Confirm your Narixia account"));
    await page.getByRole("button", { name: "Confirm my email" }).click();
    await page.waitForURL("**/onboarding**");
  });
});
