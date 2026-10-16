import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DeleteOrderButton, OrderCostsForm } from "@/components/transactions/transaction-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableContainer, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { requireStore } from "@/lib/auth/workspace";
import { getOrder } from "@/lib/data/transactions";
import { formatDateTime } from "@/lib/dates";
import { formatCount, formatPercent } from "@/lib/finance/format";
import { applyBasisPoints, formatMoney, formatUnitCost, lineCostMinor } from "@/lib/finance/money";

export const metadata: Metadata = { title: "Order" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE: Record<string, string> = { csv: "Imported", manual: "Entered manually", demo: "Sample data", shopify: "Shopify" };

export default function OrderPage({ params }: PageProps<"/app/transactions/orders/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[560px] rounded-lg" />}>
      <OrderDetail params={params} />
    </Suspense>
  );
}

async function OrderDetail({ params }: Pick<PageProps<"/app/transactions/orders/[id]">, "params">) {
  const [{ id }, ws] = await Promise.all([params, requireStore()]);
  if (!UUID_RE.test(id)) notFound();
  const order = await getOrder(id);
  if (!order) notFound();
  const store = ws.activeStore;
  const money = (v: number) => formatMoney(v, store.currency);

  // Same rules as the reports: recorded value, else the store's estimate rule, else missing.
  const lines = order.lines.map((l) => {
    const cost = l.unitCostE4 ?? l.productCostE4;
    return { ...l, net: l.grossMinor - l.discountMinor, costUsed: cost, cogs: cost === null ? null : lineCostMinor(cost, l.quantity, store.currency) };
  });
  const netSales = lines.reduce((a, l) => a + l.net, 0);
  const cogsKnown = lines.every((l) => l.cogs !== null);
  const cogs = lines.reduce((a, l) => a + (l.cogs ?? 0), 0);
  const shipping =
    order.shippingCostMinor !== null
      ? { amount: order.shippingCostMinor, label: "Recorded" }
      : store.default_shipping_cost_minor !== null
        ? { amount: store.default_shipping_cost_minor, label: "Estimated (default)" }
        : { amount: null, label: "Missing" };
  const hasFeeRule = store.fee_rule_bps !== null || store.fee_rule_fixed_minor !== null;
  const amountPaid = Math.max(netSales + order.shippingChargedMinor + order.taxesMinor, 0);
  const fees =
    order.transactionFeesMinor !== null
      ? { amount: order.transactionFeesMinor, label: "Recorded" }
      : hasFeeRule
        ? { amount: applyBasisPoints(amountPaid, store.fee_rule_bps ?? 0) + (store.fee_rule_fixed_minor ?? 0), label: "Estimated (fee rule)" }
        : { amount: null, label: "Missing" };
  const refunds = order.refunds.reduce((a, r) => a + r.amountMinor, 0);
  const complete = cogsKnown && shipping.amount !== null && fees.amount !== null;
  const contribution = complete ? netSales + order.shippingChargedMinor - refunds - cogs - (shipping.amount ?? 0) - (fees.amount ?? 0) : null;
  const revenue = netSales + order.shippingChargedMinor - refunds;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/app/transactions" className="hover:underline">
            Transactions & costs
          </Link>
        }
        title={`Order ${order.externalId}`}
        description={
          <span>
            {formatDateTime(order.orderedAt, store.timezone)} · {SOURCE[order.source] ?? order.source}
            {order.importJobId ? (
              <>
                {" · "}
                <Link href={`/app/imports/${order.importJobId}` as Route} className="text-emerald-700 hover:underline">
                  View import
                </Link>
              </>
            ) : null}
          </span>
        }
        actions={ws.entitlements.canWrite ? <DeleteOrderButton orderId={order.id} orderNumber={order.externalId} /> : null}
      />

      <Card>
        <CardHeader
          title="Lines"
          description={order.convertedFromTaxInclusive ? "Prices were entered including tax; the order's tax was removed, so amounts below exclude tax." : "Amounts exclude tax."}
        />
        <TableContainer className="mt-3">
          <Table>
            <caption className="sr-only">Order lines</caption>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH numeric>Qty</TH>
                <TH numeric>Gross</TH>
                <TH numeric>Discount</TH>
                <TH numeric>Net</TH>
                <TH numeric>Unit cost used</TH>
                <TH numeric>COGS</TH>
              </TR>
            </THead>
            <TBody>
              {lines.map((l) => (
                <TR key={l.id}>
                  <TD>
                    {l.productId ? (
                      <Link href={`/app/products/${l.productId}` as Route} className="font-medium text-ink hover:underline">
                        {l.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink">{l.name}</span>
                    )}
                    <div className="text-xs text-ink-3">{l.sku ?? "No SKU"}</div>
                  </TD>
                  <TD numeric>{formatCount(l.quantity)}</TD>
                  <TD numeric>{money(l.grossMinor)}</TD>
                  <TD numeric>{l.discountMinor ? money(-l.discountMinor) : "—"}</TD>
                  <TD numeric>{money(l.net)}</TD>
                  <TD numeric>
                    {l.costUsed === null ? (
                      <Badge tone="caution">No cost</Badge>
                    ) : (
                      <span className="inline-flex flex-col items-end">
                        {formatUnitCost(l.costUsed, store.currency)}
                        <span className="text-xs text-ink-3">{l.unitCostE4 !== null ? "On this order" : "Product's current cost"}</span>
                      </span>
                    )}
                  </TD>
                  <TD numeric>{l.cogs === null ? "—" : money(l.cogs)}</TD>
                </TR>
              ))}
            </TBody>
            <TFoot>
              <TR>
                <TD>Total</TD>
                <TD numeric>{formatCount(lines.reduce((a, l) => a + l.quantity, 0))}</TD>
                <TD numeric>{money(lines.reduce((a, l) => a + l.grossMinor, 0))}</TD>
                <TD numeric>{money(-lines.reduce((a, l) => a + l.discountMinor, 0))}</TD>
                <TD numeric>{money(netSales)}</TD>
                <TD />
                <TD numeric>{cogsKnown ? money(cogs) : "Incomplete"}</TD>
              </TR>
            </TFoot>
          </Table>
        </TableContainer>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Order economics" description="Before advertising, which is measured per campaign and day, not per order." />
          <table className="mt-2 w-full text-sm">
            <caption className="sr-only">Order economics</caption>
            <tbody>
              {[
                { label: "Net sales", value: money(netSales) },
                { label: "Shipping charged", value: money(order.shippingChargedMinor) },
                { label: "Refunds (all dates)", value: refunds ? money(-refunds) : "—" },
                { label: "Cost of goods sold", value: cogsKnown ? money(-cogs) : "Incomplete" },
                { label: `Shipping cost · ${shipping.label}`, value: shipping.amount === null ? "Missing" : money(-shipping.amount) },
                { label: `Payment fees · ${fees.label}`, value: fees.amount === null ? "Missing" : money(-fees.amount) },
                { label: "Taxes collected (not revenue)", value: money(order.taxesMinor), muted: true },
              ].map((row) => (
                <tr key={row.label} className="border-t border-line">
                  <th scope="row" className={`py-2 pl-5 text-left font-normal ${row.muted ? "text-ink-3" : "text-ink"}`}>
                    {row.label}
                  </th>
                  <td className={`py-2 pr-5 text-right tabular ${row.muted ? "text-ink-3" : ""}`}>{row.value}</td>
                </tr>
              ))}
              <tr className="border-t border-line bg-emerald-50/60">
                <th scope="row" className="py-2.5 pl-5 text-left font-semibold text-ink">
                  Contribution before advertising
                </th>
                <td className="py-2.5 pr-5 text-right font-semibold tabular">
                  {contribution === null ? (
                    <span className="font-normal text-ink-3">Incomplete</span>
                  ) : (
                    <>
                      {money(contribution)}
                      {revenue > 0 ? <span className="ml-2 text-xs font-normal text-ink-3">{formatPercent(contribution / revenue)}</span> : null}
                    </>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Actual costs" description="Recorded values replace estimates for this order in every report." />
            <CardBody>
              <OrderCostsForm orderId={order.id} currency={store.currency} shippingCostMinor={order.shippingCostMinor} feesMinor={order.transactionFeesMinor} disabled={!ws.entitlements.canWrite} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Refunds" description="Counted on the day each refund was made." />
            <CardBody>
              {order.refunds.length === 0 ? (
                <p className="text-sm text-ink-3">No refunds for this order.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {order.refunds.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        {formatDateTime(r.refundedAt, store.timezone)}
                        {r.dateEstimated ? (
                          <Badge tone="info" className="ml-2">
                            Order date
                          </Badge>
                        ) : null}
                        {r.reason ? <span className="block text-xs text-ink-3">{r.reason}</span> : null}
                      </span>
                      <span className="tabular">{money(r.amountMinor)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
