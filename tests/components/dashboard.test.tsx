import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataNotices, dataNotices } from "@/components/dashboard/data-notices";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { ProfitBreakdown } from "@/components/dashboard/profit-breakdown";
import { deriveMetrics, EMPTY_TOTALS } from "@/lib/finance/metrics";

vi.mock("@/lib/products/actions", () => ({ updateProductCost: vi.fn(async () => ({ ok: true, unitCostE4: 68_000 })) }));
vi.mock("@/components/ui/toaster", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("KpiTile", () => {
  it("states the direction in text and colours only meaningful changes", () => {
    const { rerender } = render(<KpiTile label="Contribution margin" value="€1,200" delta={{ value: -0.12, text: "−12.0%", polarity: "up" }} deltaContext="vs previous 30 days" />);
    expect(screen.getByText("Down")).toHaveClass("sr-only");
    expect(screen.getByText("−12.0%")).toHaveClass("text-negative-700");

    rerender(<KpiTile label="Discounts" value="€90" delta={{ value: 0.2, text: "+20.0%", polarity: null }} />);
    expect(screen.getByText("Up")).toBeInTheDocument();
    expect(screen.getByText("+20.0%")).toHaveClass("text-ink-2");

    rerender(<KpiTile label="Orders" value="0" delta={{ value: null, text: "", polarity: "up" }} />);
    expect(screen.getByText("No comparison available")).toBeInTheDocument();
  });
});

describe("ProfitBreakdown", () => {
  it("keeps the sign of a negative contribution margin and labels incomplete costs", () => {
    const metrics = deriveMetrics({
      ...EMPTY_TOTALS,
      orders: 2,
      grossSales: 10_000,
      productSalesAfterDiscounts: 10_000,
      salesWithoutCost: 2_000,
      linesWithoutCost: 1,
      cogs: 6_000,
      adSpend: 5_000,
    });
    render(<ProfitBreakdown metrics={metrics} currency="EUR" />);
    const row = screen.getByRole("rowheader", { name: /Contribution margin/ }).closest("tr")!;
    expect(within(row).getByText("-€10.00")).toBeInTheDocument();
    expect(within(row).getByText("-10.0%")).toBeInTheDocument();
    expect(screen.getByText("Incomplete")).toBeInTheDocument();
    expect(screen.getByText(/Contribution margin is not net profit/)).toBeInTheDocument();
  });
});

describe("data notices", () => {
  const store = { currency: "EUR", fee_rule_bps: 150, fee_rule_fixed_minor: 25, default_shipping_cost_minor: 550 };

  it("explains missing costs and estimates with amounts and a way to fix them", () => {
    const metrics = deriveMetrics({
      ...EMPTY_TOTALS,
      orders: 10,
      grossSales: 50_000,
      productSalesAfterDiscounts: 50_000,
      salesWithoutCost: 5_000,
      linesWithoutCost: 3,
      transactionFees: 1_000,
      transactionFeesEstimated: 1_000,
      ordersWithoutShippingCost: 2,
    });
    const notices = dataNotices(metrics, store);
    expect(notices.map((n) => n.key)).toEqual(["cogs", "shipping", "estimates"]);
    render(<DataNotices notices={notices} />);
    expect(screen.getByText(/3 order lines \(€50\.00, 10\.0% of product sales\) have no unit cost/)).toBeInTheDocument();
    expect(screen.getByText(/rule: 1\.50% \+ €0\.25 per order/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add product costs" })).toHaveAttribute("href", "/app/products?filter=missing-cost");
  });

  it("stays silent when the data is complete", () => {
    const metrics = deriveMetrics({ ...EMPTY_TOTALS, orders: 1, grossSales: 1_000, productSalesAfterDiscounts: 1_000, cogs: 400, shippingCosts: 300, transactionFees: 30 });
    expect(dataNotices(metrics, store)).toEqual([]);
  });
});

describe("CostEditor", () => {
  it("edits a missing cost in place and restores focus on Escape", async () => {
    const { CostEditor } = await import("@/components/products/cost-editor");
    const user = userEvent.setup();
    render(<CostEditor productId="00000000-0000-4000-8000-000000000001" productName="Linen tote bag" unitCostE4={null} currency="EUR" />);
    const trigger = screen.getByRole("button", { name: /No cost.*add a unit cost for Linen tote bag/ });
    await user.click(trigger);
    const input = screen.getByLabelText("Unit cost for Linen tote bag, excluding VAT");
    expect(input).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Unit cost for Linen tote bag, excluding VAT")).not.toBeInTheDocument();
  });
});
