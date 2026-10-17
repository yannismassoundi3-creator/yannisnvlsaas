import type { Locale } from "@/i18n/config";
import { addDays, eachDay, zonedTimeToUtc } from "@/lib/dates";
import type {
  AdCampaign,
  AdSpendDay,
  Dataset,
  Expense,
  Order,
  OrderLine,
  Product,
  Refund,
  StoreSettings,
} from "@/lib/domain/types";
import { allocateProportionally, applyBasisPoints } from "@/lib/finance/money";

/**
 * Deterministic sample-store generator.
 *
 * Produces a fictional store's products, orders, refunds, campaigns and
 * expenses. Every value is synthetic and the store is always labelled as demo
 * data in the interface. The same seed and end date always produce the same
 * dataset, which also makes it a fixture for testing the database aggregates.
 * The locale only changes the wording (product, campaign and expense names):
 * SKUs, identifiers and every figure are identical in every language.
 */

export type DemoOptions = {
  /** Last day of data (local date). */
  endDate: string;
  days?: number;
  seed?: number;
  timezone?: string;
  /** Language of the product, campaign and expense names (English by default). */
  locale?: Locale;
};

export const DEMO_SETTINGS: Omit<StoreSettings, "timezone"> = {
  currency: "EUR",
  pricesIncludeTax: false,
  feeRuleBasisPoints: 150, // 1.5% estimated payment fees
  feeRuleFixedMinor: 25, // + €0.25 per order
  defaultShippingCostMinor: 550, // €5.50 estimate when no cost is recorded
};

type DemoProductSpec = { id: string; sku: string; name: string; nameFr: string; price: number; cost: number | null; weight: number };

const PRODUCTS: DemoProductSpec[] = [
  { id: "p01", sku: "TOTE-LIN-NAT", name: "Linen tote bag", nameFr: "Tote bag en lin", price: 3400, cost: 1120, weight: 18 },
  { id: "p02", sku: "POUR-CER-SET", name: "Ceramic pour-over set", nameFr: "Set café filtre en céramique", price: 5800, cost: 2450, weight: 9 },
  { id: "p03", sku: "BEAN-MER-CHR", name: "Merino beanie", nameFr: "Bonnet en mérinos", price: 3900, cost: 1480, weight: 8 },
  { id: "p04", sku: "TEE-ORG-WHT", name: "Organic cotton tee", nameFr: "T-shirt en coton bio", price: 2900, cost: 940, weight: 16 },
  { id: "p05", sku: "CARA-GLS-1L", name: "Recycled glass carafe", nameFr: "Carafe en verre recyclé", price: 4400, cost: 1690, weight: 7 },
  { id: "p06", sku: "APRN-WAX-OLV", name: "Waxed canvas apron", nameFr: "Tablier en toile cirée", price: 5200, cost: 1975, weight: 6 },
  { id: "p07", sku: "CNDL-BEE-TRI", name: "Beeswax candle trio", nameFr: "Trio de bougies en cire d'abeille", price: 2600, cost: 710, weight: 12 },
  { id: "p08", sku: "THRW-WOL-OAT", name: "Wool throw blanket", nameFr: "Plaid en laine", price: 12900, cost: 6100, weight: 3 },
  { id: "p09", sku: "NAPK-LIN-4PK", name: "Linen napkins, set of 4", nameFr: "Serviettes en lin (lot de 4)", price: 2400, cost: null, weight: 9 },
  { id: "p10", sku: "KEYR-LTH-TAN", name: "Leather key ring", nameFr: "Porte-clés en cuir", price: 1800, cost: 460, weight: 12 },
];

type CampaignSpec = AdCampaign & { nameFr: string; baseDaily: number; growth: number; lateRamp: number; roas: number; cpm: number; ctr: number; cvr: number };

const CAMPAIGNS: CampaignSpec[] = [
  { id: "c01", platform: "meta", externalId: "120211", name: "Prospecting – broad audiences", nameFr: "Prospection – audiences larges", productId: null, baseDaily: 5460, growth: 0.25, lateRamp: 0.55, roas: 1.9, cpm: 750, ctr: 0.011, cvr: 0.018 },
  { id: "c02", platform: "meta", externalId: "120214", name: "Retargeting – catalogue", nameFr: "Reciblage – catalogue", productId: null, baseDaily: 2080, growth: 0.15, lateRamp: 0.1, roas: 5.2, cpm: 1100, ctr: 0.019, cvr: 0.041 },
  { id: "c03", platform: "meta", externalId: "120219", name: "Merino beanie launch", nameFr: "Lancement du bonnet en mérinos", productId: "p03", baseDaily: 1170, growth: 0.1, lateRamp: 0.8, roas: 1.35, cpm: 820, ctr: 0.012, cvr: 0.014 },
  { id: "c04", platform: "google", externalId: "8812031", name: "Search – brand", nameFr: "Recherche – marque", productId: null, baseDaily: 910, growth: 0.2, lateRamp: 0.05, roas: 9.1, cpm: 2600, ctr: 0.074, cvr: 0.083 },
  { id: "c05", platform: "google", externalId: "8812044", name: "Shopping – all products", nameFr: "Shopping – tous les produits", productId: null, baseDaily: 2990, growth: 0.3, lateRamp: 0.15, roas: 3.8, cpm: 1300, ctr: 0.016, cvr: 0.027 },
];

