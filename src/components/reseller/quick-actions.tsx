"use client";

import { ChevronDown, PackagePlus, Plus, Search, Tag } from "lucide-react";
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { useFormat, useLocale } from "@/i18n/client";
import { resellerMessages } from "@/i18n/messages/reseller";
import { currencySymbol } from "@/lib/finance/currency";
import { toInputDecimal } from "@/lib/finance/input";
import { e4ToInputValue } from "@/lib/finance/money";
import { platformName, SALES_CHANNELS, type PlatformId } from "@/lib/onboarding/constants";
import { addItem, sellItem, updateItem } from "@/lib/reseller/actions";
import { nameTokens } from "@/lib/reseller/logic";
import { cn } from "@/lib/utils";

/**
 * Quick dialogs of the reseller mode: "Add an item" and "Sold!". Built for a
 * phone: large fields, decimal keyboard, focus in the first field, Enter
 * submits, a toast confirms, and the page refreshes in place.
 *
 * One provider per page renders the dialogs once; any button inside it can
 * open them (e.g. the "Sold" button of an item that lingers in stock).
 */

export type StockOption = { id: string; name: string; unitCostE4: number | null; stockedOn: string };

/** Values that prefill the sale form, e.g. from a forwarded sale email. */
export type SalePrefill = { price?: string; channel?: PlatformId; title?: string | null; productId?: string | null; inboundEmailId?: string };

type OpenSell = (options?: { productId?: string; prefill?: SalePrefill }) => void;
type QuickActions = { openAdd: () => void; openSell: OpenSell; disabled: boolean };

const QuickActionsContext = createContext<QuickActions | null>(null);

function useQuickActions(): QuickActions {
  const ctx = useContext(QuickActionsContext);
  if (!ctx) throw new Error("Quick action buttons must be rendered inside <QuickActionsProvider>.");
  return ctx;
}

type ProviderProps = {
  currency: string;
  today: string;
  stock: StockOption[];
  defaultChannel: PlatformId;
  /** Read-only workspace (trial or subscription ended): buttons are disabled. */
  disabled: boolean;
  /** Dialog to open on arrival (?add=1 or ?sell=1, e.g. right after onboarding). */
  initial?: "add" | "sell" | null;
  children: ReactNode;
};

export function QuickActionsProvider({ currency, today, stock, defaultChannel, disabled, initial = null, children }: ProviderProps) {
  const [addOpen, setAddOpen] = useState(initial === "add" && !disabled);
  const [sell, setSell] = useState<{ open: boolean; productId?: string; prefill?: SalePrefill; key: number }>({ open: initial === "sell" && !disabled, key: 0 });
  const value = useMemo<QuickActions>(
    () => ({
      openAdd: () => setAddOpen(true),
      openSell: (options) => setSell((s) => ({ open: true, productId: options?.productId, prefill: options?.prefill, key: s.key + 1 })),
      disabled,
    }),
    [disabled],
  );
  return (
    <QuickActionsContext value={value}>
      {children}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        {addOpen ? <AddItemContent currency={currency} today={today} onDone={() => setAddOpen(false)} /> : null}
      </Dialog>
      <Dialog open={sell.open} onOpenChange={(open) => setSell((s) => ({ ...s, open }))}>
        {sell.open ? (
          <SellContent
            key={sell.key}
            currency={currency}
            today={today}
            stock={stock}
            defaultChannel={defaultChannel}
            productId={sell.productId}
            prefill={sell.prefill}
            onDone={() => setSell((s) => ({ ...s, open: false }))}
          />
        ) : null}
      </Dialog>
    </QuickActionsContext>
  );
}

/** "+ Add an item" */
export function AddItemButton({ className, size = "lg", variant = "primary", children }: Pick<ButtonProps, "className" | "size" | "variant" | "children">) {
  const { openAdd, disabled } = useQuickActions();
  const t = resellerMessages[useLocale()].home;
  return (
    <Button className={className} size={size} variant={variant} onClick={openAdd} disabled={disabled}>
      <Plus aria-hidden />
      {children ?? t.addItem}
    </Button>
  );
}

