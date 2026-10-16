"use client";

import { Plus } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { linkCampaignProduct, saveAdSpend } from "@/lib/advertising/actions";
import { PLATFORM_LABELS, type Platform } from "@/lib/domain/types";
import { currencySymbol } from "@/lib/finance/currency";

/** Product a campaign promotes. Changing it moves the campaign's spend into that product's margin. */
export function CampaignLinkSelect({
  campaignId,
  campaignName,
  productId,
  products,
  disabled,
}: {
  campaignId: string;
  campaignName: string;
  productId: string | null;
  products: { id: string; name: string; sku: string | null }[];
  disabled: boolean;
}) {
  const [value, setValue] = useState(productId ?? "");
  const [pending, startTransition] = useTransition();
  const known = products.some((p) => p.id === productId);
  return (
    <NativeSelect
      inputSize="sm"
      className="w-52"
      value={value}
      disabled={disabled || pending}
      aria-label={`Product promoted by ${campaignName}`}
      onChange={(e) => {
        const next = e.target.value;
        const previous = value;
        setValue(next);
        startTransition(async () => {
          const r = await linkCampaignProduct(campaignId, next || null);
          if (!r.ok) {
            setValue(previous);
            toast.error(r.message);
          } else toast.success(next ? "Campaign linked: its spend now counts in that product's margin." : "Campaign unlinked: its spend stays at store level.");
        });
      }}
    >
      <option value="">Several products / store-wide</option>
      {productId && !known ? <option value={productId}>Archived product</option> : null}
      {products.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.sku ? ` (${p.sku})` : ""}
        </option>
      ))}
    </NativeSelect>
  );
}

type SpendValues = {
  campaignId: string;
  newPlatform: Platform;
  newName: string;
  date: string;
  spend: string;
  clicks: string;
  impressions: string;
  conversions: string;
  conversionValue: string;
};

export function AddSpendDialog({
  campaigns,
  currency,
  defaultDate,
  disabled,
}: {
  campaigns: { id: string; platform: string; name: string }[];
  currency: string;
  defaultDate: string;
  disabled: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const initial: SpendValues = {
    campaignId: campaigns[0]?.id ?? "new",
    newPlatform: "meta",
    newName: "",
    date: defaultDate,
    spend: "",
    clicks: "",
    impressions: "",
    conversions: "",
    conversionValue: "",
  };
  const [values, setValues] = useState<SpendValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof SpendValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const symbol = currencySymbol(currency);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setValues(initial);
          setErrors({});
          setFormError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={disabled}>
          <Plus aria-hidden />
          Add spend
        </Button>
      </DialogTrigger>
      <DialogContent title="Add a day of ad spend" description="For campaigns you track by hand. For many days at once, import a report from your ad platform.">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await saveAdSpend(values);
              if (!r.ok) {
                setErrors(r.fieldErrors ?? {});
                setFormError(r.fieldErrors ? null : r.message);
                return;
              }
              setOpen(false);
              toast.success(r.replaced ? "Spend replaced for that day." : "Spend added.");
            });
          }}
        >
          <Field htmlFor={`${id}-campaign`} label="Campaign" error={errors.campaignId}>
            <NativeSelect id={`${id}-campaign`} value={values.campaignId} onChange={set("campaignId")}>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {PLATFORM_LABELS[c.platform as Platform] ?? c.platform}
                </option>
              ))}
              <option value="new">New campaign…</option>
            </NativeSelect>
          </Field>
          {values.campaignId === "new" ? (
            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <Field htmlFor={`${id}-platform`} label="Platform">
                <NativeSelect id={`${id}-platform`} value={values.newPlatform} onChange={set("newPlatform")}>
                  {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field htmlFor={`${id}-name`} label="Campaign name" error={errors.newName}>
                <Input id={`${id}-name`} value={values.newName} onChange={set("newName")} aria-invalid={errors.newName ? true : undefined} aria-describedby={describedBy(`${id}-name`, { error: errors.newName })} />
              </Field>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor={`${id}-date`} label="Day" error={errors.date}>
              <Input id={`${id}-date`} type="date" value={values.date} max={defaultDate} onChange={set("date")} aria-invalid={errors.date ? true : undefined} />
            </Field>
            <Field htmlFor={`${id}-spend`} label="Spend" hint="Excluding VAT." error={errors.spend}>
              <Input
                id={`${id}-spend`}
                inputMode="decimal"
                leading={symbol}
                value={values.spend}
                onChange={set("spend")}
                aria-invalid={errors.spend ? true : undefined}
                aria-describedby={describedBy(`${id}-spend`, { hint: true, error: errors.spend })}
              />
            </Field>
          </div>
          <details className="rounded-md border border-line px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-ink-2">Platform figures (optional)</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field htmlFor={`${id}-impr`} label="Impressions" error={errors.impressions}>
                <Input id={`${id}-impr`} inputMode="numeric" value={values.impressions} onChange={set("impressions")} />
              </Field>
              <Field htmlFor={`${id}-clicks`} label="Clicks" error={errors.clicks}>
                <Input id={`${id}-clicks`} inputMode="numeric" value={values.clicks} onChange={set("clicks")} />
              </Field>
              <Field htmlFor={`${id}-conv`} label="Conversions" error={errors.conversions}>
                <Input id={`${id}-conv`} inputMode="numeric" value={values.conversions} onChange={set("conversions")} />
              </Field>
              <Field htmlFor={`${id}-value`} label="Conversion value" hint="As reported by the platform." error={errors.conversionValue}>
                <Input id={`${id}-value`} inputMode="decimal" leading={symbol} value={values.conversionValue} onChange={set("conversionValue")} />
              </Field>
            </div>
          </details>
          <p className="text-xs text-ink-3">If spend is already recorded for this campaign and day, it is replaced.</p>
          {formError ? (
            <p role="alert" className="text-sm font-medium text-negative-700">
              {formError}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              Save spend
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
