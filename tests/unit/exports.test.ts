import { describe, expect, it } from "vitest";
import { escapeCsvCell, fileSlug, toCsv } from "@/lib/csv";
import { deriveMetrics, EMPTY_TOTALS } from "@/lib/finance/metrics";
import { renderPdfReport } from "@/lib/reports/pdf";

describe("CSV export safety", () => {
  it("neutralises cells that spreadsheets would run as formulas", () => {
    expect(escapeCsvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(escapeCsvCell("+33 6 12")).toBe("'+33 6 12");
    expect(escapeCsvCell("-2+3")).toBe("'-2+3");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell("\tcmd")).toBe("'\tcmd");
  });

  it("keeps numbers and decimals as plain values, quotes separators", () => {
    expect(escapeCsvCell(-12.5)).toBe("-12.5");
    expect(escapeCsvCell({ decimal: "-1234.50" })).toBe("-1234.50");
    expect(() => escapeCsvCell({ decimal: "=1+1" })).toThrow();
    expect(escapeCsvCell('Tote, "large"')).toBe('"Tote, ""large"""');
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(true)).toBe("true");
  });

  it("writes a BOM and CRLF line ends", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("﻿a,b\r\n1,x\r\n");
    expect(fileSlug("Atelier Camille / Été 2026")).toBe("atelier-camille-ete-2026");
  });
});

describe("PDF reports", () => {
  it("renders a labelled sample-store report as a valid PDF", async () => {
    const metrics = deriveMetrics({ ...EMPTY_TOTALS, orders: 3, units: 4, grossSales: 12_000, cogs: 4_000, productSalesAfterDiscounts: 12_000, adSpend: 1_000 });
    const pdf = await renderPdfReport({
      kind: "summary",
      storeName: "Sample store",
      isDemo: true,
      currency: "EUR",
      timezone: "Europe/Paris",
      range: { from: "2026-09-01", to: "2026-09-30" },
      comparison: null,
      generatedAt: "1 Oct 2026, 09:00",
      metrics,
      previous: null,
      products: [{ name: "=cmd|' /C calc'!A0", sku: null, units: 4, netRevenue: 12_000, cogs: 4_000, contributionMargin: 7_000, contributionMarginRate: 0.58 }],
      campaigns: [],
      insights: [],
      notes: ["Example note."],
      unallocatedAdSpend: 0,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5_000);
  });
});
