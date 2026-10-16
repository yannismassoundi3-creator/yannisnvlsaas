import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import type { CampaignRow } from "@/lib/analytics/reference";
import { formatDate, formatRange } from "@/lib/dates";
import type { DateRange } from "@/lib/domain/types";
import { PLATFORM_LABELS, type Platform } from "@/lib/domain/types";
import { formatCount, formatMultiple, formatPercent, formatPoints } from "@/lib/finance/format";
import type { Insight } from "@/lib/finance/insights";
import type { Metrics } from "@/lib/finance/metrics";
import { formatMoney } from "@/lib/finance/money";

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

const TITLES: Record<ReportKind, string> = {
  summary: "Profitability summary",
  products: "Product profitability",
  advertising: "Advertising performance",
};

type Column = { header: string; width: number; align?: "left" | "right" };

async function fonts() {
  const dir = join(process.cwd(), "assets/fonts");
  const [regular, semibold] = await Promise.all([readFile(join(dir, "InstrumentSans-Regular.ttf")), readFile(join(dir, "InstrumentSans-SemiBold.ttf"))]);
  return { regular, semibold };
}

export async function renderPdfReport(input: PdfReportInput): Promise<Buffer> {
  const { regular, semibold } = await fonts();
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 54, bottom: 64, left: 48, right: 48 },
    bufferPages: true,
    info: { Title: `${TITLES[input.kind]} — ${input.storeName}`, Author: "Narixia", Subject: formatRange(input.range), Creator: "Narixia" },
  });
  doc.registerFont("Sans", regular);
  doc.registerFont("Bold", semibold);
  doc.font("Sans");

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const money = (v: number) => formatMoney(v, input.currency);
  const ensure = (height: number) => {
    if (doc.y + height > bottom()) doc.addPage();
  };

  // ---- Header -------------------------------------------------------------
  doc.rect(left, 40, 10, 10).fill(C.emerald);
  doc.font("Bold").fontSize(11).fillColor(C.ink).text("Narixia", left + 16, 38.5);
  doc.moveDown(1.6);
  doc.font("Bold").fontSize(20).fillColor(C.ink).text(TITLES[input.kind], left, doc.y, { width });
  doc.moveDown(0.2);
  doc
    .font("Sans")
    .fontSize(10)
    .fillColor(C.ink2)
    .text(
      `${input.storeName} · ${formatRange(input.range)}${input.comparison ? ` · compared with ${formatRange(input.comparison)}` : ""}`,
      { width },
    );
  doc.fillColor(C.ink3).fontSize(8.5).text(`Amounts in ${input.currency}, excluding VAT / sales tax. Generated ${input.generatedAt} (${input.timezone}).`, { width });
  doc.moveDown(0.8);

  if (input.isDemo) {
    const y = doc.y;
    doc.rect(left, y, width, 26).fill(C.cautionTint);
    doc.font("Bold").fontSize(9).fillColor(C.caution).text("SAMPLE STORE — every figure in this report is fictional demo data.", left + 10, y + 8.5, { width: width - 20 });
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
    if (kind === "points") return formatPoints(current - previous);
    if (previous === 0) return "—";
    return formatPercent((current - previous) / Math.abs(previous), { signDisplay: "exceptZero" });
  };

  // ---- Key figures -----------------------------------------------------------
  if (input.kind !== "products") {
    sectionTitle("Key figures", p ? "Change is relative to the previous period of equal length." : "No comparison: the previous period is outside the plan's history window.");
    const rows: [string, string, string, string][] =
      input.kind === "advertising"
        ? [
            ["Ad spend", money(m.adSpend), p ? money(p.adSpend) : "—", change(m.adSpend, p?.adSpend)],
            ["Net revenue", money(m.netRevenue), p ? money(p.netRevenue) : "—", change(m.netRevenue, p?.netRevenue)],
            ["Ad spend share of net revenue", formatPercent(m.adSpendRate), p ? formatPercent(p.adSpendRate) : "—", change(m.adSpendRate, p?.adSpendRate, "points")],
            ["Blended ROAS (net revenue ÷ ad spend)", formatMultiple(m.blendedRoas), p ? formatMultiple(p.blendedRoas) : "—", "—"],
            ["Break-even ROAS", formatMultiple(m.breakEvenRoas), p ? formatMultiple(p.breakEvenRoas) : "—", "—"],
            ["Contribution before advertising", money(m.contributionBeforeAds), p ? money(p.contributionBeforeAds) : "—", change(m.contributionBeforeAds, p?.contributionBeforeAds)],
            ["Contribution margin", money(m.contributionMargin), p ? money(p.contributionMargin) : "—", change(m.contributionMargin, p?.contributionMargin)],
          ]
        : [
            ["Net revenue", money(m.netRevenue), p ? money(p.netRevenue) : "—", change(m.netRevenue, p?.netRevenue)],
            ["Contribution margin", money(m.contributionMargin), p ? money(p.contributionMargin) : "—", change(m.contributionMargin, p?.contributionMargin)],
            ["Contribution margin %", formatPercent(m.contributionMarginRate), p ? formatPercent(p.contributionMarginRate) : "—", change(m.contributionMarginRate, p?.contributionMarginRate, "points")],
            ["Orders", formatCount(m.orders), p ? formatCount(p.orders) : "—", change(m.orders, p?.orders)],
            ["Average order value", m.averageOrderValue === null ? "—" : money(m.averageOrderValue), p?.averageOrderValue != null ? money(p.averageOrderValue) : "—", change(m.averageOrderValue, p?.averageOrderValue)],
            ["Refund rate", formatPercent(m.refundRate), p ? formatPercent(p.refundRate) : "—", change(m.refundRate, p?.refundRate, "points")],
            ["Ad spend", money(m.adSpend), p ? money(p.adSpend) : "—", change(m.adSpend, p?.adSpend)],
          ];
    table(
      [
        { header: "Measure", width: width * 0.43 },
        { header: "This period", width: width * 0.2, align: "right" },
        { header: "Previous period", width: width * 0.2, align: "right" },
        { header: "Change", width: width * 0.17, align: "right" },
      ],
      rows.map((r) => ({ cells: r })),
    );
  }

  // ---- Profit breakdown ------------------------------------------------------
  if (input.kind === "summary") {
    sectionTitle("Profit breakdown", "Shares are of net revenue. Contribution margin is not net profit: fixed costs, taxes on profit, interest and depreciation are excluded above it.");
    const share = (v: number, signed = false) => (m.netRevenue > 0 ? formatPercent((signed ? v : Math.abs(v)) / m.netRevenue) : "—");
    const lines: { label: string; amount: number; total?: boolean; result?: boolean; note?: string }[] = [
      { label: "Gross sales", amount: m.grossSales },
      { label: "− Discounts", amount: -m.discounts },
      { label: "− Refunds", amount: -m.refunds },
      { label: "= Net sales", amount: m.netSales, total: true },
      { label: "+ Shipping charged", amount: m.shippingCharged },
      { label: "= Net revenue", amount: m.netRevenue, total: true },
      { label: "− Cost of goods sold", amount: -m.cogs, note: m.completeness.cogs === "partial" || m.completeness.cogs === "missing" ? "incomplete" : undefined },
      { label: "= Gross profit", amount: m.grossProfit, total: true },
      { label: "− Shipping & fulfilment", amount: -m.shippingCosts, note: m.completeness.shipping === "estimated" ? "includes estimates" : m.completeness.shipping === "partial" || m.completeness.shipping === "missing" ? "incomplete" : undefined },
      { label: "− Payment fees", amount: -m.transactionFees, note: m.completeness.fees === "estimated" ? "includes estimates" : m.completeness.fees === "partial" || m.completeness.fees === "missing" ? "incomplete" : undefined },
      { label: "− Advertising", amount: -m.adSpend },
      { label: "− Other variable costs", amount: -m.otherVariableCosts },
      { label: "= Contribution margin", amount: m.contributionMargin, result: true },
      { label: "− Fixed costs recorded", amount: -m.fixedCosts },
      { label: "= Operating profit (estimate)", amount: m.operatingProfit, total: true },
    ];
    table(
      [
        { header: "Line", width: width * 0.5 },
        { header: "Amount", width: width * 0.25, align: "right" },
        { header: "Share", width: width * 0.25, align: "right" },
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
      input.kind === "summary" ? "Top products by net revenue" : "Products",
      "Contribution margin after product cost, shipping and payment fees allocated by line value, and spend of campaigns linked to the product. A dash means some sold lines have no cost.",
    );
    table(
      [
        { header: "Product", width: width * 0.36 },
        { header: "Units", width: width * 0.1, align: "right" },
        { header: "Net revenue", width: width * 0.16, align: "right" },
        { header: "COGS", width: width * 0.14, align: "right" },
        { header: "Contribution", width: width * 0.14, align: "right" },
        { header: "Margin", width: width * 0.1, align: "right" },
      ],
      list.map((r) => ({
        cells: [
          r.sku ? `${r.name} (${r.sku})` : r.name,
          formatCount(r.units),
          money(r.netRevenue),
          r.cogs === null ? "incomplete" : money(r.cogs),
          r.contributionMargin === null ? "—" : money(r.contributionMargin),
          formatPercent(r.contributionMarginRate),
        ],
        tones: [undefined, undefined, undefined, r.cogs === null ? C.caution : undefined, r.contributionMargin !== null && r.contributionMargin < 0 ? C.negative : undefined, undefined],
      })),
    );
    if (input.kind === "products" && input.unallocatedAdSpend > 0) {
      doc.moveDown(0.4);
      doc.font("Sans").fontSize(8).fillColor(C.ink3).text(`${money(input.unallocatedAdSpend)} of ad spend comes from campaigns not linked to a single product and stays at store level.`, left, doc.y, { width });
    }
  }

  // ---- Campaigns ------------------------------------------------------------------
  if (input.kind !== "products" && input.campaigns.length > 0) {
    const list = input.kind === "summary" ? input.campaigns.slice(0, 8) : input.campaigns;
    sectionTitle(
      input.kind === "summary" ? "Top campaigns by spend" : "Campaigns",
      `Platform ROAS uses each platform's own attribution and can count a sale more than once. Break-even ROAS for this period: ${formatMultiple(m.breakEvenRoas)}.`,
    );
    table(
      [
        { header: "Campaign", width: width * 0.4 },
        { header: "Platform", width: width * 0.14 },
        { header: "Spend", width: width * 0.16, align: "right" },
        { header: "Conv. value", width: width * 0.16, align: "right" },
        { header: "ROAS", width: width * 0.14, align: "right" },
      ],
      list.map((c) => {
        const below = m.breakEvenRoas !== null && c.platformRoas !== null && c.platformRoas < m.breakEvenRoas;
        return {
          cells: [c.name, PLATFORM_LABELS[c.platform as Platform] ?? c.platform, money(c.spend), money(c.conversionValue), `${formatMultiple(c.platformRoas)}${below ? " (below break-even)" : ""}`],
          tones: [undefined, undefined, undefined, undefined, below ? C.caution : undefined],
        };
      }),
    );
  }

  // ---- Insights and notes ---------------------------------------------------------
  if (input.kind === "summary" && input.insights.length > 0) {
    sectionTitle("Observations", "Rule-based: each one lists the figures it is based on and describes changes, not causes.");
    for (const insight of input.insights.slice(0, 5)) {
      ensure(40);
      doc.font("Bold").fontSize(9).fillColor(C.ink).text(insight.title, left, doc.y, { width });
      doc.font("Sans").fontSize(8.5).fillColor(C.ink2).text(insight.body, { width });
      doc.fillColor(C.ink3).fontSize(8).text(insight.evidence.map((e) => `${e.label}: ${e.value}`).join(" · "), { width });
      doc.moveDown(0.5);
    }
  }
  if (input.notes.length > 0) {
    sectionTitle("Data quality");
    for (const note of input.notes) {
      ensure(24);
      doc.font("Sans").fontSize(8.5).fillColor(C.ink2).text(`• ${note}`, left, doc.y, { width });
      doc.moveDown(0.2);
    }
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
      `${input.storeName} · ${TITLES[input.kind]} · ${formatDate(input.range.from)} – ${formatDate(input.range.to)}${input.isDemo ? " · SAMPLE DATA" : ""}`,
      left,
      y,
      { width: width * 0.75, lineBreak: false, ellipsis: true },
    );
    doc.text(`Page ${i - pages.start + 1} of ${pages.count}`, left + width * 0.75, y, { width: width * 0.25, align: "right", lineBreak: false });
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}
