import { PLANS, type PlanId, type PlanLimits } from "@/config/plans";

/**
 * Entitlements
 * ------------
 * The access level itself is computed by the database (private.org_access),
 * which also enforces it through Row Level Security. This module turns that
 * level into plan limits and interface state. It is pure so it can be tested.
 */

export type AccessLevel = "pro" | "grace" | "trial" | "expired";

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
};

export type Entitlements = {
  access: AccessLevel;
  plan: PlanId;
  limits: PlanLimits;
  /** Imports, edits and new data are allowed. */
  canWrite: boolean;
  /** Dashboards, reports and analytics views are available. */
  canViewAnalytics: boolean;
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
  return value === "pro" || value === "grace" || value === "trial" ? value : "expired";
}

export function resolveEntitlements(row: EntitlementRow | null, now: Date = new Date()): Entitlements {
  const access = toAccess(row?.access ?? null);
  const plan: PlanId = access === "pro" || access === "grace" ? "pro" : "trial";
  const trialEndsAt = row?.trial_ends_at ?? null;
  const trialDaysLeft =
    access === "trial" && trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / DAY_MS)) : null;
  return {
    access,
    plan,
    limits: PLANS[plan].limits,
    canWrite: access !== "expired",
    canViewAnalytics: access !== "expired",
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

/** Earliest date analytics may look back to under the plan's history limit. */
export function historyStart(entitlements: Pick<Entitlements, "limits">, today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (entitlements.limits.historyDays - 1));
  return d.toISOString().slice(0, 10);
}
