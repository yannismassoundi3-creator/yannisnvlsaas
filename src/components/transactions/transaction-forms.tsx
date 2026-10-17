"use client";

import { Plus, Trash2, X } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { EXPENSE_CATEGORIES, expenseCategoryLabel, expenseKindLabel, type ExpenseCategory, type ExpenseKind } from "@/lib/domain/types";
import { currencySymbol } from "@/lib/finance/currency";
import { toInputDecimal } from "@/lib/finance/input";
import { minorToInputValue } from "@/lib/finance/money";
import { createExpense, createManualOrder, createRefund, deleteExpense, deleteOrder, deleteRefund, updateOrderCosts } from "@/lib/transactions/actions";
import { useLocale } from "@/i18n/client";
import { catalogCommon } from "@/i18n/messages/catalog-common";
import { transactionsMessages } from "@/i18n/messages/catalog-transactions";

type FieldErrors = Record<string, string>;

function useMessages() {
  return transactionsMessages[useLocale()];
}

function useFormState() {
  const t = useMessages();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const apply = (r: { ok: boolean; message?: string; fieldErrors?: FieldErrors }) => {
    if (r.ok) {
      setErrors({});
      setFormError(null);
    } else {
      setErrors(r.fieldErrors ?? {});
      setFormError(r.fieldErrors ? null : (r.message ?? t.somethingWentWrong));
    }
  };
  return { errors, formError, apply, reset: () => (setErrors({}), setFormError(null)) };
}

function FormError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm font-medium text-negative-700">
      {message}
    </p>
  ) : null;
}

// -----------------------------------------------------------------------------
export function AddExpenseDialog({ currency, defaultDate, disabled }: { currency: string; defaultDate: string; disabled: boolean }) {
  const id = useId();
  const locale = useLocale();
  const t = transactionsMessages[locale];
  const [open, setOpen] = useState(false);
  const blank = { date: defaultDate, category: "packaging" as ExpenseCategory, kind: "variable" as ExpenseKind, amount: "", description: "" };
  const [v, setV] = useState(blank);
  const { errors, formError, apply, reset } = useFormState();
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setV(blank);
          reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={disabled}>
          <Plus aria-hidden />
          {t.addExpense}
        </Button>
      </DialogTrigger>
      <DialogContent title={t.addExpenseTitle} description={t.addExpenseDescription}>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await createExpense(v);
              apply(r);
              if (r.ok) {
                setOpen(false);
                toast.success(t.expenseAdded);
              }
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor={`${id}-date`} label={t.date} error={errors.date}>
              <Input id={`${id}-date`} type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
            </Field>
            <Field htmlFor={`${id}-amount`} label={t.amount} error={errors.amount}>
              <Input
                id={`${id}-amount`}
                inputMode="decimal"
                leading={currencySymbol(currency)}
                value={v.amount}
                onChange={(e) => setV({ ...v, amount: e.target.value })}
                aria-invalid={errors.amount ? true : undefined}
                aria-describedby={describedBy(`${id}-amount`, { error: errors.amount })}
              />
            </Field>
            <Field htmlFor={`${id}-category`} label={t.category}>
              <NativeSelect
                id={`${id}-category`}
                value={v.category}
                onChange={(e) => {
                  const category = e.target.value as ExpenseCategory;
                  setV({ ...v, category, kind: EXPENSE_CATEGORIES[category].defaultKind });
                }}
              >
                {(Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).map((value) => (
                  <option key={value} value={value}>
                    {expenseCategoryLabel(value, locale)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field htmlFor={`${id}-kind`} label={t.type}>
              <NativeSelect id={`${id}-kind`} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as ExpenseKind })}>
                <option value="variable">{t.variableOption}</option>
                <option value="fixed">{expenseKindLabel("fixed", locale)}</option>
              </NativeSelect>
            </Field>
          </div>
          <Field htmlFor={`${id}-description`} label={t.descriptionLabel} optional error={errors.description}>
            <Textarea id={`${id}-description`} rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </Field>
          <FormError message={formError} />
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              {t.addExpense}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
export function AddRefundDialog({ currency, defaultDate, disabled }: { currency: string; defaultDate: string; disabled: boolean }) {
  const id = useId();
  const t = useMessages();
  const [open, setOpen] = useState(false);
  const blank = { orderNumber: "", date: defaultDate, amount: "", reason: "" };
  const [v, setV] = useState(blank);
  const { errors, formError, apply, reset } = useFormState();
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setV(blank);
          reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={disabled}>
          <Plus aria-hidden />
          {t.addRefund}
        </Button>
      </DialogTrigger>
      <DialogContent title={t.addRefundTitle} description={t.addRefundDescription}>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await createRefund(v);
              apply(r);
              if (r.ok) {
                setOpen(false);
                toast.success(t.refundAdded);
              }
            });
          }}
        >
          <Field htmlFor={`${id}-order`} label={t.orderNumber} optional hint={t.orderNumberHint} error={errors.orderNumber}>
            <Input id={`${id}-order`} value={v.orderNumber} onChange={(e) => setV({ ...v, orderNumber: e.target.value })} placeholder="#1001" aria-invalid={errors.orderNumber ? true : undefined} aria-describedby={describedBy(`${id}-order`, { hint: true, error: errors.orderNumber })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor={`${id}-date`} label={t.refundDate} error={errors.date}>
              <Input id={`${id}-date`} type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
            </Field>
            <Field htmlFor={`${id}-amount`} label={t.amount} error={errors.amount}>
              <Input id={`${id}-amount`} inputMode="decimal" leading={currencySymbol(currency)} value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} aria-invalid={errors.amount ? true : undefined} />
            </Field>
          </div>
          <Field htmlFor={`${id}-reason`} label={t.reason} optional error={errors.reason}>
            <Input id={`${id}-reason`} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} />
          </Field>
          <FormError message={formError} />
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              {t.addRefund}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
type Line = { productId: string; name: string; sku: string; quantity: string; unitPrice: string; discount: string; unitCost: string };
const blankLine = (): Line => ({ productId: "", name: "", sku: "", quantity: "1", unitPrice: "", discount: "", unitCost: "" });

