import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import type { CampaignRow } from "@/lib/analytics/reference";
import type { Locale } from "@/i18n/config";
import { createFormat } from "@/i18n/format";
import { pdfMessages } from "@/i18n/messages/account-reports";
import type { DateRange } from "@/lib/domain/types";
import { platformLabel, type Platform } from "@/lib/domain/types";
import type { Insight } from "@/lib/finance/insights";
import { definitionsFor, type DefinitionKey, type Metrics } from "@/lib/finance/metrics";

/**
 * Server-side PDF reports (A4). Built from the same figures as the screens,
 * with the definitions and data-quality caveats printed alongside, so a
 * report can be read on its own by an accountant or a partner.
 */

export type ReportKind = "summary" | "products" | "advertising";

export type PdfProductRow = {
  name: string;
  sku: string | null;
  units: number;
  netRevenue: number;
  cogs: number | null;
  contributionMargin: number | null;
  contributionMarginRate: number | null;
};

export type PdfReportInput = {
  kind: ReportKind;
  storeName: string;
  isDemo: boolean;
  currency: string;
  timezone: string;
  range: DateRange;
  comparison: DateRange | null;
  generatedAt: string;
  metrics: Metrics;
  previous: Metrics | null;
  products: PdfProductRow[];
  campaigns: CampaignRow[];
  insights: Insight[];
  notes: string[];
  unallocatedAdSpend: number;
  /** Language of the report text and number/date formatting (default English). */
  locale?: Locale;
};

const C = {
  ink: "#172033",
  ink2: "#464e60",
  ink3: "#5d6474",
  line: "#e6e3dc",
  sunken: "#f2f0eb",
  emerald: "#1a6e57",
  emeraldTint: "#e9f5f0",
  negative: "#a8402c",
  caution: "#8a5a12",
  cautionTint: "#fbf3e2",
};

/** Definitions printed at the end of each report, from the same source as the in-app glossary. */
const DEFINITION_KEYS: Record<ReportKind, DefinitionKey[]> = {
  summary: [
    "grossSales",
    "discounts",
    "refunds",
    "netSales",
    "netRevenue",
    "cogs",
    "shippingCosts",
    "transactionFees",
    "adSpend",
    "otherVariableCosts",
    "contributionMargin",
    "fixedCosts",
    "operatingProfit",
  ],
  products: ["netRevenue", "cogs", "shippingCosts", "transactionFees", "contributionMargin", "contributionMarginRate"],
  advertising: ["adSpend", "netRevenue", "blendedRoas", "roas", "breakEvenRoas", "contributionMargin"],
};

type Column = { header: string; width: number; align?: "left" | "right" };

async function fonts() {
  const dir = join(process.cwd(), "assets/fonts");
  const [regular, semibold] = await Promise.all([readFile(join(dir, "InstrumentSans-Regular.ttf")), readFile(join(dir, "InstrumentSans-SemiBold.ttf"))]);
  return { regular, semibold };
}

