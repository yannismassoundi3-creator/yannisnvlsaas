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
import { applyBasisPoints, lineCostMinor } from "@/lib/finance/money";
import { catalogCommon } from "@/i18n/messages/catalog-common";
import { transactionsMessages } from "@/i18n/messages/catalog-transactions";
import { getFormat, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: transactionsMessages[await getLocale()].metaOrderTitle };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function OrderPage({ params }: PageProps<"/[lang]/app/transactions/orders/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[560px] rounded-lg" />}>
      <OrderDetail params={params} />
    </Suspense>
  );
}

async function OrderDetail({ params }: Pick<PageProps<"/[lang]/app/transactions/orders/[id]">, "params">) {
  const [{ id }, ws, locale, f] = await Promise.all([params, requireStore(), getLocale(), getFormat()]);
  const t = transactionsMessages[locale];
  const c = catalogCommon[locale];
  if (!UUID_RE.test(id)) notFound();
  const order = await getOrder(id);
  if (!order) notFound();
  const store = ws.activeStore;
  const money = (v: number) => f.money(v, store.currency);

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
      ? { amount: order.shippingCostMinor, label: t.recorded }
      : store.default_shipping_cost_minor !== null
        ? { amount: store.default_shipping_cost_minor, label: t.estimatedDefault }
        : { amount: null, label: t.missing };
  const hasFeeRule = store.fee_rule_bps !== null || store.fee_rule_fixed_minor !== null;
  const amountPaid = Math.max(netSales + order.shippingChargedMinor + order.taxesMinor, 0);
  const fees =
    order.transactionFeesMinor !== null
      ? { amount: order.transactionFeesMinor, label: t.recorded }
      : hasFeeRule
        ? { amount: applyBasisPoints(amountPaid, store.fee_rule_bps ?? 0) + (store.fee_rule_fixed_minor ?? 0), label: t.estimatedFeeRule }
        : { amount: null, label: t.missing };
  const refunds = order.refunds.reduce((a, r) => a + r.amountMinor, 0);
  const complete = cogsKnown && shipping.amount !== null && fees.amount !== null;
  const contribution = complete ? netSales + order.shippingChargedMinor - refunds - cogs - (shipping.amount ?? 0) - (fees.amount ?? 0) : null;
  const revenue = netSales + order.shippingChargedMinor - refunds;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/app/transactions" className="hover:underline">
            {t.title}
          </Link>
        }
        title={t.orderTitle(order.externalId)}
        description={
          <span>
            {f.dateTime(order.orderedAt, store.timezone)} · {t.orderSources[order.source] ?? order.source}
            {order.importJobId ? (
              <>
                {" · "}
                <Link href={`/app/imports/${order.importJobId}` as Route} className="text-emerald-700 hover:underline">
                  {t.viewImport}
                </Link>
              </>
            ) : null}
          </span>
        }
        actions={ws.entitlements.canWrite ? <DeleteOrderButton orderId={order.id} orderNumber={order.externalId} /> : null}
      />

      <Card>
        <CardHeader
          title={t.lines}
          description={order.convertedFromTaxInclusive ? t.linesTaxConverted : t.amountsExcludeTax}
        />
        <TableContainer className="mt-3">
          <Table>
            <caption className="sr-only">{t.linesCaption}</caption>
            <THead>
              <TR>
                <TH>{t.colProduct}</TH>
                <TH numeric>{t.colQty}</TH>
                <TH numeric>{t.colGross}</TH>
                <TH numeric>{t.colDiscount}</TH>
                <TH numeric>{t.colNet}</TH>
                <TH numeric>{t.colUnitCostUsed}</TH>
                <TH numeric>{t.colCogs}</TH>
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
                    <div className="text-xs text-ink-3">{l.sku ?? c.noSku}</div>
                  </TD>
                  <TD numeric>{f.count(l.quantity)}</TD>
                  <TD numeric>{money(l.grossMinor)}</TD>
                  <TD numeric>{l.discountMinor ? money(-l.discountMinor) : "—"}</TD>
                  <TD numeric>{money(l.net)}</TD>
                  <TD numeric>
                    {l.costUsed === null ? (
                      <Badge tone="caution">{c.noCost}</Badge>
                    ) : (
                      <span className="inline-flex flex-col items-end">
                        {f.unitCost(l.costUsed, store.currency)}
                        <span className="text-xs text-ink-3">{l.unitCostE4 !== null ? t.onThisOrder : t.productCurrentCost}</span>
                      </span>
                    )}
                  </TD>
                  <TD numeric>{l.cogs === null ? "—" : money(l.cogs)}</TD>
                </TR>
              ))}
            </TBody>
            <TFoot>
              <TR>
                <TD>{t.total}</TD>
                <TD numeric>{f.count(lines.reduce((a, l) => a + l.quantity, 0))}</TD>
                <TD numeric>{money(lines.reduce((a, l) => a + l.grossMinor, 0))}</TD>
                <TD numeric>{money(-lines.reduce((a, l) => a + l.discountMinor, 0))}</TD>
                <TD numeric>{money(netSales)}</TD>
                <TD />
                <TD numeric>{cogsKnown ? money(cogs) : c.incomplete}</TD>
              </TR>
            </TFoot>
          </Table>
        </TableContainer>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.economics} description={t.economicsDescription} />
          <table className="mt-2 w-full text-sm">
            <caption className="sr-only">{t.economics}</caption>
            <tbody>
              {[
                { label: t.netSales, value: money(netSales) },
                { label: t.shippingCharged, value: money(order.shippingChargedMinor) },
                { label: t.refundsAllDates, value: refunds ? money(-refunds) : "—" },
                { label: t.cogs, value: cogsKnown ? money(-cogs) : c.incomplete },
                { label: t.shippingCostRow(shipping.label), value: shipping.amount === null ? t.missing : money(-shipping.amount) },
                { label: t.feesRow(fees.label), value: fees.amount === null ? t.missing : money(-fees.amount) },
                { label: t.taxesCollected, value: money(order.taxesMinor), muted: true },
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
                  {t.contributionBeforeAds}
                </th>
                <td className="py-2.5 pr-5 text-right font-semibold tabular">
                  {contribution === null ? (
                    <span className="font-normal text-ink-3">{c.incomplete}</span>
                  ) : (
                    <>
                      {money(contribution)}
                      {revenue > 0 ? <span className="ml-2 text-xs font-normal text-ink-3">{f.percent(contribution / revenue)}</span> : null}
                    </>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t.actualCosts} description={t.actualCostsDescription} />
            <CardBody>
              <OrderCostsForm orderId={order.id} currency={store.currency} shippingCostMinor={order.shippingCostMinor} feesMinor={order.transactionFeesMinor} disabled={!ws.entitlements.canWrite} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t.refunds} description={t.refundsDescription} />
            <CardBody>
              {order.refunds.length === 0 ? (
                <p className="text-sm text-ink-3">{t.noRefundsForOrder}</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {order.refunds.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        {f.dateTime(r.refundedAt, store.timezone)}
                        {r.dateEstimated ? (
                          <Badge tone="info" className="ml-2">
                            {t.orderDate}
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
