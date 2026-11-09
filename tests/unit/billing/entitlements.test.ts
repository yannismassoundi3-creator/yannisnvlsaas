import { describe, expect, it } from "vitest";
import { PLANS } from "@/config/plans";
import { historyStart, isResellerOnly, offersFor, planFor, resolveEntitlements, type EntitlementRow } from "@/lib/billing/entitlements";

const base: EntitlementRow = {
  access: "trial",
  trial_started_at: "2026-10-01T10:00:00Z",
  trial_ends_at: "2026-10-15T10:00:00Z",
  subscription_id: null,
  subscription_status: null,
  current_period_end: null,
  cancel_at_period_end: null,
  cancel_at: null,
  past_due_since: null,
  grace_ends_at: null,
};

describe("resolveEntitlements", () => {
  it("gives trial limits and a rounded-up countdown during the trial", () => {
    const e = resolveEntitlements(base, new Date("2026-10-12T09:00:00Z"));
    expect(e.access).toBe("trial");
    expect(e.plan).toBe("trial");
    expect(e.limits).toEqual(PLANS.trial.limits);
    expect(e.canWrite).toBe(true);
    expect(e.trialDaysLeft).toBe(4); // 3 days and 1 hour left -> 4
  });

  it("never shows a negative countdown", () => {
    expect(resolveEntitlements(base, new Date("2026-10-16T00:00:00Z")).trialDaysLeft).toBe(0);
  });

  it("locks analytics and writes once expired, but keeps the record", () => {
    const e = resolveEntitlements({ ...base, access: "expired" });
    expect(e.canWrite).toBe(false);
    expect(e.canViewAnalytics).toBe(false);
    expect(e.trialDaysLeft).toBeNull();
    expect(e.trialEndsAt).toBe(base.trial_ends_at);
  });

  it("gives Pro limits to paying and grace-period customers", () => {
    const pro = resolveEntitlements({ ...base, access: "pro", subscription_id: "sub_1", subscription_status: "active", current_period_end: "2026-11-12T00:00:00Z" });
    expect(pro.plan).toBe("pro");
    expect(pro.limits.exports).toBe(true);
    expect(pro.subscription).toEqual({ id: "sub_1", status: "active", currentPeriodEnd: "2026-11-12T00:00:00Z", cancelAtPeriodEnd: false, cancelAt: null });

    const grace = resolveEntitlements({ ...base, access: "grace", subscription_id: "sub_1", subscription_status: "past_due", grace_ends_at: "2026-10-20T00:00:00Z" });
    expect(grace.plan).toBe("pro");
    expect(grace.canWrite).toBe(true);
    expect(grace.graceEndsAt).toBe("2026-10-20T00:00:00Z");
  });

  it("treats unknown or missing data as expired", () => {
    expect(resolveEntitlements(null).access).toBe("expired");
    expect(resolveEntitlements({ ...base, access: "something-else" }).access).toBe("expired");
  });
});

describe("reseller plans", () => {
  const after = { ...base, paid_plan: null, stock_limit: null };

  it("knows whether the database has the reseller plans migration", () => {
    // Before the migration the view has no paid_plan column: behave as before.
    expect(resolveEntitlements(base).resellerPlans).toBe(false);
    expect(resolveEntitlements(after).resellerPlans).toBe(true);
    expect(resolveEntitlements(null).resellerPlans).toBe(false);
  });

  it("maps the free plan: writes allowed, 30 pieces, no AI or email sales", () => {
    const e = resolveEntitlements({ ...after, access: "free", stock_limit: 30 });
    expect(e.access).toBe("free");
    expect(e.plan).toBe("free");
    expect(e.paidPlan).toBeNull();
    expect(e.canWrite).toBe(true);
    expect(e.canViewAnalytics).toBe(true);
    expect(e.paidFeatures).toBe(false);
    expect(e.stockLimit).toBe(30);
    expect(e.limits).toEqual(PLANS.free.limits);
    expect(e.limits.exports).toBe(false);
    expect(e.trialDaysLeft).toBeNull();
    // The limit falls back to the plan's when the column is null.
    expect(resolveEntitlements({ ...after, access: "free" }).stockLimit).toBe(PLANS.free.limits.stockItems);
  });

  it("maps a Revendeur subscription to the reseller plan, and Pro (or an unknown plan) to pro", () => {
    const reseller = resolveEntitlements({ ...after, access: "pro", paid_plan: "reseller", subscription_id: "sub_1", subscription_status: "active" });
    expect(reseller.plan).toBe("reseller");
    expect(reseller.paidPlan).toBe("reseller");
    expect(reseller.stockLimit).toBeNull();
    expect(reseller.paidFeatures).toBe(true);
    expect(reseller.limits.stockItems).toBeNull();
    expect(resolveEntitlements({ ...after, access: "grace", paid_plan: "reseller" }).plan).toBe("reseller");
    expect(resolveEntitlements({ ...after, access: "pro", paid_plan: "pro" }).plan).toBe("pro");
    expect(resolveEntitlements({ ...after, access: "pro", paid_plan: "enterprise" }).plan).toBe("pro");
    // Before the migration every subscription is Pro.
    expect(resolveEntitlements({ ...base, access: "pro" }).paidPlan).toBe("pro");
  });

  it("gives AI listings and email sales to the trial and paid plans only", () => {
    expect(resolveEntitlements(after).paidFeatures).toBe(true);
    expect(resolveEntitlements({ ...after, access: "expired" }).paidFeatures).toBe(false);
    expect(resolveEntitlements({ ...after, access: "free" }).paidFeatures).toBe(false);
    expect(resolveEntitlements({ ...after, access: "grace" }).paidFeatures).toBe(true);
  });

  it("chooses the plan whose limits apply", () => {
    expect(planFor("trial", null)).toBe("trial");
    expect(planFor("expired", null)).toBe("trial");
    expect(planFor("free", null)).toBe("free");
    expect(planFor("pro", null)).toBe("pro");
    expect(planFor("grace", "reseller")).toBe("reseller");
  });

  it("detects reseller-only workspaces like the database (the sample store does not count)", () => {
    const reseller = { is_demo: false, business_model: "reseller" };
    const shop = { is_demo: false, business_model: "ecommerce" };
    const sample = { is_demo: true, business_model: "ecommerce" };
    expect(isResellerOnly([reseller])).toBe(true);
    expect(isResellerOnly([reseller, sample])).toBe(true);
    expect(isResellerOnly([reseller, shop])).toBe(false);
    expect(isResellerOnly([shop])).toBe(false);
    expect(isResellerOnly([sample])).toBe(false);
    expect(isResellerOnly([])).toBe(false);
    expect(offersFor([reseller, sample])).toEqual(["reseller", "pro"]);
    expect(offersFor([shop])).toEqual(["pro"]);
  });
});

describe("historyStart", () => {
  it("limits analytics to the plan's history window", () => {
    expect(historyStart({ limits: PLANS.trial.limits }, "2026-10-16")).toBe("2026-07-19");
  });
});
