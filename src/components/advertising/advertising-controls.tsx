"use client";

import { Plus } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { linkCampaignProduct, saveAdSpend } from "@/lib/advertising/actions";
import { PLATFORM_LABELS, platformLabel, type Platform } from "@/lib/domain/types";
import { currencySymbol } from "@/lib/finance/currency";
import { useLocale } from "@/i18n/client";
import { advertisingMessages } from "@/i18n/messages/catalog-advertising";

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
  const t = advertisingMessages[useLocale()];
  const [value, setValue] = useState(productId ?? "");
  const [pending, startTransition] = useTransition();
  const known = products.some((p) => p.id === productId);
  return (
    <NativeSelect
      inputSize="sm"
      className="w-52"
      value={value}
      disabled={disabled || pending}
      aria-label={t.productPromotedBy(campaignName)}
      onChange={(e) => {
        const next = e.target.value;
        const previous = value;
        setValue(next);
        startTransition(async () => {
          const r = await linkCampaignProduct(campaignId, next || null);
          if (!r.ok) {
            setValue(previous);
            toast.error(r.message);
          } else toast.success(next ? t.campaignLinked : t.campaignUnlinked);
        });
      }}
    >
      <option value="">{t.storeWide}</option>
      {productId && !known ? <option value={productId}>{t.archivedProduct}</option> : null}
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
  const locale = useLocale();
  const t = advertisingMessages[locale];
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
          {t.addSpend}
        </Button>
      </DialogTrigger>
      <DialogContent title={t.addSpendTitle} description={t.addSpendDescription}>
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
              toast.success(r.replaced ? t.spendReplaced : t.spendAdded);
            });
          }}
        >
          <Field htmlFor={`${id}-campaign`} label={t.campaign} error={errors.campaignId}>
            <NativeSelect id={`${id}-campaign`} value={values.campaignId} onChange={set("campaignId")}>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {platformLabel(c.platform as Platform, locale) ?? c.platform}
                </option>
              ))}
              <option value="new">{t.newCampaign}</option>
            </NativeSelect>
          </Field>
          {values.campaignId === "new" ? (
            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <Field htmlFor={`${id}-platform`} label={t.platform}>
                <NativeSelect id={`${id}-platform`} value={values.newPlatform} onChange={set("newPlatform")}>
                  {(Object.keys(PLATFORM_LABELS) as Platform[]).map((value) => (
                    <option key={value} value={value}>
                      {platformLabel(value, locale)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field htmlFor={`${id}-name`} label={t.campaignName} error={errors.newName}>
                <Input id={`${id}-name`} value={values.newName} onChange={set("newName")} aria-invalid={errors.newName ? true : undefined} aria-describedby={describedBy(`${id}-name`, { error: errors.newName })} />
              </Field>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor={`${id}-date`} label={t.day} error={errors.date}>
              <Input id={`${id}-date`} type="date" value={values.date} max={defaultDate} onChange={set("date")} aria-invalid={errors.date ? true : undefined} />
            </Field>
            <Field htmlFor={`${id}-spend`} label={t.spend} hint={t.excludingVat} error={errors.spend}>
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
            <summary className="cursor-pointer text-sm font-medium text-ink-2">{t.platformFigures}</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field htmlFor={`${id}-impr`} label={t.impressions} error={errors.impressions}>
                <Input id={`${id}-impr`} inputMode="numeric" value={values.impressions} onChange={set("impressions")} />
              </Field>
              <Field htmlFor={`${id}-clicks`} label={t.clicks} error={errors.clicks}>
                <Input id={`${id}-clicks`} inputMode="numeric" value={values.clicks} onChange={set("clicks")} />
              </Field>
              <Field htmlFor={`${id}-conv`} label={t.conversions} error={errors.conversions}>
                <Input id={`${id}-conv`} inputMode="numeric" value={values.conversions} onChange={set("conversions")} />
              </Field>
              <Field htmlFor={`${id}-value`} label={t.conversionValue} hint={t.conversionValueHint} error={errors.conversionValue}>
                <Input id={`${id}-value`} inputMode="decimal" leading={symbol} value={values.conversionValue} onChange={set("conversionValue")} />
              </Field>
            </div>
          </details>
          <p className="text-xs text-ink-3">{t.replaceNote}</p>
          {formError ? (
            <p role="alert" className="text-sm font-medium text-negative-700">
              {formError}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              {t.saveSpend}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
