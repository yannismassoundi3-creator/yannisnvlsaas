# Metrics and calculation rules

Narixia is an analytics and decision-support tool, not accounting software. This
document is the human-readable version of the rules implemented in:

| Rule set | Source of truth |
| --- | --- |
| Store-level formulas and the glossary text | `src/lib/finance/metrics.ts` (`deriveMetrics`, `DEFINITIONS`) |
| Aggregation rules (dates, costs, estimates, product allocation) | `src/lib/analytics/reference.ts` (TypeScript reference) and the `report_*` SQL functions in `supabase/migrations/20261016100400_reporting.sql` and `…100500_app_queries.sql` |
| Tax-inclusive prices | `src/lib/finance/tax.ts` |
| Money representation and rounding | `src/lib/finance/money.ts`, `src/lib/finance/decimal.ts` |
| Calculator and break-even price | `src/lib/finance/calculator.ts` |
| Insights | `src/lib/finance/insights.ts` |

The SQL functions and the TypeScript reference must agree exactly: `tests/db/reporting.test.ts`
loads a generated dataset into Postgres and compares every total, daily series, product row and
campaign row with the reference implementation.

## Money

- Amounts are integers in the currency's minor unit (`1999` EUR = €19.99, `1999` JPY = ¥1,999).
  Currencies with 0, 2 or 3 decimals are supported through `Intl` currency data.
- Unit costs are integers scaled by 10⁴ of the major unit ("e4"): €0.0450 is stored as `450`.
  Bulk purchase costs often have sub-cent precision; rounding them to cents would distort COGS at volume.
- Rounding is half away from zero everywhere, matching PostgreSQL's `round(numeric)`, so the
  application, the database, CSV exports and PDF reports agree to the minor unit.
- Decimal input is parsed exactly (BigInt), never through floating point. Scientific notation,
  several signs and values above 10 billion are rejected.
- Proportional allocations use the largest-remainder method, so allocated parts always add up to the total.

## Store-level metrics

All amounts **exclude sales tax / VAT** (see [Tax](#tax-inclusive-prices)).

| Metric | Formula |
| --- | --- |
| Gross sales | Unit price × quantity, summed over all order lines |
| Discounts | Line discounts + order discounts |
| Refunds | Refunded amounts, excluding tax |
| **Net sales** | Gross sales − Discounts − Refunds |
| Shipping charged | Shipping paid by customers |
| **Net revenue** | Net sales + Shipping charged (the base for every margin percentage) |
| Cost of goods sold (COGS) | Unit cost × quantity sold, for lines with a known cost |
| Gross profit | Net revenue − COGS |
| Shipping & fulfilment | Recorded shipping costs + estimates from the store's default rule + shipping/fulfilment expenses |
| Payment fees | Recorded fees + estimates from the store's fee rule + payment-fee expenses |
| Advertising | Daily campaign spend |
| Other variable costs | Expenses marked variable in other categories (packaging, marketplace commissions…) |
| **Contribution margin** | Gross profit − Shipping − Payment fees − Advertising − Other variable costs |
| Contribution margin % | Contribution margin ÷ Net revenue |
| Fixed costs | Expenses marked fixed (software, rent, salaries…) |
| Operating profit (estimate) | Contribution margin − Fixed costs recorded in Narixia |
| Orders | Count of orders placed in the period |
| Average order value | (Gross sales − Discounts) ÷ Orders |
| Refund rate | Refunds ÷ Gross sales |
| Blended ROAS | Net revenue ÷ Ad spend |
| Break-even ROAS | 1 ÷ (Contribution before advertising ÷ Net revenue) |
| Platform ROAS | Conversion value reported by the platform ÷ Ad spend (platform attribution, often over-counts) |

Narixia **never labels contribution margin as net profit**. It does not calculate net profit,
cash flow or ROI; the glossary (`/glossary`) explains why and what each would require.

A ratio whose denominator is zero is shown as "—", never as 0% or infinity.

## Aggregation rules

- **Dates.** Orders count on the local date (store time zone) they were placed. Refunds count on
  their own local date when known; otherwise on the order date, flagged as estimated.
- **COGS.** The order line's cost snapshot (the cost recorded when the order was imported or
  entered) is used first, so later cost changes do not rewrite history; otherwise the product's
  current unit cost. Lines with neither are reported as **missing cost**: they are never assumed to be free.
- **Shipping cost.** Recorded value, else the store's default shipping cost (estimated), else missing.
- **Payment fees.** Recorded value, else the store's fee rule (percentage of the amount the customer
  paid including tax, plus a fixed fee per order; estimated), else missing.
- **Expenses.** Variable expenses in the shipping/fulfilment category add to shipping costs, those in
  the payment-fees category add to payment fees, other variable expenses go to other variable costs,
  and fixed expenses go to fixed costs.
