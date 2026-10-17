import { describe, expect, it } from "vitest";
import { buildInsights } from "@/lib/finance/insights";
import { buildAdvertisingKpis, buildPrimaryKpis, buildSecondaryKpis } from "@/lib/finance/kpis";
import { DEFINITIONS, definitionsFor, deriveMetrics, EMPTY_TOTALS } from "@/lib/finance/metrics";
import type { ProductRow } from "@/lib/analytics/reference";

/** Intl uses narrow no-break spaces in French numbers; compare with plain spaces. */
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("French metric definitions", () => {
  const fr = definitionsFor("fr");

  it("covers every term with a translated term, description and formula", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(DEFINITIONS).sort());
    for (const key of Object.keys(DEFINITIONS) as (keyof typeof DEFINITIONS)[]) {
      expect(fr[key].term.length).toBeGreaterThan(0);
      expect(fr[key].short.length).toBeGreaterThan(0);
      expect(fr[key].formula.length).toBeGreaterThan(0);
      if (key !== "roi") expect(fr[key].short).not.toBe(DEFINITIONS[key].short);
    }
  });

  it("uses the agreed terminology and says contribution margin is not net profit", () => {
    expect(fr.contributionMargin.term).toBe("Ce qui vous reste (marge sur coûts variables)");
    expect(fr.contributionMargin.short).toMatch(/^Ce qui vous reste de vos ventes /);
    expect(fr.contributionMargin.short).toContain("ce n'est pas votre bénéfice net");
    expect(fr.cogs.term).toBe("Coût d'achat des produits");
    expect(fr.netRevenue.term).toBe("Chiffre d'affaires net");
    expect(fr.breakEvenRoas.term).toBe("Seuil de rentabilité de la pub (ROAS)");
    expect(fr.blendedRoas.term).toBe("Ventes par euro de pub (ROAS)");
    expect(fr.roas.term).toBe("ROAS annoncé par la plateforme");
    expect(fr.operatingProfit.term).toBe("Résultat d'exploitation (estimation)");
    expect(fr.netSales.formula).toBe("Ventes brutes − Remises − Remboursements");
  });

  it("keeps English as the default", () => {
    expect(definitionsFor()).toBe(DEFINITIONS);
    expect(definitionsFor("en").contributionMargin.term).toBe("Contribution margin");
  });
});