export function AddOrderDialog({
  currency,
  defaultDate,
  pricesIncludeTax,
  products,
  disabled,
  defaultOpen = false,
}: {
  currency: string;
  defaultDate: string;
  pricesIncludeTax: boolean;
  products: { id: string; name: string; sku: string | null; price_minor: number | null }[];
  disabled: boolean;
  /** Open on arrival, e.g. from the empty overview's "Enter a sale manually" (/app/transactions?tab=orders&new=1). */
  defaultOpen?: boolean;
}) {
  const id = useId();
  const locale = useLocale();
  const t = transactionsMessages[locale];
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen && !disabled);
  const blank = { orderNumber: "", date: defaultDate, time: "12:00", shippingCharged: "", taxes: "", shippingCost: "", fees: "" };
  const [v, setV] = useState(blank);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const { errors, formError, apply, reset } = useFormState();
  const [pending, startTransition] = useTransition();
  const symbol = currencySymbol(currency);
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setV(blank);
          setLines([blankLine()]);
          reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={disabled}>
          <Plus aria-hidden />
          {t.addOrder}
        </Button>
      </DialogTrigger>
      <DialogContent
        size="lg"
        title={t.addOrderTitle}
        description={t.addOrderDescription(pricesIncludeTax)}
      >
        <form
          noValidate
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await createManualOrder({ ...v, lines });
              apply(r);
              if (r.ok) {
                setOpen(false);
                toast.success(t.orderAdded);
                router.push(`/app/transactions/orders/${r.orderId}` as Route);
              }
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem_7rem]">
            <Field htmlFor={`${id}-number`} label={t.orderNumber} error={errors.orderNumber}>
              <Input id={`${id}-number`} value={v.orderNumber} onChange={(e) => setV({ ...v, orderNumber: e.target.value })} aria-invalid={errors.orderNumber ? true : undefined} />
            </Field>
            <Field htmlFor={`${id}-date`} label={t.date} error={errors.date}>
              <Input id={`${id}-date`} type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
            </Field>
            <Field htmlFor={`${id}-time`} label={t.time}>
              <Input id={`${id}-time`} type="time" value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} />
            </Field>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-ink">{t.lines}</legend>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-line p-3 sm:grid-cols-[1.6fr_4rem_6rem_6rem_6rem_auto] sm:items-end">
                <div className="col-span-2 space-y-1 sm:col-span-1">
                  <label htmlFor={`${id}-p${i}`} className="text-xs font-medium text-ink-2">
                    {t.product}
                  </label>
                  <NativeSelect
                    id={`${id}-p${i}`}
                    inputSize="sm"
                    value={l.productId}
                    onChange={(e) => {
                      const p = products.find((x) => x.id === e.target.value);
                      setLine(i, { productId: e.target.value, unitPrice: p?.price_minor != null && !l.unitPrice ? toInputDecimal(minorToInputValue(p.price_minor, currency), locale) : l.unitPrice });
                    }}
                  >
                    <option value="">{t.newProductOption}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.sku ? ` (${p.sku})` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                  {!l.productId ? (
                    <div className="grid grid-cols-[1fr_6rem] gap-2 pt-1">
                      <Input inputSize="sm" placeholder={t.productName} aria-label={t.lineProductName(i + 1)} value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} aria-invalid={errors[`lines.${i}.name`] ? true : undefined} />
                      <Input inputSize="sm" placeholder={t.skuPlaceholder} aria-label={t.lineSku(i + 1)} value={l.sku} onChange={(e) => setLine(i, { sku: e.target.value })} />
                    </div>
                  ) : null}
                </div>
                {(
                  [
                    ["quantity", t.qty, "numeric"],
                    ["unitPrice", t.unitPrice, "decimal"],
                    ["discount", t.discount, "decimal"],
                    ["unitCost", t.unitCost, "decimal"],
                  ] as const
                ).map(([key, label, mode]) => (
                  <div key={key} className="space-y-1">
                    <label htmlFor={`${id}-${key}${i}`} className="text-xs font-medium text-ink-2">
                      {label}
                    </label>
                    <Input
                      id={`${id}-${key}${i}`}
                      inputSize="sm"
                      inputMode={mode}
                      value={l[key]}
                      onChange={(e) => setLine(i, { [key]: e.target.value })}
                      aria-invalid={errors[`lines.${i}.${key}`] ? true : undefined}
                      placeholder={key === "unitCost" ? t.optional : undefined}
                    />
                  </div>
                ))}
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t.removeLine(i + 1)} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                  <X />
                </Button>
                {Object.entries(errors)
                  .filter(([k]) => k.startsWith(`lines.${i}.`))
                  .map(([k, m]) => (
                    <p key={k} className="col-span-2 text-xs text-negative-700 sm:col-span-6">
                      {m}
                    </p>
                  ))}
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])} disabled={lines.length >= 100}>
              <Plus aria-hidden />
              {t.addLine}
            </Button>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-4">
            {(
              [
                ["shippingCharged", t.shippingCharged, t.shippingChargedHint],
                ["taxes", t.taxes, pricesIncludeTax ? t.taxesIncluded : t.taxesOnTop],
                ["shippingCost", t.shippingCost, t.shippingCostHint],
                ["fees", t.paymentFees, t.paymentFeesHint],
              ] as const
            ).map(([key, label, hint]) => (
              <Field key={key} htmlFor={`${id}-${key}`} label={label} optional hint={hint} error={errors[key]}>
                <Input id={`${id}-${key}`} inputMode="decimal" leading={symbol} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} aria-invalid={errors[key] ? true : undefined} />
              </Field>
            ))}
          </div>
          <FormError message={formError} />
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              {t.addOrder}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
export function DeleteRowButton({ kind, id, label }: { kind: "expense" | "refund"; id: string; label: string }) {
  const locale = useLocale();
  const t = transactionsMessages[locale];
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={t.deleteLabel(label)}>
          <Trash2 />
        </Button>
      }
      title={t.deleteRowTitle(kind)}
      description={t.deleteRowDescription(label)}
      confirmLabel={catalogCommon[locale].delete}
      destructive
      pending={pending}
      onConfirm={() =>
        new Promise<void>((resolve) =>
          startTransition(async () => {
            const r = kind === "expense" ? await deleteExpense(id) : await deleteRefund(id);
            resolve();
            setOpen(false);
            if (!r.ok) toast.error(r.message);
            else toast.success(kind === "expense" ? t.expenseDeleted : t.refundDeleted);
          }),
        )
      }
    />
  );
}

