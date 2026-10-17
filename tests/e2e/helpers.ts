import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Reads the confirmation link Supabase sent to the local Mailpit inbox. */
async function confirmationLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()) as { messages?: { ID: string; To?: { Address: string }[] }[] };
    const message = list.messages?.find((m) => m.To?.some((t) => t.Address === email));
    if (message) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as { HTML: string };
      const match = full.HTML.match(/href="([^"]*auth\/confirm[^"]*)"/);
      if (match) return match[1].replaceAll("&amp;", "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No confirmation email for ${email}`);
}

/** Reads the 6-digit code from the newest email to `email` whose subject contains `subject`. */
export async function emailCode(email: string, subject: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()) as { messages?: { ID: string; Subject: string; To?: { Address: string }[] }[] };
    const message = list.messages?.find((m) => m.Subject.includes(subject) && m.To?.some((t) => t.Address === email));
    if (message) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as { HTML: string };
      const match = full.HTML.match(/>(\d{6})</);
      if (match) return match[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No "${subject}" code for ${email}`);
}

export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`;

/** Signs up, confirms the email and lands on onboarding. */
export async function signUp(page: Page, email: string, password = "margins2026ok") {
  await page.goto("/sign-up", { waitUntil: "networkidle" });
  await page.getByLabel("Your name").fill("E2E Founder");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL("**/check-email**");
  await page.goto(await confirmationLink(email));
  await page.waitForURL("**/onboarding**");
}

/** Completes onboarding. With `sample`, also creates and opens the sample store. */
export async function onboard(page: Page, opts: { storeName: string; pricesIncludeTax: boolean; sample: boolean }) {
  await page.getByLabel("Store name").fill(opts.storeName);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText(opts.pricesIncludeTax ? "Yes, prices include tax" : "No, tax is added on top").click();
  await page.getByRole("button", { name: "Create my workspace" }).click();
  await expect(page.getByText("Add your first data")).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  if (opts.sample) {
    await page.getByRole("button", { name: "Create the sample store" }).click();
    await page.waitForURL(/\/app$/);
  } else {
    await page.getByRole("button", { name: "Go to my dashboard" }).click();
    await page.waitForURL(/\/app$/);
  }
}

/** Fails the test on WCAG 2.2 AA violations detected by axe. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