describe("French KPIs", () => {
  const current = deriveMetrics({
    ...EMPTY_TOTALS,
    orders: 10,
    units: 1,
    grossSales: 123_456,
    productSalesAfterDiscounts: 123_456,
    salesWithoutCost: 20_000,
    linesWithoutCost: 2,
    cogs: 50_000,
    adSpend: 10_000,
    shippingCosts: 5_000,
    transactionFees: 2_000,
  });
  const previous = deriveMetrics({ ...EMPTY_TOTALS, orders: 8, grossSales: 100_000, productSalesAfterDiscounts: 100_000, cogs: 40_000 });

  it("translates labels, statuses and footnotes and formats numbers the French way", () => {
    const [revenue, margin, rate, orders] = buildPrimaryKpis(current, previous, "EUR", "fr");
    expect(revenue.label).toBe("Chiffre d'affaires net");
    expect(plain(revenue.value)).toBe("1 235 €");
    expect(plain(revenue.footnote!)).toBe("Ventes nettes 1 235 €");
    expect(revenue.definition.term).toBe("Chiffre d'affaires net");
    expect(plain(revenue.delta!.text)).toBe("+23,5 %");
    expect(margin.label).toBe("Ce qui vous reste");
    expect(margin.definition.term).toBe("Ce qui vous reste (marge sur coûts variables)");
    expect(margin.status).toEqual({ tone: "caution", label: "Coûts incomplets" });
    expect(plain(margin.footnote!)).toMatch(/^\d+,\d % du chiffre d'affaires net$/);
    expect(rate.delta!.text).toMatch(/pts$/);
    expect(orders.label).toBe("Commandes");
    expect(orders.footnote).toMatch(/^Panier moyen /);
  });

  it("agrees French plurals and keeps English wording unchanged", () => {
    const fr = buildSecondaryKpis(current, previous, "EUR", "fr");
    expect(fr.find((k) => k.key === "grossSales")!.footnote).toBe("1 unité vendue");
    expect(fr.find((k) => k.key === "cogs")!.label).toBe("Coût d'achat des produits");
    const en = buildSecondaryKpis(current, previous, "EUR");
    expect(en.find((k) => k.key === "grossSales")!.footnote).toBe("1 units sold");
    expect(en.find((k) => k.key === "shippingAndFees")!.footnote).toBe("Shipping €50 · Fees €20");
  });

  it("translates the advertising figures", () => {
    const ads = buildAdvertisingKpis(current, previous, "EUR", "fr");
    expect(ads.map((k) => k.label)).toEqual([
      "Dépenses publicitaires",
      "Ventes par euro de pub (ROAS)",
      "Seuil de rentabilité de la pub (ROAS)",
      "Ce qui vous reste avant publicité",
    ]);
    expect(plain(ads[1].value)).toMatch(/^\d+,\d\d×$/);
  });
});

describe("French insights", () => {
  const product = (over: Partial<ProductRow>): ProductRow =>
    ({
      productId: "p1",
      name: "Sac en lin",
      netRevenue: 50_000,
      grossSales: 50_000,
      discounts: 0,
      refunds: 0,
      adSpend: 0,
      contributionMargin: 20_000,
      contributionMarginRate: 0.4,
      linesWithoutCost: 0,
      ...over,
    }) as ProductRow;

  const previous = deriveMetrics({
    ...EMPTY_TOTALS,
    orders: 50,
    grossSales: 100_000,
    productSalesAfterDiscounts: 100_000,
    cogs: 30_000,
    refunds: 1_000,
    adSpend: 5_000,
  });
  const current = deriveMetrics({
    ...EMPTY_TOTALS,
    orders: 50,
    grossSales: 100_000,
    productSalesAfterDiscounts: 100_000,
    salesWithoutCost: 20_000,
    linesWithoutCost: 4,
    cogs: 30_000,
    refunds: 5_000,
    adSpend: 10_000,
    transactionFees: 2_000,
    transactionFeesEstimated: 2_000,
  });
  const input = {
    currency: "EUR",
    current,
    previous,
    products: {
      current: [product({ netRevenue: 50_000, adSpend: 4_000, contributionMargin: 10_000, contributionMarginRate: 0.2 })],
      previous: [product({})],
    },
    feeRule: { basisPoints: 150, fixedMinor: 25 },
  };

  it("applies the same rules in both languages", () => {
    const en = buildInsights(input);
    const fr = buildInsights({ ...input, locale: "fr" });
    expect(fr.map((i) => i.id)).toEqual(en.map((i) => i.id));
    expect(fr.map((i) => i.severity)).toEqual(en.map((i) => i.severity));
    expect(fr.map((i) => i.action?.href)).toEqual(en.map((i) => i.action?.href));
  });

  it("writes titles, bodies, evidence and actions in French", () => {
    const fr = buildInsights({ ...input, locale: "fr" });
    const byId = (id: string) => fr.find((i) => i.id.startsWith(id))!;
    expect(plain(byId("missing_costs").title)).toBe("Le coût est manquant pour 20 % des ventes de produits");
    expect(byId("missing_costs").action!.label).toBe("Ajouter les coûts des produits");
    expect(byId("refund_rate_up").title).toBe("Le taux de remboursement a augmenté");
    expect(byId("refund_rate_up").evidence.map((e) => e.label)).toEqual(["Remboursements", "Évolution"]);
    expect(plain(byId("estimated_values").body)).toContain("les frais de paiement (1,50 % + 0,25 € par commande)");
    expect(byId("ad_spend_outpacing_revenue").body).toContain("Cela ne montre pas si les dépenses supplémentaires ont généré des ventes");
  });

  it("never claims causation in French", () => {
    const fr = buildInsights({ ...input, locale: "fr" });
    const drop = fr.find((i) => i.id.startsWith("product_margin_down"))!;
    expect(drop.title).toMatch(/^Sac en lin : ce qui vous reste est passé de .+ de ses ventes$/);
    expect(drop.body).toContain("coïncident");
    expect(drop.body).toContain("ce n'est pas une cause prouvée");
    for (const i of fr) expect(`${i.title} ${i.body}`).not.toMatch(/\b(à cause de|en raison de|a causé|ont causé|provoqué)\b/i);
  });
});
