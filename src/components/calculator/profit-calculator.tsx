"use client";

import { RotateCcw } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { TermTip } from "@/components/ui/overlay";
import { calculateProfitability, validateCalculatorInput, type Adjustment, type CalculatorInput } from "@/lib/finance/calculator";
import { COMMON_CURRENCIES, currencySymbol } from "@/lib/finance/currency";
import { formatPercent } from "@/lib/finance/format";
import { parseUserAmount, parseUserInteger, parseUserPercentToBps, parseUserUnitCost } from "@/lib/finance/input";
import { DEFINITIONS } from "@/lib/finance/metrics";
import { formatMoney } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

type FormState = {
  currency: string;
  sellingPrice: string;
  quantity: string;
  orders: string;
  unitCost: string;
  discountMode: "percent" | "amount";
  discount: string;
  refundMode: "percent" | "amount";
  refunds: string;
  feePercent: string;
  feeFixed: string;
  shipping: string;
  advertising: string;
  other: string;
};

const EXAMPLE: FormState = {
  currency: "EUR",
  sellingPrice: "40",
  quantity: "100",
  orders: "80",
  unitCost: "14",
  discountMode: "percent",
  discount: "10",
  refundMode: "percent",
  refunds: "3",
  feePercent: "1.5",
  feeFixed: "0.25",
  shipping: "400",
  advertising: "600",
  other: "50",
};

type Errors = Partial<Record<keyof FormState, string>>;

function parseForm(f: FormState): { input: CalculatorInput | null; errors: Errors } {
  const errors: Errors = {};
  const take = <T,>(key: keyof FormState, r: { ok: true; value: T } | { ok: false; message: string }): T | undefined => {
    if (r.ok) return r.value;
    errors[key] = r.message;
    return undefined;
  };
  const c = f.currency;
  const sellingPrice = take("sellingPrice", parseUserAmount(f.sellingPrice, c));
  const quantity = take("quantity", parseUserInteger(f.quantity, { max: 10_000_000 }));
  const orders = take("orders", parseUserInteger(f.orders, { optional: true, min: 1, max: 10_000_000 }));
  const unitCost = take("unitCost", parseUserUnitCost(f.unitCost, { optional: true }));
  const discount = f.discountMode === "percent" ? take("discount", parseUserPercentToBps(f.discount, { optional: true })) : take("discount", parseUserAmount(f.discount, c, { optional: true }));
  const refunds = f.refundMode === "percent" ? take("refunds", parseUserPercentToBps(f.refunds, { optional: true })) : take("refunds", parseUserAmount(f.refunds, c, { optional: true }));
  const feePercent = take("feePercent", parseUserPercentToBps(f.feePercent, { optional: true }));
  const feeFixed = take("feeFixed", parseUserAmount(f.feeFixed, c, { optional: true }));
  const shipping = take("shipping", parseUserAmount(f.shipping, c, { optional: true }));
  const advertising = take("advertising", parseUserAmount(f.advertising, c, { optional: true }));
  const other = take("other", parseUserAmount(f.other, c, { optional: true }));

  if (Object.keys(errors).length > 0 || sellingPrice == null || quantity == null) return { input: null, errors };

  const adj = (mode: "percent" | "amount", v: number | null | undefined): Adjustment =>
    mode === "percent" ? { kind: "percent", basisPoints: v ?? 0 } : { kind: "amount", minor: v ?? 0 };

  const input: CalculatorInput = {
    currency: c,
    sellingPrice,
    quantity,
    orders: orders ?? null,
    unitCostE4: unitCost ?? null,
    discount: adj(f.discountMode, discount),
    refunds: adj(f.refundMode, refunds),
    paymentFeeBasisPoints: feePercent ?? 0,
    paymentFeeFixedPerOrder: feeFixed ?? 0,
    shippingCosts: shipping ?? 0,
    advertising: advertising ?? 0,
    otherVariableCosts: other ?? 0,
  };
  for (const e of validateCalculatorInput(input)) {
    const key = (e.field === "discount.value" ? "discount" : e.field === "refunds.value" ? "refunds" : e.field) as keyof FormState;
    errors[key] = e.message;
  }
  return { input: Object.keys(errors).length ? null : input, errors };
}

