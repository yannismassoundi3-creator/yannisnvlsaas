import { currencyDigits } from "./currency";
import { applyBasisPoints, lineCostMinor, mulDivRound } from "./money";

/**
 * Profitability calculator
 * ------------------------
 * All amounts are integers in minor units, unit cost in e4 (see money.ts),
 * rates in basis points (100 bps = 1%).
 *
 * Formulas
 *   Gross sales          = Selling price × Quantity
 *   Discounts            = Gross sales × discount % (or a fixed amount)
 *   Refunds              = Gross sales × refund %   (or a fixed amount)
 *   Net sales            = Gross sales − Discounts − Refunds
 *   COGS                 = Unit cost × Quantity
 *   Payment fees         = (Gross sales − Discounts) × fee % + Fixed fee × Orders
 *                          (fees are charged on the amount paid and are not
 *                          returned when an order is refunded)
 *   Contribution margin  = Net sales − COGS − Payment fees − Shipping costs
 *                          − Advertising − Other variable costs
 *   Contribution margin % = Contribution margin ÷ Net sales
 *
 * Break-even selling price: the lowest price per unit (rounded up to the
 * currency's minor unit) at which contribution margin is zero or positive,
 * assuming quantity, unit cost, shipping, advertising, other costs and fixed
 * amounts stay the same, while percentage discounts, refunds and fees scale
 * with the price.
 *
 * Excluded: VAT / sales tax, fixed operating costs (rent, salaries,
 * subscriptions), taxes on profit, interest and depreciation.
 */

export type Adjustment = { kind: "percent"; basisPoints: number } | { kind: "amount"; minor: number };

export type CalculatorInput = {
  currency: string;
  /** Selling price per unit, excluding VAT. */
  sellingPrice: number;
  quantity: number;
  /** Unit cost in e4, or null when unknown. */
  unitCostE4: number | null;
  discount: Adjustment;
  refunds: Adjustment;
  paymentFeeBasisPoints: number;
  paymentFeeFixedPerOrder: number;
  /** Number of orders the units were sold in (defaults to quantity). */
  orders: number | null;
  shippingCosts: number;
  advertising: number;
  otherVariableCosts: number;
};

export type CalculatorValidationError = { field: keyof CalculatorInput | "discount.value" | "refunds.value"; message: string };

export type CalculatorResult = {
  grossSales: number;
  discounts: number;
  refunds: number;
  netSales: number;
  cogs: number | null;
  paymentFees: number;
  shippingCosts: number;
  advertising: number;
  otherVariableCosts: number;
  contributionMargin: number | null;
  contributionMarginRate: number | null;
  contributionPerUnit: number | null;
  breakEvenPrice: { ok: true; price: number } | { ok: false; reason: "missing_unit_cost" | "no_quantity" | "deductions_exceed_price" };
  warnings: string[];
};

const MAX_QUANTITY = 10_000_000;
const MAX_BPS = 10_000;

export function validateCalculatorInput(input: CalculatorInput): CalculatorValidationError[] {
  const errors: CalculatorValidationError[] = [];
  const nonNegativeInt = (value: number, field: CalculatorValidationError["field"], label: string) => {
    if (!Number.isSafeInteger(value) || value < 0) errors.push({ field, message: `${label} must be zero or more.` });
  };
  nonNegativeInt(input.sellingPrice, "sellingPrice", "Selling price");
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 0 || input.quantity > MAX_QUANTITY) {
    errors.push({ field: "quantity", message: `Quantity must be a whole number between 0 and ${MAX_QUANTITY.toLocaleString("en-GB")}.` });
  }
  if (input.unitCostE4 !== null) nonNegativeInt(input.unitCostE4, "unitCostE4", "Unit cost");
  for (const [adj, field, label] of [
    [input.discount, "discount.value", "Discount"],
    [input.refunds, "refunds.value", "Refunds"],
  ] as const) {
    if (adj.kind === "percent") {
      if (!Number.isSafeInteger(adj.basisPoints) || adj.basisPoints < 0 || adj.basisPoints > MAX_BPS) {
        errors.push({ field, message: `${label} must be between 0% and 100%.` });
      }
    } else {
      nonNegativeInt(adj.minor, field, label);
    }
  }
  if (!Number.isSafeInteger(input.paymentFeeBasisPoints) || input.paymentFeeBasisPoints < 0 || input.paymentFeeBasisPoints > MAX_BPS) {
    errors.push({ field: "paymentFeeBasisPoints", message: "Payment fee must be between 0% and 100%." });
  }
  nonNegativeInt(input.paymentFeeFixedPerOrder, "paymentFeeFixedPerOrder", "Fixed fee per order");
  if (input.orders !== null) {
    if (!Number.isSafeInteger(input.orders) || input.orders < 0 || input.orders > MAX_QUANTITY) {
      errors.push({ field: "orders", message: "Orders must be a whole number of zero or more." });
    }
  }
  nonNegativeInt(input.shippingCosts, "shippingCosts", "Shipping costs");
  nonNegativeInt(input.advertising, "advertising", "Advertising");
  nonNegativeInt(input.otherVariableCosts, "otherVariableCosts", "Other variable costs");
  try {
    currencyDigits(input.currency);
  } catch {
    errors.push({ field: "currency", message: "Unsupported currency." });
  }
  return errors;
}