- **Comparison.** The previous period has the same number of days and ends the day before the
  selected period starts. When it falls outside the plan's history window, no comparison is shown.

### Completeness

Each cost family carries a completeness state shown next to the figure and in reports:

| State | Meaning |
| --- | --- |
| complete | Every order or line has a recorded value |
| estimated | Values exist for every order, some from the store's rules |
| partial | Some orders or lines have no value at all |
| missing | No order or line has a value |
| not applicable | No orders in the period |

When COGS is partial, the dashboard states how many lines lack a cost and the share of product sales they
represent, and links to the filtered product list.

## Product-level metrics

On the Products page and in product reports:

- Order-level amounts (shipping charged, shipping cost, payment fees and order-level refunds) are
  allocated to the order's lines **by net line sales**, using largest remainders (ties go to the earlier line).
- Advertising is attributed to a product **only through campaigns the merchant linked to that product**
  (Advertising → Campaigns → product selector, which defaults to "Several products / store-wide"). All
  other spend stays at store level, and the Advertising page shows how much of the spend is linked.
  Narixia does not spread store-wide spend over products by revenue or units: that would invent a
  relationship the data does not show.
- A product's contribution margin is shown as "—" when any of its sold lines has no cost.

## Tax-inclusive prices

Stores whose prices include VAT (`prices_include_tax`) store every amount excluding tax. For each order:

```
factor = (total charged − tax) / total charged
```

applied to line sales, discounts, shipping charged and refunds. Rounding residue (a few minor units at most)
is assigned to the largest line so the converted components add up exactly to the tax-exclusive total.

**Limitation:** with several tax rates inside one order (e.g. 20% and 5.5%), the split between lines is
approximate; the order total is exact. An order whose tax exceeds its total, or whose total is not positive,
is rejected at import with an explanation.

Refunds exported by Shopify include tax even when prices do not; the import option "Refunded amounts include
tax" (on by default) removes it with the order's effective rate.

## Calculator and break-even price

The calculator (`/app/calculator` and the public `/tools/profit-margin-calculator`) uses the same money model.

```
Gross sales          = Selling price × Quantity
Discounts            = Gross sales × discount %       (or a fixed amount)
Refunds              = Gross sales × refund %         (or a fixed amount)
Net sales            = Gross sales − Discounts − Refunds
COGS                 = Unit cost × Quantity
Payment fees         = (Gross sales − Discounts) × fee % + Fixed fee × Orders
Contribution margin  = Net sales − COGS − Payment fees − Shipping − Advertising − Other variable costs
Contribution margin %= Contribution margin ÷ Net sales
```

Payment fees are charged on the amount paid and are not returned when an order is refunded.

**Break-even selling price:** the lowest price per unit, rounded up to the currency's minor unit, at which the
contribution margin is zero or positive, assuming quantity, unit cost, shipping, advertising, other costs and
fixed amounts stay the same while percentage discounts, refunds and fees scale with the price. It is solved
exactly with scaled integers. When no price can break even (percentages add up to 100% or more), the
calculator says so instead of showing a number.

Excluded from the calculator: VAT, fixed operating costs, taxes on profit, interest and depreciation.

## Insights

Insights are deterministic rules (`buildInsights`). Each one lists the figures it is based on and describes
what changed together; none claims that one change caused another. Thresholds (`INSIGHT_THRESHOLDS`) are
conservative to avoid noise on small stores.

| Insight | Fires when |
| --- | --- |
| Negative contribution margin | Net revenue > 0 and contribution margin < 0 |
| Missing costs | Lines without cost represent ≥ 5% of product sales (attention from 10%) |
| Ad spend outpacing revenue | Ad spend grew ≥ 5% and at least 10 points faster than net revenue, with ad spend ≥ 2% of revenue |
| Refund rate up | Refund rate rose ≥ 1.5 points, with refunds ≥ 0.5% of gross sales |
| Discounts up | Discount share of gross sales rose ≥ 3 points |
| Product margin down | A product with ≥ 5% of net revenue in both periods lost ≥ 5 points of contribution margin %; lists what moved at the same time (discounts, refunds, linked ad spend) |
| Campaigns below break-even | Campaigns with ≥ 5% of spend whose platform ROAS is below the store's break-even ROAS |
| Estimated values | Shipping costs or payment fees include estimates from the store's rules |

## Known calculation limitations

- One currency per store, no currency conversion. A file whose currency column differs from the store's
  currency is rejected row by row.
- Mixed tax rates within an order are split approximately between lines (order totals are exact).
- Payouts, chargebacks and currency-conversion fees are not modelled; Narixia measures sales when orders are
  placed, not cash received.
- Platform ROAS is taken as reported; Narixia does not deduplicate conversions across platforms.