/** "Sold!" for any item, or "Sold" on one item's row. */
export function SellButton({
  productId,
  prefill,
  className,
  size = "lg",
  variant = "accent",
  label,
  "aria-label": ariaLabel,
  icon = true,
}: Pick<ButtonProps, "className" | "size" | "variant" | "aria-label"> & { productId?: string; prefill?: SalePrefill; label?: string; icon?: boolean }) {
  const { openSell, disabled } = useQuickActions();
  const t = resellerMessages[useLocale()].home;
  return (
    <Button className={className} size={size} variant={variant} onClick={() => openSell({ productId, prefill })} disabled={disabled} aria-label={ariaLabel}>
      {icon ? <Tag aria-hidden /> : null}
      {label ?? t.sold}
    </Button>
  );
}

type FieldErrors = Record<string, string>;

function FormError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm font-medium text-negative-700">
      {message}
    </p>
  ) : null;
}

// -----------------------------------------------------------------------------
// Add / edit an item
// -----------------------------------------------------------------------------
type ItemValues = { name: string; purchasePrice: string; acquiredOn: string };

function ItemFormFields({
  id,
  values,
  setValues,
  errors,
  currency,
  today,
  nameRef,
}: {
  id: string;
  values: ItemValues;
  setValues: (v: ItemValues) => void;
  errors: FieldErrors;
  currency: string;
  today: string;
  nameRef: React.RefObject<HTMLInputElement | null>;
}) {
  const t = resellerMessages[useLocale()].add;
  return (
    <>
      <Field htmlFor={`${id}-name`} label={t.name} error={errors.name}>
        <Input
          ref={nameRef}
          id={`${id}-name`}
          inputSize="lg"
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          placeholder={t.namePlaceholder}
          maxLength={300}
          autoComplete="off"
          enterKeyHint="next"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describedBy(`${id}-name`, { error: errors.name })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field htmlFor={`${id}-cost`} label={t.purchasePrice} optional error={errors.purchasePrice}>
          <Input
            id={`${id}-cost`}
            inputSize="lg"
            inputMode="decimal"
            leading={currencySymbol(currency)}
            value={values.purchasePrice}
            onChange={(e) => setValues({ ...values, purchasePrice: e.target.value })}
            autoComplete="off"
            enterKeyHint="done"
            aria-invalid={errors.purchasePrice ? true : undefined}
            aria-describedby={describedBy(`${id}-cost`, { error: errors.purchasePrice })}
          />
        </Field>
        <Field htmlFor={`${id}-date`} label={t.acquiredOn} optional error={errors.acquiredOn}>
          <Input
            id={`${id}-date`}
            inputSize="lg"
            type="date"
            max={today}
            value={values.acquiredOn}
            onChange={(e) => setValues({ ...values, acquiredOn: e.target.value })}
            aria-invalid={errors.acquiredOn ? true : undefined}
          />
        </Field>
      </div>
      {!errors.purchasePrice ? <p className="-mt-2 text-xs text-ink-3">{t.purchasePriceHint}</p> : null}
    </>
  );
}

function AddItemContent({ currency, today, onDone }: { currency: string; today: string; onDone: () => void }) {
  const id = useId();
  const locale = useLocale();
  const t = resellerMessages[locale].add;
  const blank: ItemValues = { name: "", purchasePrice: "", acquiredOn: today };
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Busy only while the action runs: the page refresh that follows must not block the next item.
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();
  const another = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <DialogContent
      title={t.title}
      description={t.description}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        nameRef.current?.focus();
      }}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (saving) return;
          const keepGoing = another.current;
          another.current = false;
          setSaving(true);
          startTransition(async () => {
            const r = await addItem(values).catch(() => null);
            setSaving(false);
            if (!r) return setFormError(resellerMessages[locale].actions.itemSaveFailed);
            if (!r.ok) {
              setErrors(r.fieldErrors ?? {});
              setFormError(r.fieldErrors ? null : r.message);
              return;
            }
            toast.success(t.added(values.name.trim()));
            setErrors({});
            setFormError(null);
            if (keepGoing) {
              // Same purchase date for a batch; the next name gets the focus.
              setValues({ ...blank, acquiredOn: values.acquiredOn });
              nameRef.current?.focus();
            } else onDone();
          });
        }}
      >
        <ItemFormFields id={id} values={values} setValues={setValues} errors={errors} currency={currency} today={today} nameRef={nameRef} />
        <FormError message={formError} />
        <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
          <Button type="submit" size="lg" loading={saving} className="w-full sm:w-auto">
            <PackagePlus aria-hidden />
            {t.submit}
          </Button>
          <Button type="submit" size="lg" variant="secondary" disabled={saving} className="w-full sm:w-auto" onClick={() => (another.current = true)}>
            {t.submitAnother}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

