import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * Database test helpers. Tests run against the local Supabase Postgres
 * (`npx supabase start`) and impersonate users exactly like the Data API does:
 * SET ROLE authenticated plus request.jwt.claims, so RLS policies and column
 * grants are exercised for real.
 */
export const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });

// bigint columns arrive as strings by default; tests compare numbers.
pg.types.setTypeParser(20, (v) => Number(v));

export async function adminQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: readonly unknown[] = []) {
  return pool.query<T>(sql, [...params]);
}

/** Creates an auth user directly (the on_auth_user_created trigger runs). */
export async function createUser(email = `user-${randomUUID()}@example.test`): Promise<string> {
  const id = randomUUID();
  await adminQuery(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), '{"full_name":"Test User"}', now(), now())`,
    [id, email],
  );
  return id;
}

export type AsUser = <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params?: readonly unknown[]) => Promise<pg.QueryResult<T>>;

/**
 * Runs `fn` inside a transaction as `userId` (role authenticated) or as anon.
 * The transaction is rolled back unless `commit` is true.
 */
export async function asUser<R>(userId: string | null, fn: (q: AsUser) => Promise<R>, { commit = false } = {}): Promise<R> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (userId) {
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
      await client.query("set local role authenticated");
    } else {
      await client.query("set local role anon");
    }
    const q: AsUser = (sql, params = []) => client.query(sql, [...params]);
    const result = await fn(q);
    await client.query(commit ? "commit" : "rollback");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Creates an organisation and store owned by `userId` through the onboarding RPC. */
export async function createOrganization(userId: string, opts: { currency?: string; digits?: number; timezone?: string } = {}) {
  return asUser(
    userId,
    async (q) => {
      const { rows } = await q<{ organization_id: string; store_id: string }>(
        "select * from public.create_organization_with_store($1, $2, $3, $4, $5::smallint, $6, $7)",
        ["Test Org", "Test Store", "shopify", opts.currency ?? "EUR", opts.digits ?? 2, opts.timezone ?? "Europe/Paris", false],
      );
      return { orgId: rows[0].organization_id, storeId: rows[0].store_id };
    },
    { commit: true },
  );
}

export async function expireTrial(orgId: string) {
  await adminQuery("update public.organizations set trial_ends_at = now() - interval '1 minute' where id = $1", [orgId]);
}

export async function cleanupUsers(ids: string[]) {
  if (ids.length === 0) return;
  // Deleting organisations cascades to all tenant data; then remove users.
  await adminQuery(
    "delete from public.organizations where id in (select organization_id from public.organization_members where user_id = any($1::uuid[]))",
    [ids],
  );
  await adminQuery("delete from auth.users where id = any($1::uuid[])", [ids]);
}