function adjustmentAmount(adj: Adjustment, base: number): number {
  return adj.kind === "percent" ? applyBasisPoints(base, adj.basisPoints) : adj.minor;
}

export function calculateProfitability(input: CalculatorInput): CalculatorResult {
  const errors = validateCalculatorInput(input);
  if (errors.length > 0) {
    throw new RangeError(`Invalid calculator input: ${errors.map((e) => e.message).join(" ")}`);
  }
  const warnings: string[] = [];
  const orders = input.orders ?? input.quantity;
  const { grossSales, discounts, refunds, netSales, paymentFees, cogs, contributionMargin } = amountsAt(
    input,
    input.sellingPrice,
    orders,
  );

  if (discounts > grossSales) warnings.push("Discounts are larger than gross sales.");
  if (refunds > grossSales - discounts) warnings.push("Refunds are larger than the amount paid after discounts.");
  if (cogs === null) warnings.push("Add a unit cost to calculate contribution margin.");

  return {
    grossSales,
    discounts,
    refunds,
    netSales,
    cogs,
    paymentFees,
    shippingCosts: input.shippingCosts,
    advertising: input.advertising,
    otherVariableCosts: input.otherVariableCosts,
    contributionMargin,
    contributionMarginRate: contributionMargin !== null && netSales > 0 ? contributionMargin / netSales : null,
    contributionPerUnit:
      contributionMargin !== null && input.quantity > 0 ? mulDivRound(contributionMargin, 1, input.quantity) : null,
    breakEvenPrice: breakEvenPrice(input, orders),
    warnings,
  };
}

/** Every amount for a given selling price, using the same rounding as the result. */
function amountsAt(input: CalculatorInput, sellingPrice: number, orders: number) {
  const grossSales = mulDivRound(sellingPrice, input.quantity, 1);
  const discounts = adjustmentAmount(input.discount, grossSales);
  const refunds = adjustmentAmount(input.refunds, grossSales);
  const netSales = grossSales - discounts - refunds;
  const amountPaid = grossSales - discounts;
  const paymentFees =
    applyBasisPoints(Math.max(amountPaid, 0), input.paymentFeeBasisPoints) + input.paymentFeeFixedPerOrder * orders;
  const cogs = input.unitCostE4 === null ? null : lineCostMinor(input.unitCostE4, input.quantity, input.currency);
  const contributionMargin =
    cogs === null ? null : netSales - cogs - paymentFees - input.shippingCosts - input.advertising - input.otherVariableCosts;
  return { grossSales, discounts, refunds, netSales, paymentFees, cogs, contributionMargin };
}

/**
 * Lowest price p (minor units) with contribution margin >= 0.
 *
 * With d, r, f the discount, refund and fee rates and q the quantity:
 *   CM(p) = q·p·(1 − d − r − f·(1 − d)) − (D + R − f·D + COGS + F·orders + S + A + O)
 * where D and R are fixed discount/refund amounts (zero when given as rates).
 * Solved exactly with integers scaled by 10^8 (rates are in basis points).
 */
function breakEvenPrice(input: CalculatorInput, orders: number): CalculatorResult["breakEvenPrice"] {
  if (input.unitCostE4 === null) return { ok: false, reason: "missing_unit_cost" };
  if (input.quantity === 0) return { ok: false, reason: "no_quantity" };

  const BPS = 10_000n;
  const d = input.discount.kind === "percent" ? BigInt(input.discount.basisPoints) : 0n;
  const r = input.refunds.kind === "percent" ? BigInt(input.refunds.basisPoints) : 0n;
  const f = BigInt(input.paymentFeeBasisPoints);
  const fixedDiscount = input.discount.kind === "amount" ? BigInt(input.discount.minor) : 0n;
  const fixedRefund = input.refunds.kind === "amount" ? BigInt(input.refunds.minor) : 0n;
  const q = BigInt(input.quantity);

  // Coefficient of p, scaled by BPS²: q·(BPS·(BPS − d − r) − f·(BPS − d))
  const a = q * (BPS * (BPS - d - r) - f * (BPS - d));
  if (a <= 0n) return { ok: false, reason: "deductions_exceed_price" };

  const cogs = BigInt(lineCostMinor(input.unitCostE4, input.quantity, input.currency));
  const fixedCosts =
    fixedDiscount +
    fixedRefund +
    cogs +
    BigInt(input.paymentFeeFixedPerOrder) * BigInt(orders) +
    BigInt(input.shippingCosts) +
    BigInt(input.advertising) +
    BigInt(input.otherVariableCosts);
  // Constant term scaled by BPS²; the fee on a fixed discount reduces costs.
  const b = fixedCosts * BPS * BPS - f * fixedDiscount * BPS;
  if (b <= 0n) return { ok: true, price: 0 };

  // Ceiling of the exact solution, then settle on the lowest integer price
  // whose margin is non-negative under the same rounding used for display.
  let price = Number((b + a - 1n) / a);
  const cmAt = (p: number) => amountsAt(input, p, orders).contributionMargin ?? -1;
  for (let i = 0; i < 1000 && cmAt(price) < 0; i++) price += 1;
  for (let i = 0; i < 1000 && price > 0 && cmAt(price - 1) >= 0; i++) price -= 1;
  return { ok: true, price };
}