export async function renderPdfReport(input: PdfReportInput): Promise<Buffer> {
  const locale = input.locale ?? "en";
  const t = pdfMessages[locale];
  const f = createFormat(locale);
  const reportTitle = t.titles[input.kind];
  // French typography puts a space before the colon.
  const colon = locale === "fr" ? " : " : ": ";
  const { regular, semibold } = await fonts();
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 54, bottom: 64, left: 48, right: 48 },
    bufferPages: true,
    info: { Title: `${reportTitle} — ${input.storeName}`, Author: "Narixia", Subject: f.range(input.range), Creator: "Narixia" },
  });
  doc.registerFont("Sans", regular);
  doc.registerFont("Bold", semibold);
  doc.font("Sans");
  // French number formatting uses narrow no-break spaces (1 234,50 €, 12 %),
  // which the embedded font has no glyph for: print a no-break space instead.
  const printable = (value: unknown) => (typeof value === "string" ? value.replace(/[   ]/g, " ") : value);
  const rawText = doc.text.bind(doc) as (...args: unknown[]) => typeof doc;
  const rawHeight = doc.heightOfString.bind(doc) as (...args: unknown[]) => number;
  doc.text = ((text: unknown, ...rest: unknown[]) => rawText(printable(text), ...rest)) as typeof doc.text;
  doc.heightOfString = ((text: unknown, ...rest: unknown[]) => rawHeight(printable(text), ...rest)) as typeof doc.heightOfString;

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const money = (v: number) => f.money(v, input.currency);
  const ensure = (height: number) => {
    if (doc.y + height > bottom()) doc.addPage();
  };

  // ---- Header -------------------------------------------------------------
  doc.rect(left, 40, 10, 10).fill(C.emerald);
  doc.font("Bold").fontSize(11).fillColor(C.ink).text("Narixia", left + 16, 38.5);
  doc.moveDown(1.6);
  doc.font("Bold").fontSize(20).fillColor(C.ink).text(reportTitle, left, doc.y, { width });
  doc.moveDown(0.2);
  doc
    .font("Sans")
    .fontSize(10)
    .fillColor(C.ink2)
    .text(
      `${input.storeName} · ${f.range(input.range)}${input.comparison ? t.comparedWith(f.range(input.comparison)) : ""}`,
      { width },
    );
  doc.fillColor(C.ink3).fontSize(8.5).text(t.amountsIn(input.currency, input.generatedAt, input.timezone), { width });
  doc.moveDown(0.8);

  if (input.isDemo) {
    const y = doc.y;
    doc.rect(left, y, width, 26).fill(C.cautionTint);
    doc.font("Bold").fontSize(9).fillColor(C.caution).text(t.sampleBanner, left + 10, y + 8.5, { width: width - 20 });
    doc.y = y + 36;
  }

  // ---- Helpers -------------------------------------------------------------
  const sectionTitle = (title: string, subtitle?: string) => {
    ensure(48);
    doc.moveDown(0.6);
    doc.font("Bold").fontSize(12).fillColor(C.ink).text(title, left, doc.y, { width });
    if (subtitle) doc.font("Sans").fontSize(8.5).fillColor(C.ink3).text(subtitle, { width });
    doc.moveDown(0.4);
  };

  const table = (columns: Column[], rows: { cells: string[]; bold?: boolean; tint?: string; tones?: (string | undefined)[] }[]) => {
    const pad = 5;
    const drawHeader = () => {
      const y = doc.y;
      doc.rect(left, y, width, 18).fill(C.sunken);
      let x = left;
      doc.font("Bold").fontSize(8).fillColor(C.ink3);
      for (const col of columns) {
        doc.text(col.header, x + pad, y + 5, { width: col.width - pad * 2, align: col.align ?? "left", lineBreak: false, ellipsis: true });
        x += col.width;
      }
      doc.y = y + 18;
    };
    drawHeader();
    for (const row of rows) {
      doc.font(row.bold ? "Bold" : "Sans").fontSize(8.5);
      const heights = row.cells.map((cell, i) => doc.heightOfString(cell, { width: columns[i].width - pad * 2 }));
      const h = Math.max(...heights) + pad * 2;
      if (doc.y + h > bottom()) {
        doc.addPage();
        drawHeader();
        doc.font(row.bold ? "Bold" : "Sans").fontSize(8.5);
      }
      const y = doc.y;
      if (row.tint) doc.rect(left, y, width, h).fill(row.tint);
      let x = left;
      row.cells.forEach((cell, i) => {
        doc.fillColor(row.tones?.[i] ?? C.ink).text(cell, x + pad, y + pad, { width: columns[i].width - pad * 2, align: columns[i].align ?? "left" });
        x += columns[i].width;
      });
      doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor(C.line).stroke();
      doc.y = y + h;
    }
    doc.x = left;
  };

  const m = input.metrics;
  const p = input.previous;
  const change = (current: number | null, previous: number | null | undefined, kind: "relative" | "points" = "relative") => {
    if (current === null || previous === null || previous === undefined) return "—";
    if (kind === "points") return f.points(current - previous);
    if (previous === 0) return "—";
    return f.percent((current - previous) / Math.abs(previous), { signDisplay: "exceptZero" });
  };

  // ---- Key figures -----------------------------------------------------------
  if (input.kind !== "products") {
    sectionTitle(t.keyFigures, p ? t.keyFiguresCompared : t.keyFiguresNoComparison);
    const rows: [string, string, string, string][] =
      input.kind === "advertising"
        ? [
            [t.adSpend, money(m.adSpend), p ? money(p.adSpend) : "—", change(m.adSpend, p?.adSpend)],
            [t.netRevenue, money(m.netRevenue), p ? money(p.netRevenue) : "—", change(m.netRevenue, p?.netRevenue)],
            [t.adSpendShare, f.percent(m.adSpendRate), p ? f.percent(p.adSpendRate) : "—", change(m.adSpendRate, p?.adSpendRate, "points")],
            [t.blendedRoas, f.multiple(m.blendedRoas), p ? f.multiple(p.blendedRoas) : "—", "—"],
            [t.breakEvenRoas, f.multiple(m.breakEvenRoas), p ? f.multiple(p.breakEvenRoas) : "—", "—"],
            [t.contributionBeforeAds, money(m.contributionBeforeAds), p ? money(p.contributionBeforeAds) : "—", change(m.contributionBeforeAds, p?.contributionBeforeAds)],
            [t.contributionMargin, money(m.contributionMargin), p ? money(p.contributionMargin) : "—", change(m.contributionMargin, p?.contributionMargin)],
          ]
        : [
            [t.netRevenue, money(m.netRevenue), p ? money(p.netRevenue) : "—", change(m.netRevenue, p?.netRevenue)],
            [t.contributionMargin, money(m.contributionMargin), p ? money(p.contributionMargin) : "—", change(m.contributionMargin, p?.contributionMargin)],
            [t.contributionMarginRate, f.percent(m.contributionMarginRate), p ? f.percent(p.contributionMarginRate) : "—", change(m.contributionMarginRate, p?.contributionMarginRate, "points")],
            [t.orders, f.count(m.orders), p ? f.count(p.orders) : "—", change(m.orders, p?.orders)],
            [t.averageOrderValue, m.averageOrderValue === null ? "—" : money(m.averageOrderValue), p?.averageOrderValue != null ? money(p.averageOrderValue) : "—", change(m.averageOrderValue, p?.averageOrderValue)],
            [t.refundRate, f.percent(m.refundRate), p ? f.percent(p.refundRate) : "—", change(m.refundRate, p?.refundRate, "points")],
            [t.adSpend, money(m.adSpend), p ? money(p.adSpend) : "—", change(m.adSpend, p?.adSpend)],
          ];
    table(
      [
        { header: t.colMeasure, width: width * 0.43 },
        { header: t.colThisPeriod, width: width * 0.2, align: "right" },
        { header: t.colPreviousPeriod, width: width * 0.2, align: "right" },
        { header: t.colChange, width: width * 0.17, align: "right" },
      ],
      rows.map((r) => ({ cells: r })),
    );
  }

  // ---- Profit breakdown ------------------------------------------------------
  if (input.kind === "summary") {
    sectionTitle(t.breakdown, t.breakdownSubtitle);
    const share = (v: number, signed = false) => (m.netRevenue > 0 ? f.percent((signed ? v : Math.abs(v)) / m.netRevenue) : "—");
    const L = t.lines;
    const incomplete = t.incomplete;
    const estimates = t.includesEstimates;
    const lines: { label: string; amount: number; total?: boolean; result?: boolean; note?: string }[] = [
      { label: L.grossSales, amount: m.grossSales },
      { label: L.discounts, amount: -m.discounts },
      { label: L.refunds, amount: -m.refunds },
      { label: L.netSales, amount: m.netSales, total: true },
      { label: L.shippingCharged, amount: m.shippingCharged },
      { label: L.netRevenue, amount: m.netRevenue, total: true },
      { label: L.cogs, amount: -m.cogs, note: m.completeness.cogs === "partial" || m.completeness.cogs === "missing" ? incomplete : undefined },
      { label: L.grossProfit, amount: m.grossProfit, total: true },
      { label: L.shippingCosts, amount: -m.shippingCosts, note: m.completeness.shipping === "estimated" ? estimates : m.completeness.shipping === "partial" || m.completeness.shipping === "missing" ? incomplete : undefined },
      { label: L.transactionFees, amount: -m.transactionFees, note: m.completeness.fees === "estimated" ? estimates : m.completeness.fees === "partial" || m.completeness.fees === "missing" ? incomplete : undefined },
      { label: L.adSpend, amount: -m.adSpend },
      { label: L.otherVariableCosts, amount: -m.otherVariableCosts },
      { label: L.contributionMargin, amount: m.contributionMargin, result: true },
      { label: L.fixedCosts, amount: -m.fixedCosts },
      { label: L.operatingProfit, amount: m.operatingProfit, total: true },
    ];
    table(
      [
        { header: t.colLine, width: width * 0.5 },
        { header: t.colAmount, width: width * 0.25, align: "right" },
        { header: t.colShare, width: width * 0.25, align: "right" },
      ],
      lines.map((l) => ({
        cells: [l.note ? `${l.label} (${l.note})` : l.label, money(l.amount), share(l.amount, l.total || l.result)],
        bold: l.total || l.result,
        tint: l.result ? C.emeraldTint : undefined,
        tones: [undefined, (l.total || l.result) && l.amount < 0 ? C.negative : undefined, undefined],
      })),
    );
  }

  // ---- Products ---------------------------------------------------------------
  if (input.kind !== "advertising" && input.products.length > 0) {
    const list = input.kind === "summary" ? input.products.slice(0, 10) : input.products;
    sectionTitle(
      input.kind === "summary" ? t.topProducts : t.products,
      t.productsSubtitle,
    );
    table(
      [
        { header: t.colProduct, width: width * 0.36 },
        { header: t.colUnits, width: width * 0.1, align: "right" },
        { header: t.colNetRevenue, width: width * 0.16, align: "right" },
        { header: t.colCogs, width: width * 0.14, align: "right" },
        { header: t.colContribution, width: width * 0.14, align: "right" },
        { header: t.colMargin, width: width * 0.1, align: "right" },
      ],
      list.map((r) => ({
        cells: [
          r.sku ? `${r.name} (${r.sku})` : r.name,
          f.count(r.units),
          money(r.netRevenue),
          r.cogs === null ? t.incomplete : money(r.cogs),
          r.contributionMargin === null ? "—" : money(r.contributionMargin),
          f.percent(r.contributionMarginRate),
        ],
        tones: [undefined, undefined, undefined, r.cogs === null ? C.caution : undefined, r.contributionMargin !== null && r.contributionMargin < 0 ? C.negative : undefined, undefined],
      })),
    );
    if (input.kind === "products" && input.unallocatedAdSpend > 0) {
      doc.moveDown(0.4);
      doc.font("Sans").fontSize(8).fillColor(C.ink3).text(t.unallocatedAdSpend(money(input.unallocatedAdSpend)), left, doc.y, { width });
    }
  }

  // ---- Campaigns ------------------------------------------------------------------
  if (input.kind !== "products" && input.campaigns.length > 0) {
    const list = input.kind === "summary" ? input.campaigns.slice(0, 8) : input.campaigns;
    sectionTitle(
      input.kind === "summary" ? t.topCampaigns : t.campaigns,
      t.campaignsSubtitle(f.multiple(m.breakEvenRoas)),
    );
    table(
      [
        { header: t.colCampaign, width: width * 0.4 },
        { header: t.colPlatform, width: width * 0.14 },
        { header: t.colSpend, width: width * 0.16, align: "right" },
        { header: t.colConvValue, width: width * 0.16, align: "right" },
        { header: t.colRoas, width: width * 0.14, align: "right" },
      ],
      list.map((c) => {
        const below = m.breakEvenRoas !== null && c.platformRoas !== null && c.platformRoas < m.breakEvenRoas;
        return {
          cells: [c.name, platformLabel(c.platform as Platform, locale) ?? c.platform, money(c.spend), money(c.conversionValue), `${f.multiple(c.platformRoas)}${below ? t.belowBreakEven : ""}`],
          tones: [undefined, undefined, undefined, undefined, below ? C.caution : undefined],
        };
      }),
    );
  }

  // ---- Insights and notes ---------------------------------------------------------
  if (input.kind === "summary" && input.insights.length > 0) {
    sectionTitle(t.observations, t.observationsSubtitle);
    for (const insight of input.insights.slice(0, 5)) {
      ensure(40);
      doc.font("Bold").fontSize(9).fillColor(C.ink).text(insight.title, left, doc.y, { width });
      doc.font("Sans").fontSize(8.5).fillColor(C.ink2).text(insight.body, { width });
      doc.fillColor(C.ink3).fontSize(8).text(insight.evidence.map((e) => `${e.label}${colon}${e.value}`).join(" · "), { width });
      doc.moveDown(0.5);
    }
  }
  if (input.notes.length > 0) {
    sectionTitle(t.dataQuality);
    for (const note of input.notes) {
      ensure(24);
      doc.font("Sans").fontSize(8.5).fillColor(C.ink2).text(`• ${note}`, left, doc.y, { width });
      doc.moveDown(0.2);
    }
  }

  // ---- Definitions ---------------------------------------------------------------
  sectionTitle(t.definitions, t.definitionsSubtitle);
  const definitions = definitionsFor(locale);
  for (const key of DEFINITION_KEYS[input.kind]) {
    const d = definitions[key];
    ensure(30);
    doc.font("Bold").fontSize(8.5).fillColor(C.ink).text(`${d.term}${colon}`, left, doc.y, { width, continued: true });
    doc.font("Sans").fillColor(C.ink2).text(`${d.formula}. ${d.short}`);
    doc.moveDown(0.25);
  }

  // ---- Footer on every page -------------------------------------------------------
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would otherwise start a new page.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 44;
    doc.font("Sans").fontSize(7.5).fillColor(C.ink3);
    doc.text(
      `${input.storeName} · ${reportTitle} · ${f.date(input.range.from)} – ${f.date(input.range.to)}${input.isDemo ? t.sampleData : ""}`,
      left,
      y,
      { width: width * 0.75, lineBreak: false, ellipsis: true },
    );
    doc.text(t.page(i - pages.start + 1, pages.count), left + width * 0.75, y, { width: width * 0.25, align: "right", lineBreak: false });
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}