/** Expense descriptions, by language. */
const EXPENSE_TEXT: Record<Locale, Record<"platform" | "email" | "accounting" | "storage" | "packaging" | "photography", string>> = {
  en: {
    platform: "E-commerce platform plan",
    email: "Email marketing tool",
    accounting: "Accounting software",
    storage: "Storage space",
    packaging: "Boxes, mailers and tissue",
    photography: "Product photography",
  },
  fr: {
    platform: "Abonnement à la plateforme e-commerce",
    email: "Outil d'e-mailing",
    accounting: "Logiciel de comptabilité",
    storage: "Espace de stockage",
    packaging: "Cartons, enveloppes et papier de soie",
    photography: "Photos des produits",
  },
};

/** Mulberry32: small, fast, deterministic PRNG. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemoDataset({ endDate, days = 180, seed = 20261016, timezone = "Europe/Paris", locale = "en" }: DemoOptions): Dataset {
  const rand = mulberry32(seed);
  // Names never consume random numbers, so every language gets the same figures.
  const localName = (spec: { name: string; nameFr: string }) => (locale === "fr" ? spec.nameFr : spec.name);
  const text = EXPENSE_TEXT[locale];
  const between = (min: number, max: number) => min + (max - min) * rand();
  const int = (min: number, max: number) => Math.floor(between(min, max + 1));
  const jitter = (spread: number) => 1 + (rand() + rand() + rand() - 1.5) * spread;
  const chance = (p: number) => rand() < p;
  const weightedPick = <T extends { weight: number }>(items: T[]): T => {
    const total = items.reduce((a, b) => a + b.weight, 0);
    let r = rand() * total;
    for (const item of items) {
      r -= item.weight;
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  };

  const startDate = addDays(endDate, -(days - 1));
  const allDays = eachDay({ from: startDate, to: endDate });
  const lateStart = addDays(endDate, -29); // the most recent 30 days

  const products: Product[] = PRODUCTS.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: localName(p),
    unitCostE4: p.cost === null ? null : p.cost * 100,
    priceMinor: p.price,
  }));

  const orders: Order[] = [];
  const refunds: Refund[] = [];
  let orderNumber = 1001;
  let lineCounter = 0;

  allDays.forEach((day, dayIndex) => {
    const progress = dayIndex / Math.max(allDays.length - 1, 1);
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
    const weekday = [1.12, 1.0, 0.95, 0.97, 1.0, 1.08, 1.15][dow];
    const isLate = day >= lateStart;
    const expected = (10 + 8 * progress) * weekday * (isLate ? 1.04 : 1);
    const count = Math.max(0, Math.round(expected * jitter(0.35)));

    for (let i = 0; i < count; i++) {
      const lineCount = chance(0.7) ? 1 : chance(0.73) ? 2 : 3;
      const picked = new Set<string>();
      const lines: OrderLine[] = [];
      for (let l = 0; l < lineCount; l++) {
        let spec = weightedPick(PRODUCTS);
        let guard = 0;
        while (picked.has(spec.id) && guard++ < 10) spec = weightedPick(PRODUCTS);
        if (picked.has(spec.id)) continue;
        picked.add(spec.id);
        const quantity = chance(0.85) ? 1 : chance(0.8) ? 2 : 3;
        lines.push({
          id: `l${++lineCounter}`,
          position: lines.length,
          productId: spec.id,
          sku: spec.sku,
          name: localName(spec),
          quantity,
          grossMinor: spec.price * quantity,
          discountMinor: 0,
          unitCostE4: null,
        });
      }
      const gross = lines.reduce((a, l) => a + l.grossMinor, 0);

      // 28% of orders use a 10% code, allocated across lines exactly.
      if (chance(0.28)) {
        const orderDiscount = applyBasisPoints(gross, 1000);
        const shares = allocateProportionally(orderDiscount, lines.map((l) => l.grossMinor));
        lines.forEach((l, idx) => (l.discountMinor = shares[idx]));
      }
      const afterDiscounts = gross - lines.reduce((a, l) => a + l.discountMinor, 0);
      const shippingCharged = afterDiscounts < 6000 ? 490 : 0;

      const hour = Math.min(23, Math.max(6, Math.round(between(7, 23) * 0.6 + between(17, 22) * 0.4)));
      const orderedAt = zonedTimeToUtc(day, `${String(hour).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}`, timezone);

      const order: Order = {
        id: `o${orderNumber}`,
        externalId: `#${orderNumber}`,
        orderedAt,
        shippingChargedMinor: shippingCharged,
        // Label cost recorded for most orders; the rest use the store's estimate.
        shippingCostMinor: chance(0.92) ? Math.round(between(420, 690) + (lines.length - 1) * 60) : null,
        transactionFeesMinor: null, // estimated from the fee rule
        taxesMinor: 0,
        lines,
      };
      orders.push(order);
      orderNumber++;

      // Baseline refunds, plus a recent rise in returns of the newly
      // advertised merino beanie (a sizing problem, in the demo's story).
      const beanieLine = lines.find((l) => l.productId === "p03");
      const beanieReturn = Boolean(beanieLine) && isLate && chance(0.22);
      if (beanieReturn || chance(isLate ? 0.045 : 0.035)) {
        const line = beanieReturn ? beanieLine! : lines[int(0, lines.length - 1)];
        const lineNet = line.grossMinor - line.discountMinor;
        const amount = beanieReturn || chance(0.6) ? lineNet : Math.round(lineNet / 2);
        const refundDay = addDays(day, int(2, 12));
        if (refundDay <= endDate) {
          refunds.push({
            id: `r${refunds.length + 1}`,
            orderId: order.id,
            refundedAt: zonedTimeToUtc(refundDay, `${String(int(9, 18)).padStart(2, "0")}:15:00`, timezone),
            amountMinor: amount,
          });
        }
      }
    }
  });

  const campaigns: AdCampaign[] = CAMPAIGNS.map((c) => ({ id: c.id, platform: c.platform, externalId: c.externalId, name: localName(c), productId: c.productId }));
  const adSpend: AdSpendDay[] = [];
  allDays.forEach((day, dayIndex) => {
    const progress = dayIndex / Math.max(allDays.length - 1, 1);
    const isLate = day >= lateStart;
    for (const c of CAMPAIGNS) {
      const daily = c.baseDaily * (1 + c.growth * progress) * (isLate ? 1 + c.lateRamp : 1) * jitter(0.25);
      const spendMinor = Math.max(0, Math.round(daily));
      const impressions = Math.round((spendMinor / c.cpm) * 1000);
      const clicks = Math.round(impressions * c.ctr * jitter(0.2));
      const conversions = Math.round(clicks * c.cvr * jitter(0.3));
      const conversionValueMinor = Math.max(0, Math.round(spendMinor * c.roas * jitter(0.3)));
      adSpend.push({ campaignId: c.id, date: day, spendMinor, impressions, clicks, conversions, conversionValueMinor });
    }
  });

  const expenses: Expense[] = [];
  let expenseId = 0;
  const addExpense = (e: Omit<Expense, "id">) => expenses.push({ id: `e${++expenseId}`, ...e });
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    const dayOfMonth = d.slice(8, 10);
    if (dayOfMonth === "01") {
      addExpense({ incurredOn: d, category: "software", kind: "fixed", amountMinor: 7900, description: text.platform });
      addExpense({ incurredOn: d, category: "software", kind: "fixed", amountMinor: 4500, description: text.email });
      addExpense({ incurredOn: d, category: "software", kind: "fixed", amountMinor: 2400, description: text.accounting });
      addExpense({ incurredOn: d, category: "fulfilment", kind: "fixed", amountMinor: 18000, description: text.storage });
    }
    if (dayOfMonth === "15") {
      addExpense({ incurredOn: d, category: "packaging", kind: "variable", amountMinor: Math.round(between(19000, 26000)), description: text.packaging });
    }
  }
  const photoDay = addDays(endDate, -62);
  if (photoDay >= startDate) {
    addExpense({ incurredOn: photoDay, category: "professional_services", kind: "fixed", amountMinor: 65000, description: text.photography });
  }

  return {
    settings: { ...DEMO_SETTINGS, timezone },
    products,
    orders,
    refunds,
    campaigns,
    adSpend,
    expenses,
  };
}
