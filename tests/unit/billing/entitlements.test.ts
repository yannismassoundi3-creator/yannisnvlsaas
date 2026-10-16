import { describe, expect, it } from "vitest";
import { PLANS } from "@/config/plans";
import { historyStart, resolveEntitlements, type EntitlementRow } from "@/lib/billing/entitlements";

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

describe("historyStart", () => {
  it("limits analytics to the plan's history window", () => {
    expect(historyStart({ limits: PLANS.trial.limits }, "2026-10-16")).toBe("2026-07-19");
  });
});
