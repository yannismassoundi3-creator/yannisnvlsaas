import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running app and the local Supabase stack
 * (`npx supabase start`). Emails are read from the local Mailpit inbox.
 * Set PLAYWRIGHT_CHROMIUM_PATH to use a preinstalled Chromium.
 */
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: chromiumPath ? { executablePath: chromiumPath } : {} } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000/robots.txt",
        reuseExistingServer: true,
        timeout: 180_000,
        // Canned AI listings (never in production, never calls Anthropic); see src/lib/listing/config.ts.
        env: { LISTING_AI_FAKE: "1" },
      },
});
