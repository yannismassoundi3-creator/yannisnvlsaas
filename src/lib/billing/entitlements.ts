import { PLANS, type PaidPlanId, type PlanId, type PlanLimits } from "@/config/plans";

/**
 * Entitlements
 * ------------
 * The access level itself is computed by the database (private.org_access),
 * which also enforces it through Row Level Security and triggers. This module
 * turns that level into plan limits and interface state. It is pure so it can
 * be tested.
 */

export type AccessLevel = "pro" | "grace" | "trial" | "free" | "expired";

export type EntitlementRow = {
  access: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  cancel_at: string | null;
  past_due_since: string | null;
  grace_ends_at: string | null;
  /** Added by the reseller plans migration; absent before it is applied. */
  paid_plan?: string | null;
  stock_limit?: number | null;
};

export type Entitlements = {
  access: AccessLevel;
  plan: PlanId;
  /** Plan of the live subscription (access "pro" or "grace"), else null. */
  paidPlan: PaidPlanId | null;
  limits: PlanLimits;
  /** Imports, edits and new data are allowed. */
  canWrite: boolean;
  /** Dashboards, reports and analytics views are available. */
  canViewAnalytics: boolean;
  /** Listings written with AI and sales received by email (paid plans and the trial, not the free plan). */
  paidFeatures: boolean;
  /** Pieces allowed in stock on the free plan; null when unlimited. */
  stockLimit: number | null;
  /**
   * The database has the reseller plans migration (free plan, Revendeur plan).
   * Until then the app behaves as before and the Revendeur offer is "coming soon".
   */
  resellerPlans: boolean;
  trialEndsAt: string | null;
  /** Whole days left in the trial, rounded up; null outside the trial. */
  trialDaysLeft: number | null;
  graceEndsAt: string | null;
  subscription: {
    id: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    cancelAt: string | null;
  } | null;
};

const DAY_MS = 86_400_000;

function toAccess(value: string | null): AccessLevel {
  return value === "pro" || value === "grace" || value === "trial" || value === "free" ? value : "expired";
}

/** Plan whose limits apply at an access level. Expired workspaces keep the trial's (they are read-only anyway). */
export function planFor(access: AccessLevel, paidPlan: PaidPlanId | null): PlanId {
  if (access === "pro" || access === "grace") return paidPlan ?? "pro";
  if (access === "free") return "free";
  return "trial";
}

export function resolveEntitlements(row: EntitlementRow | null, now: Date = new Date()): Entitlements {
  const access = toAccess(row?.access ?? null);
  const live = access === "pro" || access === "grace";
  const paidPlan: PaidPlanId | null = live ? (row?.paid_plan === "reseller" ? "reseller" : "pro") : null;
  const plan = planFor(access, paidPlan);
  const limits = PLANS[plan].limits;
  const trialEndsAt = row?.trial_ends_at ?? null;
  const trialDaysLeft =
    access === "trial" && trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / DAY_MS)) : null;
  return {
    access,
    plan,
    paidPlan,
    limits,
    canWrite: access !== "expired",
    canViewAnalytics: access !== "expired",
    paidFeatures: live || access === "trial",
    stockLimit: access === "free" ? (row?.stock_limit ?? limits.stockItems) : null,
    resellerPlans: Boolean(row && "paid_plan" in row),
    trialEndsAt,
    trialDaysLeft,
    graceEndsAt: access === "grace" ? (row?.grace_ends_at ?? null) : null,
    subscription: row?.subscription_id
      ? {
          id: row.subscription_id,
          status: row.subscription_status ?? "unknown",
          currentPeriodEnd: row.current_period_end,
          cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
          cancelAt: row.cancel_at,
        }
      : null,
  };
}

/**
 * Whether an organisation sells only in reseller mode: at least one real store
 * and every real store in reseller mode (the sample store is ignored). Mirrors
 * private.org_is_reseller_only(), which decides the free plan.
 */
export function isResellerOnly(stores: readonly { is_demo: boolean; business_model: string }[]): boolean {
  const real = stores.filter((s) => !s.is_demo);
  return real.length > 0 && real.every((s) => s.business_model === "reseller");
}

/** Paid offers to show on the billing page: Revendeur first for reseller-only workspaces, else Pro alone. */
export function offersFor(stores: readonly { is_demo: boolean; business_model: string }[]): PaidPlanId[] {
  return isResellerOnly(stores) ? ["reseller", "pro"] : ["pro"];
}

/** Earliest date analytics may look back to under the plan's history limit. */
export function historyStart(entitlements: Pick<Entitlements, "limits">, today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (entitlements.limits.historyDays - 1));
  return d.toISOString().slice(0, 10);
}
