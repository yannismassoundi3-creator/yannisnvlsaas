import { describe, expect, it } from "vitest";
import { FREE_STOCK_ITEMS, PLANS, planCopy, planForPrice } from "@/config/plans";
import { subscriptionRow } from "@/lib/billing/sync";

describe("plans and prices", () => {
  it("prices Revendeur at 7.99 and Pro at 19 by default, in the same currency", () => {
    expect(PLANS.reseller.priceMinor).toBe(799);
    expect(PLANS.pro.priceMinor).toBe(1_900);
    expect(PLANS.free.priceMinor).toBe(0);
    expect(PLANS.reseller.currency).toBe(PLANS.pro.currency);
    expect(PLANS.reseller.interval).toBe("month");
  });

  it("limits the free plan to 30 pieces in stock and leaves paid plans unlimited", () => {
    expect(FREE_STOCK_ITEMS).toBe(30);
    expect(PLANS.free.limits.stockItems).toBe(30);
    expect(PLANS.reseller.limits.stockItems).toBeNull();
    expect(PLANS.pro.limits.stockItems).toBeNull();
    expect(PLANS.trial.limits.stockItems).toBeNull();
    expect(PLANS.free.limits.exports).toBe(false);
  });

  it("maps the Revendeur price to the reseller plan and anything else to pro", () => {
    expect(planForPrice("price_reseller", "price_reseller")).toBe("reseller");
    expect(planForPrice("price_pro", "price_reseller")).toBe("pro");
    expect(planForPrice("price_old_pro", "price_reseller")).toBe("pro");
    expect(planForPrice(null, "price_reseller")).toBe("pro");
    // Without a configured Revendeur price, nothing is ever "reseller".
    expect(planForPrice("price_reseller", "")).toBe("pro");
    expect(planForPrice("price_reseller", null)).toBe("pro");
  });

  it("stores the plan on the subscription row written by the webhook", () => {
    const sub: Parameters<typeof subscriptionRow>[0] = {
      id: "sub_1",
      status: "active",
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      trial_end: null,
      items: { data: [{ price: { id: "price_reseller" }, current_period_start: 1_760_000_000, current_period_end: 1_762_600_000 }] },
    };
    const org = "11111111-1111-4111-8111-111111111111";
    expect(subscriptionRow(sub, org, new Date(), null, "price_reseller")).toMatchObject({ plan: "reseller", price_id: "price_reseller" });
    expect(subscriptionRow(sub, org, new Date(), null, "price_other")).toMatchObject({ plan: "pro" });
    expect(subscriptionRow(sub, org, new Date(), null)).toMatchObject({ plan: "pro" });
  });
});

describe("plan copy", () => {
  it("names the three offers in French", () => {
    expect(planCopy("free", "fr").name).toBe("Gratuit");
    expect(planCopy("reseller", "fr").name).toBe("Revendeur");
    expect(planCopy("pro", "fr").name).toBe("Pro");
    expect(planCopy("free", "fr").highlights).toContain("Jusqu'à 30 articles en stock");
    expect(planCopy("reseller", "fr").highlights).toContain("Stock illimité");
  });

  it("says « bientôt » for AI listings and email sales until they are switched on", () => {
    const soon = planCopy("reseller", "fr");
    expect(soon.highlights).toContain("Annonces générées par IA (bientôt)");
    expect(soon.highlights).toContain("Ventes reçues par e-mail (bientôt)");
    const live = planCopy("reseller", "fr", { aiListings: true, inboundEmail: true, aiListingsPerMonth: 50 });
    expect(live.highlights.some((h) => /bientôt/.test(h))).toBe(false);
    expect(live.highlights).toContain("Annonces générées par IA à partir de vos photos (50 par mois)");
    expect(planCopy("reseller", "en").highlights).toContain("Listings written by AI from your photos (coming soon)");
    // The free plan never promises them.
    expect(planCopy("free", "fr", { aiListings: true, inboundEmail: true }).highlights.some((h) => /IA|e-mail/.test(h))).toBe(false);
  });

  it("keeps English and French highlights the same length", () => {
    for (const id of ["free", "reseller", "pro"] as const) {
      expect(planCopy(id, "fr").highlights).toHaveLength(planCopy(id, "en").highlights.length);
    }
  });
});
