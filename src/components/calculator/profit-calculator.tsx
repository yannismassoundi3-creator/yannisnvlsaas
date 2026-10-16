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
import { parseUserAmount, parseUserInteger, parseUserPercentToBps, parseUserUnitCost } from "@/lib/finance/input";
import { definitionsFor } from "@/lib/finance/metrics";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import { useFormat, useLocale } from "@/i18n/client";
import { calculatorUi } from "@/i18n/messages/account-calculator";

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

function parseForm(f: FormState, locale: Locale): { input: CalculatorInput | null; errors: Errors } {
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
  for (const e of validateCalculatorInput(input, locale)) {
    const key = (e.field === "discount.value" ? "discount" : e.field === "refunds.value" ? "refunds" : e.field) as keyof FormState;
    errors[key] = e.message;
  }
  return { input: Object.keys(errors).length ? null : input, errors };
}

export function ProfitCalculator({ defaultCurrency = "EUR", className }: { defaultCurrency?: string; className?: string }) {
  const locale = useLocale();
  const t = calculatorUi[locale];
  const fmt = useFormat();
  const definitions = definitionsFor(locale);
  const [form, setForm] = useState<FormState>({ ...EXAMPLE, currency: defaultCurrency });
  const { input, errors } = useMemo(() => parseForm(form, locale), [form, locale]);
  const result = useMemo(() => (input ? calculateProfitability(input, locale) : null), [input, locale]);
  const set = (key: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const symbol = currencySymbol(form.currency);
  const money = (v: number) => fmt.money(v, form.currency);
  const currencies = COMMON_CURRENCIES.includes(form.currency as (typeof COMMON_CURRENCIES)[number]) ? COMMON_CURRENCIES : [form.currency, ...COMMON_CURRENCIES];

  return (
    <div className={cn("grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]", className)}>
      <form className="space-y-6 rounded-lg border border-line bg-surface p-5 shadow-xs" onSubmit={(e) => e.preventDefault()} noValidate>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Field htmlFor="calc-currency" label={t.currency} className="w-40">
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
            {t.reset}
          </Button>
        </div>

        <Group title={t.groupPrice}>
          <AmountField id="price" label={t.sellingPrice} hint={t.excludingVat} symbol={symbol} value={form.sellingPrice} onChange={set("sellingPrice")} error={errors.sellingPrice} />
          <PlainField id="quantity" label={t.unitsSold} value={form.quantity} onChange={set("quantity")} error={errors.quantity} inputMode="numeric" />
          <PlainField id="orders" label={t.orders} hint={t.ordersHint} optional value={form.orders} onChange={set("orders")} error={errors.orders} inputMode="numeric" />
        </Group>

        <Group title={t.groupCost}>
          <AmountField id="unit-cost" label={t.unitCost} hint={t.unitCostHint} optional symbol={symbol} value={form.unitCost} onChange={set("unitCost")} error={errors.unitCost} />
        </Group>

        <Group title={t.groupDiscounts}>
          <ModeField
            id="discount"
            label={t.discounts}
            mode={form.discountMode}
            onModeChange={(m) => setForm((f) => ({ ...f, discountMode: m }))}
            symbol={symbol}
            value={form.discount}
            onChange={set("discount")}
            error={errors.discount}
            percentHint={t.shareOfGross}
            amountHint={t.totalAmount}
            typeLabel={t.modeType(t.discounts)}
          />
          <ModeField
            id="refunds"
            label={t.refunds}
            mode={form.refundMode}
            onModeChange={(m) => setForm((f) => ({ ...f, refundMode: m }))}
            symbol={symbol}
            value={form.refunds}
            onChange={set("refunds")}
            error={errors.refunds}
            percentHint={t.shareOfGross}
            amountHint={t.totalAmount}
            typeLabel={t.modeType(t.refunds)}
          />
        </Group>

        <Group title={t.groupVariable}>
          <PlainField id="fee-percent" label={t.paymentFee} trailing="%" hint={t.paymentFeeHint} optional value={form.feePercent} onChange={set("feePercent")} error={errors.feePercent} inputMode="decimal" />
          <AmountField id="fee-fixed" label={t.fixedFee} optional symbol={symbol} value={form.feeFixed} onChange={set("feeFixed")} error={errors.feeFixed} />
          <AmountField id="shipping" label={t.shippingCosts} hint={t.shippingHint} optional symbol={symbol} value={form.shipping} onChange={set("shipping")} error={errors.shipping} />
          <AmountField id="advertising" label={t.advertising} hint={t.advertisingHint} optional symbol={symbol} value={form.advertising} onChange={set("advertising")} error={errors.advertising} />
          <AmountField id="other" label={t.otherCosts} hint={t.otherHint} optional symbol={symbol} value={form.other} onChange={set("other")} error={errors.other} />
        </Group>
      </form>

      <div className="space-y-4 lg:sticky lg:top-20">
        <section aria-live="polite" className="rounded-lg border border-line bg-surface shadow-xs">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-md font-semibold tracking-tight text-ink">{t.result}</h2>
            <p className="text-sm text-ink-3">{t.resultHint}</p>
          </div>
          {result ? (
            <>
              <dl className="divide-y divide-line text-sm">
                <ResultRow label={t.grossSales} value={money(result.grossSales)} />
                <ResultRow label={t.discounts} value={money(-result.discounts)} muted />
                <ResultRow label={t.refunds} value={money(-result.refunds)} muted />
                <ResultRow label={t.netSales} value={money(result.netSales)} strong tip={definitions.netSales} />
                <ResultRow label={t.cogs} value={result.cogs === null ? t.unitCostNeeded : money(-result.cogs)} muted />
                <ResultRow label={t.paymentFees} value={money(-result.paymentFees)} muted />
                <ResultRow label={t.shippingCosts} value={money(-result.shippingCosts)} muted />
                <ResultRow label={t.advertising} value={money(-result.advertising)} muted />
                <ResultRow label={t.otherCosts} value={money(-result.otherVariableCosts)} muted />
              </dl>
              <div className="border-t border-line bg-emerald-50/60 px-5 py-4">
                <div className="flex items-center gap-1.5 text-sm font-medium text-ink-2">
                  {t.contributionMargin}
                  <TermTip term={definitions.contributionMargin.term}>{definitions.contributionMargin.short}</TermTip>
                </div>
                <p className={cn("mt-1 text-3xl font-semibold tracking-tight tabular", result.contributionMargin !== null && result.contributionMargin < 0 ? "text-negative-700" : "text-ink")}>
                  {result.contributionMargin === null ? "—" : money(result.contributionMargin)}
                </p>
                <p className="mt-1 text-sm text-ink-2">
                  {t.ofNetSales(fmt.percent(result.contributionMarginRate))}
                  {result.contributionPerUnit !== null ? t.perUnitSuffix(money(result.contributionPerUnit)) : ""}
                </p>
              </div>
            </>
          ) : (
            <p className="px-5 py-6 text-sm text-ink-3">{t.fixErrors}</p>
          )}
        </section>

        {result ? (
          <section className="rounded-lg border border-line bg-surface p-5 shadow-xs">
            <h2 className="text-md font-semibold tracking-tight text-ink">{t.breakEvenTitle}</h2>
            {result.breakEvenPrice.ok ? (
              <>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular">
                  {money(result.breakEvenPrice.price)} <span className="text-sm font-normal text-ink-3">{t.perUnit}</span>
                </p>
                <p className="mt-2 text-sm text-ink-2">{t.breakEvenExplain}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-2">
                {result.breakEvenPrice.reason === "missing_unit_cost" && t.breakEvenMissingCost}
                {result.breakEvenPrice.reason === "no_quantity" && t.breakEvenNoQuantity}
                {result.breakEvenPrice.reason === "deductions_exceed_price" && t.breakEvenImpossible}
              </p>
            )}
          </section>
        ) : null}

        {result?.warnings.length ? (
          <Alert tone="caution" title={t.checkInputs}>
            <ul className="list-disc pl-4">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
        ) : null}

        <details className="group rounded-lg border border-line bg-surface px-5 py-4 shadow-xs">
          <summary className="cursor-pointer list-none text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            {t.howCalculated}
          </summary>
          <div className="mt-3 space-y-3 text-sm text-ink-2">
            <Formula label={t.grossSales} value={t.formulaGross} />
            <Formula label={t.netSales} value={t.formulaNet} />
            <Formula label={t.cogs} value={t.formulaCogs} />
            <Formula label={t.paymentFees} value={t.formulaFees} />
            <Formula label={t.contributionMargin} value={t.formulaMargin} />
            <Formula label={t.marginRate} value={t.formulaMarginRate} />
            <p className="text-xs text-ink-3">{t.feesNote}</p>
            <div className="rounded-md bg-sunken px-3 py-2.5 text-xs text-ink-2">
              <p className="font-medium text-ink">{t.notIncluded}</p>
              <p className="mt-0.5">{t.notIncludedBody}</p>
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
  amountHint,
  typeLabel,
}: Omit<FieldCommon, "hint" | "optional"> & {
  mode: "percent" | "amount";
  onModeChange: (m: "percent" | "amount") => void;
  symbol: string;
  percentHint: string;
  amountHint: string;
  typeLabel: string;
}) {
  const uid = useId();
  const fieldId = `${id}-${uid}`;
  return (
    <Field
      htmlFor={fieldId}
      label={label}
      hint={mode === "percent" ? percentHint : amountHint}
      error={error}
      optional
      aside={
        <div role="radiogroup" aria-label={typeLabel} className="inline-flex rounded-sm border border-line bg-sunken p-0.5 text-xs">
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
