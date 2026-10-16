/**
 * Local development seed.
 *
 * Creates a confirmed account with a workspace, an empty real store and the
 * clearly labelled sample store (generated demo data, `is_demo = true`), the
 * same state a new user reaches after onboarding with "Create the sample
 * store". Running it again recreates the account from scratch.
 *
 *   npm run seed
 *
 * It refuses to run against anything but a local Supabase stack: it uses the
 * secret key to create a pre-confirmed user, which must never happen on a
 * hosted project. Override the credentials with SEED_EMAIL / SEED_PASSWORD.
 */
import { createClient } from "@supabase/supabase-js";
import { addDays, todayIn } from "@/lib/dates";
import { generateDemoDataset } from "@/lib/demo/generator";
import { insertDataset } from "@/lib/demo/persist";
import { currencyDigits } from "@/lib/finance/currency";
import type { Database } from "@/lib/supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
const email = process.env.SEED_EMAIL ?? "demo@narixia.test";
const password = process.env.SEED_PASSWORD ?? "margins2026ok";
const timezone = "Europe/Paris";

function fail(message: string): never {
  console.error(`seed: ${message}`);
  process.exit(1);
}

if (!url || !publishableKey || !secretKey) fail("set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY (see .env.example).");
const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") fail(`refusing to seed ${host}: this script is for the local Supabase stack only.`);

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient<Database>(url, secretKey, clientOptions);

async function removeExistingAccount() {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`could not list users: ${error.message}`);
    const existing = data.users.find((u) => u.email === email);
    if (existing) {
      // Deleting a user does not cascade to organisations (created_by is set null), so delete them first.
      const { data: memberships } = await admin.from("organization_members").select("organization_id").eq("user_id", existing.id).eq("role", "owner");
      const orgIds = (memberships ?? []).map((m) => m.organization_id);
      if (orgIds.length) await admin.from("organizations").delete().in("id", orgIds);
      const { error: deleteError } = await admin.auth.admin.deleteUser(existing.id);
      if (deleteError) fail(`could not delete the previous seed account: ${deleteError.message}`);
      return;
    }
    if (data.users.length < 200) return;
  }
}

async function main() {
  await removeExistingAccount();

  const { error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Demo Founder" } });
  if (createError) fail(`could not create the account: ${createError.message}`);

  // Everything else is written with the user's own session, so RLS checks every row.
  const user = createClient<Database>(url, publishableKey, clientOptions);
  const { error: signInError } = await user.auth.signInWithPassword({ email, password });
  if (signInError) fail(`could not sign in: ${signInError.message}`);

  const { data: created, error: workspaceError } = await user.rpc("create_organization_with_store", {
    p_organization_name: "Demo Goods",
    p_store_name: "Demo Goods",
    p_platform: "shopify",
    p_currency: "EUR",
    p_minor_digits: currencyDigits("EUR"),
    p_timezone: timezone,
    p_prices_include_tax: true,
  });
  const workspace = Array.isArray(created) ? created[0] : created;
  if (workspaceError || !workspace) fail(`could not create the workspace: ${workspaceError?.message ?? "no row returned"}`);

  const dataset = generateDemoDataset({ endDate: addDays(todayIn(timezone), -1), timezone });
  // Inserting a store with is_demo is reserved to the server (as in the onboarding action).
  const { data: sample, error: sampleError } = await admin
    .from("stores")
    .insert({
      organization_id: workspace.organization_id,
      name: "Sample store",
      platform: "other",
      currency: dataset.settings.currency,
      minor_digits: currencyDigits(dataset.settings.currency),
      timezone,
      prices_include_tax: false,
      fee_rule_bps: dataset.settings.feeRuleBasisPoints,
      fee_rule_fixed_minor: dataset.settings.feeRuleFixedMinor,
      default_shipping_cost_minor: dataset.settings.defaultShippingCostMinor,
      is_demo: true,
    })
    .select("id")
    .single();
  if (sampleError || !sample) fail(`could not create the sample store: ${sampleError?.message ?? "no row returned"}`);
  await insertDataset(user, { organizationId: workspace.organization_id, storeId: sample.id, source: "demo" }, dataset);

  console.log(`Seeded ${email} (password: ${password})`);
  console.log(`  real store "Demo Goods" (empty) and "Sample store" with ${dataset.orders.length} demo orders`);
  console.log("  sign in at http://localhost:3000/sign-in");
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
