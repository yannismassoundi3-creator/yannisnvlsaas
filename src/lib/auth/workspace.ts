import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { LOCALES, type Locale } from "@/i18n/config";
import { onboardingMessages } from "@/i18n/messages/auth-onboarding";
import { getRequestLocale } from "@/i18n/request";
import { resolveEntitlements, type Entitlements } from "@/lib/billing/entitlements";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Data Access Layer
 * -----------------
 * The only place that turns a request into "who is this and what may they
 * see". Every page, server action and route handler goes through it, and Row
 * Level Security re-checks access in the database for every query.
 */

export type Store = Database["public"]["Tables"]["stores"]["Row"];

export type SessionUser = { id: string; email: string | null };

export type Workspace = {
  user: SessionUser & { fullName: string | null };
  organization: { id: string; name: string } | null;
  role: Database["public"]["Enums"]["member_role"] | null;
  stores: Store[];
  activeStore: Store | null;
  entitlements: Entitlements;
};

export type ReadyWorkspace = Workspace & {
  organization: NonNullable<Workspace["organization"]>;
  role: NonNullable<Workspace["role"]>;
};

export const ACTIVE_STORE_COOKIE = "nx_store";

/** Default names the sample store is created with, in every language (and earlier wordings). */
const SAMPLE_STORE_NAMES = new Set<string>(["Sample store", "Boutique exemple", ...LOCALES.map((l) => onboardingMessages[l].actions.sampleStoreName)]);

/**
 * The sample store's name is stored in the language it was created in. While
 * it keeps its default name, it is shown in the current interface language.
 */
export function displayStore(store: Store, locale: Locale): Store {
  if (!store.is_demo || !SAMPLE_STORE_NAMES.has(store.name)) return store;
  return { ...store, name: onboardingMessages[locale].actions.sampleStoreName };
}

/** Verified identity of the caller (JWT signature and expiry checked), or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Session checks compare token expiry with the current time: always request-time.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: typeof data.claims.email === "string" ? data.claims.email : null };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}

export const getWorkspace = cache(async (): Promise<Workspace> => {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("organization_members")
      .select("role, organization:organizations(id, name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const organization = membership?.organization ?? null;
  if (!organization) {
    return {
      user: { ...user, fullName: profile?.full_name ?? null },
      organization: null,
      role: null,
      stores: [],
      activeStore: null,
      entitlements: resolveEntitlements(null),
    };
  }

  const [{ data: stores }, { data: entitlementRow }, cookieStore, locale] = await Promise.all([
    supabase.from("stores").select("*").eq("organization_id", organization.id).order("created_at", { ascending: true }),
    supabase.from("organization_entitlements").select("*").eq("organization_id", organization.id).maybeSingle(),
    cookies(),
    getRequestLocale(),
  ]);

  const list = (stores ?? []).map((s) => displayStore(s, locale));
  const preferred = cookieStore.get(ACTIVE_STORE_COOKIE)?.value;
  const activeStore = list.find((s) => s.id === preferred) ?? list.find((s) => !s.is_demo) ?? list[0] ?? null;

  return {
    user: { ...user, fullName: profile?.full_name ?? null },
    organization: { id: organization.id, name: organization.name },
    role: membership?.role ?? null,
    stores: list,
    activeStore,
    entitlements: resolveEntitlements(entitlementRow),
  };
});

/** Workspace of a user who has completed onboarding; redirects otherwise. */
export async function requireWorkspace(): Promise<ReadyWorkspace> {
  const ws = await getWorkspace();
  if (!ws.organization || !ws.role) redirect("/onboarding");
  return ws as ReadyWorkspace;
}

/** Workspace with an active store; sends users without a store to onboarding. */
export async function requireStore(): Promise<ReadyWorkspace & { activeStore: Store }> {
  const ws = await requireWorkspace();
  if (!ws.activeStore) redirect("/onboarding");
  return ws as ReadyWorkspace & { activeStore: Store };
}
