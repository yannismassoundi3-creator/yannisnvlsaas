import { mulDivRound, sumMinor } from "./money";

/**
 * Tax-inclusive price normalisation
 * ---------------------------------
 * Many European stores show prices including VAT. Narixia stores every amount
 * excluding tax so that net sales and margins are not inflated by tax that is
 * passed on to the authorities.
 *
 * Method: the order's tax is removed proportionally from every tax-inclusive
 * component (line sales, discounts, shipping charged, refunds), using the
 * order's effective rate: factor = (total charged - tax) / total charged.
 * Rounding residue (at most a few minor units) is assigned to the largest line
 * so the converted components add up exactly to the tax-exclusive total.
 *
 * Limitation (documented in docs/METRICS.md): with mixed tax rates inside one
 * order, the split between lines is approximate; the order total is exact.
 */

export type TaxInclusiveOrder = {
  lines: { gross: number; discount: number }[];
  /** Discount applied to the order as a whole (not attributed to a line). */
  orderDiscount: number;
  shippingCharged: number;
  refunds: number[];
  /** Total tax contained in the order total. */
  taxes: number;
};

export type TaxExclusiveOrder = TaxInclusiveOrder;

export type TaxNormalizationError = "tax_exceeds_total" | "non_positive_total" | "negative_amount";

export type TaxNormalizationResult =
  | { ok: true; order: TaxExclusiveOrder }
  | { ok: false; error: TaxNormalizationError };

/** Total charged to the customer for a tax-inclusive order. */
export function orderTotalCharged(order: Pick<TaxInclusiveOrder, "lines" | "orderDiscount" | "shippingCharged">): number {
  const gross = sumMinor(order.lines.map((l) => l.gross));
  const discounts = sumMinor(order.lines.map((l) => l.discount));
  return gross - discounts - order.orderDiscount + order.shippingCharged;
}

export function removeIncludedTax(order: TaxInclusiveOrder): TaxNormalizationResult {
  const amounts = [
    ...order.lines.flatMap((l) => [l.gross, l.discount]),
    order.orderDiscount,
    order.shippingCharged,
    order.taxes,
    ...order.refunds,
  ];
  if (amounts.some((a) => a < 0)) return { ok: false, error: "negative_amount" };

  if (order.taxes === 0) {
    return { ok: true, order: structuredClone(order) };
  }

  const total = orderTotalCharged(order);
  if (total <= 0) return { ok: false, error: "non_positive_total" };
  if (order.taxes > total) return { ok: false, error: "tax_exceeds_total" };

  const exTaxTotal = total - order.taxes;
  const scale = (amount: number) => mulDivRound(amount, exTaxTotal, total);

  const lines = order.lines.map((l) => ({ gross: scale(l.gross), discount: scale(l.discount) }));
  const orderDiscount = scale(order.orderDiscount);
  let shippingCharged = scale(order.shippingCharged);

  const converted = orderTotalCharged({ lines, orderDiscount, shippingCharged });
  const residue = exTaxTotal - converted;
  if (residue !== 0) {
    // Assign rounding residue to the largest line (or shipping if there are no lines).
    if (lines.length > 0) {
      let largest = 0;
      lines.forEach((l, i) => {
        if (l.gross > lines[largest].gross) largest = i;
      });
      lines[largest] = { ...lines[largest], gross: lines[largest].gross + residue };
    } else {
      shippingCharged += residue;
    }
  }

  return {
    ok: true,
    order: {
      lines,
      orderDiscount,
      shippingCharged,
      refunds: order.refunds.map(scale),
      taxes: order.taxes,
    },
  };
}
