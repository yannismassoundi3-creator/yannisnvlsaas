"use client";

import { Plus } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { currencySymbol } from "@/lib/finance/currency";
import { e4ToInputValue, minorToInputValue } from "@/lib/finance/money";
import { createProduct, updateProduct } from "@/lib/products/actions";
import { useLocale } from "@/i18n/client";
import { productsMessages } from "@/i18n/messages/catalog-products";

type Values = { name: string; sku: string; unitCost: string; price: string };

type FormProps = {
  currency: string;
  initial?: { name: string; sku: string | null; unitCostE4: number | null; priceMinor: number | null };
  productId?: string;
  onDone?: (productId: string) => void;
  submitLabel: string;
  disabled?: boolean;
};

export function ProductForm({ currency, initial, productId, onDone, submitLabel, disabled = false }: FormProps) {
  const id = useId();
  const t = productsMessages[useLocale()];
  const [values, setValues] = useState<Values>({
    name: initial?.name ?? "",
    sku: initial?.sku ?? "",
    unitCost: initial?.unitCostE4 != null ? e4ToInputValue(initial.unitCostE4) : "",
    price: initial?.priceMinor != null ? minorToInputValue(initial.priceMinor, currency) : "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const symbol = currencySymbol(currency);

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = productId ? await updateProduct(productId, values) : await createProduct(values);
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {});
            setFormError(result.fieldErrors ? null : result.message);
            return;
          }
          setErrors({});
          setFormError(null);
          toast.success(productId ? t.productSaved : t.productAdded);
          onDone?.(productId ?? ("productId" in result ? (result as { productId: string }).productId : ""));
        });
      }}
    >
      <Field htmlFor={`${id}-name`} label={t.name} error={errors.name}>
        <Input id={`${id}-name`} value={values.name} onChange={set("name")} required aria-invalid={errors.name ? true : undefined} aria-describedby={describedBy(`${id}-name`, { error: errors.name })} disabled={disabled} />
      </Field>
      <Field htmlFor={`${id}-sku`} label={t.skuLabel} optional hint={t.skuHint} error={errors.sku}>
        <Input id={`${id}-sku`} value={values.sku} onChange={set("sku")} aria-invalid={errors.sku ? true : undefined} aria-describedby={describedBy(`${id}-sku`, { hint: true, error: errors.sku })} disabled={disabled} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor={`${id}-cost`} label={t.unitCost} optional hint={t.unitCostHint} error={errors.unitCost}>
          <Input
            id={`${id}-cost`}
            inputMode="decimal"
            leading={symbol}
            value={values.unitCost}
            onChange={set("unitCost")}
            placeholder={t.amountPlaceholder}
            aria-invalid={errors.unitCost ? true : undefined}
            aria-describedby={describedBy(`${id}-cost`, { hint: true, error: errors.unitCost })}
            disabled={disabled}
          />
        </Field>
        <Field htmlFor={`${id}-price`} label={t.sellingPrice} optional hint={t.sellingPriceHint} error={errors.price}>
          <Input
            id={`${id}-price`}
            inputMode="decimal"
            leading={symbol}
            value={values.price}
            onChange={set("price")}
            placeholder={t.amountPlaceholder}
            aria-invalid={errors.price ? true : undefined}
            aria-describedby={describedBy(`${id}-price`, { hint: true, error: errors.price })}
            disabled={disabled}
          />
        </Field>
      </div>
      {formError ? (
        <p role="alert" className="text-sm font-medium text-negative-700">
          {formError}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" loading={pending} disabled={disabled}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function AddProductDialog({ currency, defaultOpen = false, disabled = false }: { currency: string; defaultOpen?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(defaultOpen && !disabled);
  const router = useRouter();
  const t = productsMessages[useLocale()];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={disabled}>
          <Plus aria-hidden />
          {t.addProduct}
        </Button>
      </DialogTrigger>
      <DialogContent title={t.addProductTitle} description={t.addProductDescription}>
        <ProductForm
          currency={currency}
          submitLabel={t.addProduct}
          onDone={(productId) => {
            setOpen(false);
            if (productId) router.push(`/app/products/${productId}` as Route);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