export function ProfitCalculator({ defaultCurrency = "EUR", className }: { defaultCurrency?: string; className?: string }) {
  const [form, setForm] = useState<FormState>({ ...EXAMPLE, currency: defaultCurrency });
  const { input, errors } = useMemo(() => parseForm(form), [form]);
  const result = useMemo(() => (input ? calculateProfitability(input) : null), [input]);
  const set = (key: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const symbol = currencySymbol(form.currency);
  const money = (v: number) => formatMoney(v, form.currency);
  const currencies = COMMON_CURRENCIES.includes(form.currency as (typeof COMMON_CURRENCIES)[number]) ? COMMON_CURRENCIES : [form.currency, ...COMMON_CURRENCIES];

  return (
    <div className={cn("grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]", className)}>
      <form className="space-y-6 rounded-lg border border-line bg-surface p-5 shadow-xs" onSubmit={(e) => e.preventDefault()} noValidate>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Field htmlFor="calc-currency" label="Currency" className="w-40">
            <NativeSelect id="calc-currency" value={form.currency} onChange={(e) => set("currency")(e.target.value)}>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...EXAMPLE, currency: form.currency })}>
            <RotateCcw aria-hidden />
            Reset to example
          </Button>
        </div>

        <Group title="Price and volume">
          <AmountField id="price" label="Selling price per unit" hint="Excluding VAT" symbol={symbol} value={form.sellingPrice} onChange={set("sellingPrice")} error={errors.sellingPrice} />
          <PlainField id="quantity" label="Units sold" value={form.quantity} onChange={set("quantity")} error={errors.quantity} inputMode="numeric" />
          <PlainField id="orders" label="Orders" hint="Used for fixed fees per order. Defaults to units sold." optional value={form.orders} onChange={set("orders")} error={errors.orders} inputMode="numeric" />
        </Group>

        <Group title="Product cost">
          <AmountField id="unit-cost" label="Unit cost" hint="What one unit costs you. Up to four decimals." optional symbol={symbol} value={form.unitCost} onChange={set("unitCost")} error={errors.unitCost} />
        </Group>

        <Group title="Discounts and refunds">
          <ModeField
            id="discount"
            label="Discounts"
            mode={form.discountMode}
            onModeChange={(m) => setForm((f) => ({ ...f, discountMode: m }))}
            symbol={symbol}
            value={form.discount}
            onChange={set("discount")}
            error={errors.discount}
            percentHint="Share of gross sales"
          />
          <ModeField
            id="refunds"
            label="Refunds"
            mode={form.refundMode}
            onModeChange={(m) => setForm((f) => ({ ...f, refundMode: m }))}
            symbol={symbol}
            value={form.refunds}
            onChange={set("refunds")}
            error={errors.refunds}
            percentHint="Share of gross sales"
          />
        </Group>

        <Group title="Variable costs">
          <PlainField id="fee-percent" label="Payment fee" trailing="%" hint="Charged on the amount paid" optional value={form.feePercent} onChange={set("feePercent")} error={errors.feePercent} inputMode="decimal" />
          <AmountField id="fee-fixed" label="Fixed fee per order" optional symbol={symbol} value={form.feeFixed} onChange={set("feeFixed")} error={errors.feeFixed} />
          <AmountField id="shipping" label="Shipping costs" hint="Total for all orders" optional symbol={symbol} value={form.shipping} onChange={set("shipping")} error={errors.shipping} />
          <AmountField id="advertising" label="Advertising" hint="Total ad spend" optional symbol={symbol} value={form.advertising} onChange={set("advertising")} error={errors.advertising} />
          <AmountField id="other" label="Other variable costs" hint="Packaging, commissions…" optional symbol={symbol} value={form.other} onChange={set("other")} error={errors.other} />
        </Group>
      </form>

      <div className="space-y-4 lg:sticky lg:top-20">
        <section aria-live="polite" className="rounded-lg border border-line bg-surface shadow-xs">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-md font-semibold tracking-tight text-ink">Result</h2>
            <p className="text-sm text-ink-3">Updates as you type. Amounts exclude VAT.</p>
          </div>
          {result ? (
            <>
              <dl className="divide-y divide-line text-sm">
                <ResultRow label="Gross sales" value={money(result.grossSales)} />
                <ResultRow label="Discounts" value={money(-result.discounts)} muted />
                <ResultRow label="Refunds" value={money(-result.refunds)} muted />
                <ResultRow label="Net sales" value={money(result.netSales)} strong tip={DEFINITIONS.netSales} />
                <ResultRow label="Cost of goods sold" value={result.cogs === null ? "Unit cost needed" : money(-result.cogs)} muted />
                <ResultRow label="Payment fees" value={money(-result.paymentFees)} muted />
                <ResultRow label="Shipping costs" value={money(-result.shippingCosts)} muted />
                <ResultRow label="Advertising" value={money(-result.advertising)} muted />
                <ResultRow label="Other variable costs" value={money(-result.otherVariableCosts)} muted />
              </dl>
              <div className="border-t border-line bg-emerald-50/60 px-5 py-4">
                <div className="flex items-center gap-1.5 text-sm font-medium text-ink-2">
                  Contribution margin
                  <TermTip term={DEFINITIONS.contributionMargin.term}>{DEFINITIONS.contributionMargin.short}</TermTip>
                </div>
                <p className={cn("mt-1 text-3xl font-semibold tracking-tight tabular", result.contributionMargin !== null && result.contributionMargin < 0 ? "text-negative-700" : "text-ink")}>
                  {result.contributionMargin === null ? "—" : money(result.contributionMargin)}
                </p>
                <p className="mt-1 text-sm text-ink-2">
                  {formatPercent(result.contributionMarginRate)} of net sales
                  {result.contributionPerUnit !== null ? ` · ${money(result.contributionPerUnit)} per unit` : ""}
                </p>
              </div>
            </>
          ) : (
            <p className="px-5 py-6 text-sm text-ink-3">Correct the highlighted fields to see the result.</p>
          )}
        </section>

        {result ? (
          <section className="rounded-lg border border-line bg-surface p-5 shadow-xs">
            <h2 className="text-md font-semibold tracking-tight text-ink">Break-even selling price</h2>
            {result.breakEvenPrice.ok ? (
              <>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular">
                  {money(result.breakEvenPrice.price)} <span className="text-sm font-normal text-ink-3">per unit</span>
                </p>
                <p className="mt-2 text-sm text-ink-2">
                  The lowest price at which contribution margin is zero or positive, assuming units, unit cost, shipping,
                  advertising, other costs and fixed amounts stay the same, while percentage discounts, refunds and fees
                  scale with the price.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-2">
                {result.breakEvenPrice.reason === "missing_unit_cost" && "Add a unit cost to calculate a break-even price."}
                {result.breakEvenPrice.reason === "no_quantity" && "Enter the number of units sold to calculate a break-even price."}
                {result.breakEvenPrice.reason === "deductions_exceed_price" &&
                  "Discounts, refunds and fees take the whole price, so no selling price can break even under these assumptions."}
              </p>
            )}
          </section>
        ) : null}

        {result?.warnings.length ? (
          <Alert tone="caution" title="Check these inputs">
            <ul className="list-disc pl-4">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
        ) : null}

        <details className="group rounded-lg border border-line bg-surface px-5 py-4 shadow-xs">
          <summary className="cursor-pointer list-none text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            How this is calculated
          </summary>
          <div className="mt-3 space-y-3 text-sm text-ink-2">
            <Formula label="Gross sales" value="Selling price × Units sold" />
            <Formula label="Net sales" value="Gross sales − Discounts − Refunds" />
            <Formula label="Cost of goods sold" value="Unit cost × Units sold" />
            <Formula label="Payment fees" value="(Gross sales − Discounts) × Fee % + Fixed fee × Orders" />
            <Formula label="Contribution margin" value="Net sales − COGS − Payment fees − Shipping − Advertising − Other variable costs" />
            <Formula label="Contribution margin %" value="Contribution margin ÷ Net sales" />
            <p className="text-xs text-ink-3">
              Payment providers usually keep their fees when an order is refunded, so fees are calculated on the amount
              paid before refunds. All amounts are rounded to the currency&rsquo;s smallest unit, half away from zero.
            </p>
            <div className="rounded-md bg-sunken px-3 py-2.5 text-xs text-ink-2">
              <p className="font-medium text-ink">Not included</p>
              <p className="mt-0.5">
                VAT and sales tax, fixed costs (rent, salaries, software subscriptions), taxes on profit, interest and
                depreciation. The result is a contribution margin, not a net profit.
              </p>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 text-sm font-semibold text-ink">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