/** Edit dialog of an item (items page). */
export function EditItemDialog({
  open,
  onOpenChange,
  productId,
  initial,
  currency,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  initial: { name: string; unitCostE4: number | null; acquiredOn: string | null };
  currency: string;
  today: string;
}) {
  const id = useId();
  const locale = useLocale();
  const t = resellerMessages[locale].items;
  const start: ItemValues = {
    name: initial.name,
    purchasePrice: initial.unitCostE4 === null ? "" : toInputDecimal(e4ToInputValue(initial.unitCostE4), locale),
    acquiredOn: initial.acquiredOn ?? "",
  };
  const [values, setValues] = useState(start);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) {
          setValues(start);
          setErrors({});
          setFormError(null);
        }
      }}
    >
      {open ? (
        <DialogContent
          title={t.editTitle}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            nameRef.current?.focus();
          }}
        >
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const r = await updateItem(productId, values).catch(() => null);
                if (!r) return setFormError(resellerMessages[locale].actions.itemSaveFailed);
                if (!r.ok) {
                  setErrors(r.fieldErrors ?? {});
                  setFormError(r.fieldErrors ? null : r.message);
                  return;
                }
                toast.success(t.saved);
                onOpenChange(false);
              });
            }}
          >
            <ItemFormFields id={id} values={values} setValues={setValues} errors={errors} currency={currency} today={today} nameRef={nameRef} />
            <FormError message={formError} />
            <div className="flex justify-end pt-1">
              <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
                {t.save}
              </Button>
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Record a sale
// -----------------------------------------------------------------------------
function matches(item: StockOption, words: string[]): boolean {
  if (words.length === 0) return true;
  const tokens = nameTokens(item.name).join(" ");
  return words.every((w) => tokens.includes(w));
}