// -----------------------------------------------------------------------------
export function OrderCostsForm({
  orderId,
  currency,
  shippingCostMinor,
  feesMinor,
  disabled,
}: {
  orderId: string;
  currency: string;
  shippingCostMinor: number | null;
  feesMinor: number | null;
  disabled: boolean;
}) {
  const id = useId();
  const locale = useLocale();
  const t = transactionsMessages[locale];
  const [v, setV] = useState({
    shippingCost: shippingCostMinor === null ? "" : toInputDecimal(minorToInputValue(shippingCostMinor, currency), locale),
    fees: feesMinor === null ? "" : toInputDecimal(minorToInputValue(feesMinor, currency), locale),
  });
  const { errors, formError, apply } = useFormState();
  const [pending, startTransition] = useTransition();
  const symbol = currencySymbol(currency);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await updateOrderCosts(orderId, v);
          apply(r);
          if (r.ok) toast.success(t.costsSaved);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor={`${id}-ship`} label={t.shippingCost} hint={t.shippingCostEmptyHint} error={errors.shippingCost}>
          <Input id={`${id}-ship`} inputMode="decimal" leading={symbol} value={v.shippingCost} onChange={(e) => setV({ ...v, shippingCost: e.target.value })} disabled={disabled} aria-describedby={describedBy(`${id}-ship`, { hint: true, error: errors.shippingCost })} />
        </Field>
        <Field htmlFor={`${id}-fees`} label={t.paymentFees} hint={t.feesEmptyHint} error={errors.fees}>
          <Input id={`${id}-fees`} inputMode="decimal" leading={symbol} value={v.fees} onChange={(e) => setV({ ...v, fees: e.target.value })} disabled={disabled} aria-describedby={describedBy(`${id}-fees`, { hint: true, error: errors.fees })} />
        </Field>
      </div>
      <FormError message={formError} />
      <div className="flex justify-end">
        <Button type="submit" loading={pending} disabled={disabled}>
          {t.saveCosts}
        </Button>
      </div>
    </form>
  );
}

export function DeleteOrderButton({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const t = useMessages();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="danger-ghost">
          <Trash2 aria-hidden />
          {t.deleteOrder}
        </Button>
      }
      title={t.deleteOrderTitle(orderNumber)}
      description={t.deleteOrderDescription}
      confirmLabel={t.deleteOrder}
      destructive
      pending={pending}
      onConfirm={() =>
        new Promise<void>((resolve) =>
          startTransition(async () => {
            const r = await deleteOrder(orderId);
            resolve();
            setOpen(false);
            if (!r.ok) toast.error(r.message);
            else {
              toast.success(t.orderDeleted);
              router.push("/app/transactions");
            }
          }),
        )
      }
    />
  );
}