type FieldCommon = { id: string; label: string; hint?: string; optional?: boolean; value: string; onChange: (v: string) => void; error?: string };

function AmountField({ symbol, ...p }: FieldCommon & { symbol: string }) {
  return <PlainField {...p} leading={symbol} inputMode="decimal" />;
}

function PlainField({
  id,
  label,
  hint,
  optional,
  value,
  onChange,
  error,
  leading,
  trailing,
  inputMode,
}: FieldCommon & { leading?: string; trailing?: string; inputMode?: "decimal" | "numeric" }) {
  const uid = useId();
  const fieldId = `${id}-${uid}`;
  return (
    <Field htmlFor={fieldId} label={label} hint={hint} optional={optional} error={error}>
      <Input
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        autoComplete="off"
        leading={leading}
        trailing={trailing}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className="tabular"
      />
    </Field>
  );
}

function ModeField({
  id,
  label,
  mode,
  onModeChange,
  symbol,
  value,
  onChange,
  error,
  percentHint,
}: Omit<FieldCommon, "hint" | "optional"> & { mode: "percent" | "amount"; onModeChange: (m: "percent" | "amount") => void; symbol: string; percentHint: string }) {
  const uid = useId();
  const fieldId = `${id}-${uid}`;
  return (
    <Field
      htmlFor={fieldId}
      label={label}
      hint={mode === "percent" ? percentHint : "Total amount"}
      error={error}
      optional
      aside={
        <div role="radiogroup" aria-label={`${label} type`} className="inline-flex rounded-sm border border-line bg-sunken p-0.5 text-xs">
          {(["percent", "amount"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => onModeChange(m)}
              className={cn("rounded-xs px-2 py-0.5 font-medium", mode === m ? "bg-surface text-ink shadow-xs" : "text-ink-3 hover:text-ink")}
            >
              {m === "percent" ? "%" : symbol}
            </button>
          ))}
        </div>
      }
    >
      <Input
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        autoComplete="off"
        leading={mode === "amount" ? symbol : undefined}
        trailing={mode === "percent" ? "%" : undefined}
        aria-invalid={error ? true : undefined}
        className="tabular"
      />
    </Field>
  );
}

function ResultRow({ label, value, strong, muted, tip }: { label: string; value: string; strong?: boolean; muted?: boolean; tip?: { term: string; short: string } }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 px-5 py-2", strong && "bg-sunken/45")}>
      <dt className={cn("flex items-center gap-1.5", strong ? "font-medium text-ink" : "text-ink-2")}>
        {label}
        {tip ? <TermTip term={tip.term}>{tip.short}</TermTip> : null}
      </dt>
      <dd className={cn("tabular", strong ? "font-medium text-ink" : muted ? "text-ink-2" : "text-ink")}>{value}</dd>
    </div>
  );
}

function Formula({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-medium text-ink">{label}</p>
      <p className="font-mono text-[12.5px] text-ink-2">{value}</p>
    </div>
  );
}