function SellContent({
  currency,
  today,
  stock,
  defaultChannel,
  productId: initialProductId,
  prefill,
  onDone,
}: {
  currency: string;
  today: string;
  stock: StockOption[];
  defaultChannel: PlatformId;
  productId?: string;
  prefill?: SalePrefill;
  onDone: () => void;
}) {
  const id = useId();
  const locale = useLocale();
  const f = useFormat();
  const t = resellerMessages[locale].sell;
  const symbol = currencySymbol(currency);
  const startProduct = initialProductId ?? prefill?.productId ?? null;
  // null = automatic: follows the stock, which may still be refreshing right after an item was added.
  const [chosenMode, setMode] = useState<"pick" | "chosen" | "new" | null>(null);
  const [productId, setProductId] = useState<string | null>(startProduct);
  const chosen = productId ? (stock.find((s) => s.id === productId) ?? null) : null;
  const mode = chosenMode ?? (chosen ? "chosen" : stock.length === 0 || (prefill?.title && !startProduct) ? "new" : "pick");
  const [search, setSearch] = useState("");
  const [values, setValues] = useState({
    newItemName: startProduct ? "" : (prefill?.title ?? ""),
    newItemCost: "",
    price: prefill?.price ?? "",
    channel: prefill?.channel ?? defaultChannel,
    date: today,
    shippingCost: "",
    platformFee: "",
  });
  const [feesOpen, setFeesOpen] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const words = nameTokens(search);
    return stock.filter((s) => matches(s, words)).slice(0, 50);
  }, [stock, search]);

  // When the stock arrives after the dialog opened on an empty stock, move the focus to the search field.
  const autoMode = chosenMode === null ? mode : null;
  const previousAutoMode = useRef(autoMode);
  useEffect(() => {
    if (previousAutoMode.current === "new" && autoMode === "pick" && !values.newItemName) searchRef.current?.focus();
    if (previousAutoMode.current !== "chosen" && autoMode === "chosen") priceRef.current?.focus();
    previousAutoMode.current = autoMode;
  }, [autoMode, values.newItemName]);

  const choose = (item: StockOption) => {
    setProductId(item.id);
    setMode("chosen");
    setErrors((e) => ({ ...e, productId: "" }));
    requestAnimationFrame(() => priceRef.current?.focus());
  };

  const costLabel = (e4: number | null) => (e4 === null ? resellerMessages[locale].home.missingCost : f.unitCost(e4, currency));

  return (
    <DialogContent
      title={t.title}
      description={prefill?.inboundEmailId ? t.fromEmail : t.description}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        (mode === "chosen" ? priceRef : mode === "new" ? (values.newItemName ? priceRef : nameRef) : searchRef).current?.focus();
      }}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const r = await sellItem({
              productId: mode === "chosen" && productId ? productId : "",
              newItemName: mode === "new" ? values.newItemName : "",
              newItemCost: mode === "new" ? values.newItemCost : "",
              price: values.price,
              channel: values.channel,
              date: values.date,
              shippingCost: values.shippingCost,
              platformFee: values.platformFee,
            }).catch(() => null);
            if (!r) return setFormError(resellerMessages[locale].actions.saleSaveFailed);
            if (!r.ok) {
              setErrors(r.fieldErrors ?? {});
              setFormError(r.fieldErrors ? null : r.message);
              if (r.fieldErrors?.shippingCost || r.fieldErrors?.platformFee) setFeesOpen(true);
              return;
            }
            toast.success(t.saved);
            onDone();
          });
        }}
      >
        {/* Which item */}
        {mode === "chosen" && chosen ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-sunken/60 px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink-3">{t.chosen}</p>
              <p className="truncate text-md font-semibold text-ink">{chosen.name}</p>
              <p className="text-xs text-ink-3 tabular">
                {costLabel(chosen.unitCostE4)} · {t.boughtOn(f.date(chosen.stockedOn))}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setMode("pick");
                setProductId(null);
                requestAnimationFrame(() => searchRef.current?.focus());
              }}
            >
              {t.change}
            </Button>
          </div>
        ) : mode === "new" ? (
          <fieldset className="space-y-3 rounded-md border border-line p-3.5">
            <legend className="px-1 text-sm font-medium text-ink">{t.notInStock}</legend>
            <div className="grid grid-cols-[1fr_8rem] gap-3">
              <Field htmlFor={`${id}-new-name`} label={t.newItemName} error={errors.newItemName || errors.productId}>
                <Input
                  ref={nameRef}
                  id={`${id}-new-name`}
                  inputSize="lg"
                  value={values.newItemName}
                  onChange={(e) => {
                    setMode("new");
                    setValues({ ...values, newItemName: e.target.value });
                  }}
                  maxLength={300}
                  autoComplete="off"
                  aria-invalid={errors.newItemName || errors.productId ? true : undefined}
                  aria-describedby={describedBy(`${id}-new-name`, { error: errors.newItemName || errors.productId })}
                />
              </Field>
              <Field htmlFor={`${id}-new-cost`} label={t.newItemCost} optional error={errors.newItemCost}>
                <Input
                  id={`${id}-new-cost`}
                  inputSize="lg"
                  inputMode="decimal"
                  leading={symbol}
                  value={values.newItemCost}
                  onChange={(e) => setValues({ ...values, newItemCost: e.target.value })}
                  autoComplete="off"
                  aria-invalid={errors.newItemCost ? true : undefined}
                />
              </Field>
            </div>
            {stock.length > 0 ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => {
                  setMode("pick");
                  requestAnimationFrame(() => searchRef.current?.focus());
                }}
              >
                {t.search}
              </Button>
            ) : (
              <p className="text-xs text-ink-3">{t.emptyStock}</p>
            )}
          </fieldset>
        ) : (
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-medium text-ink">{t.whichItem}</legend>
            <Input
              ref={searchRef}
              type="search"
              inputSize="lg"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                // Enter picks the first match instead of submitting the form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtered[0]) choose(filtered[0]);
                }
              }}
              placeholder={t.search}
              aria-label={t.search}
              autoComplete="off"
              leading={<Search className="size-4" aria-hidden />}
              aria-invalid={errors.productId ? true : undefined}
              aria-describedby={errors.productId ? `${id}-pick-error` : undefined}
            />
            {errors.productId ? (
              <p id={`${id}-pick-error`} role="alert" className="text-xs font-medium text-negative-700">
                {errors.productId}
              </p>
            ) : null}
            <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-md border border-line" aria-label={t.whichItem}>
              {filtered.length === 0 ? <li className="px-3.5 py-3 text-sm text-ink-3">{t.noMatch}</li> : null}
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => choose(item)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 px-3.5 py-2 text-left hover:bg-hover focus-visible:bg-hover"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-md text-ink">{item.name}</span>
                      <span className="block text-xs text-ink-3">{t.boughtOn(f.date(item.stockedOn))}</span>
                    </span>
                    <span className="shrink-0 text-sm text-ink-2 tabular">{costLabel(item.unitCostE4)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => {
                setMode("new");
                setValues((v) => ({ ...v, newItemName: v.newItemName || search }));
                requestAnimationFrame(() => nameRef.current?.focus());
              }}
            >
              <Plus aria-hidden />
              {t.notInStock}
            </Button>
          </fieldset>
        )}

        {/* The sale */}
        <div className="grid grid-cols-2 gap-3">
          <Field htmlFor={`${id}-price`} label={t.price} error={errors.price} className="col-span-2 sm:col-span-1">
            <Input
              ref={priceRef}
              id={`${id}-price`}
              inputSize="lg"
              inputMode="decimal"
              leading={symbol}
              value={values.price}
              onChange={(e) => setValues({ ...values, price: e.target.value })}
              autoComplete="off"
              enterKeyHint="done"
              aria-invalid={errors.price ? true : undefined}
              aria-describedby={describedBy(`${id}-price`, { hint: true, error: errors.price })}
            />
          </Field>
          <Field htmlFor={`${id}-channel`} label={t.platform} className="col-span-1">
            <NativeSelect id={`${id}-channel`} inputSize="lg" value={values.channel} onChange={(e) => setValues({ ...values, channel: e.target.value as PlatformId })}>
              {SALES_CHANNELS.map((p) => (
                <option key={p} value={p}>
                  {platformName(p, locale)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field htmlFor={`${id}-date`} label={t.date} error={errors.date} className="col-span-1">
            <Input id={`${id}-date`} inputSize="lg" type="date" max={today} value={values.date} onChange={(e) => setValues({ ...values, date: e.target.value })} aria-invalid={errors.date ? true : undefined} />
          </Field>
        </div>
        {!errors.price ? (
          <p id={`${id}-price-hint`} className="-mt-2 text-xs text-ink-3">
            {t.priceHint}
          </p>
        ) : null}

        {/* Optional fees, collapsed */}
        <div className="rounded-md border border-line">
          <button
            type="button"
            className="flex min-h-11 w-full items-center justify-between gap-2 px-3.5 text-left text-sm font-medium text-ink"
            aria-expanded={feesOpen}
            aria-controls={`${id}-fees`}
            onClick={() => setFeesOpen((o) => !o)}
          >
            {t.fees}
            <ChevronDown className={cn("size-4 text-ink-3 transition-transform", feesOpen && "rotate-180")} aria-hidden />
          </button>
          <div id={`${id}-fees`} hidden={!feesOpen} className="space-y-3 border-t border-line px-3.5 pt-3 pb-3.5">
            <div className="grid grid-cols-2 gap-3">
              <Field htmlFor={`${id}-ship`} label={t.shippingCost} error={errors.shippingCost}>
                <Input id={`${id}-ship`} inputSize="lg" inputMode="decimal" leading={symbol} value={values.shippingCost} onChange={(e) => setValues({ ...values, shippingCost: e.target.value })} autoComplete="off" aria-invalid={errors.shippingCost ? true : undefined} />
              </Field>
              <Field htmlFor={`${id}-fee`} label={t.platformFee} error={errors.platformFee}>
                <Input id={`${id}-fee`} inputSize="lg" inputMode="decimal" leading={symbol} value={values.platformFee} onChange={(e) => setValues({ ...values, platformFee: e.target.value })} autoComplete="off" aria-invalid={errors.platformFee ? true : undefined} />
              </Field>
            </div>
            <p className="text-xs text-ink-3">{t.feesHint}</p>
          </div>
        </div>

        <FormError message={formError} />
        <Button type="submit" size="lg" variant="accent" loading={pending} className="w-full">
          <Tag aria-hidden />
          {t.submit}
        </Button>
      </form>
    </DialogContent>
  );
}
