"use client";

import { Shirt, Store } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { useLocale } from "@/i18n/client";
import { resellerMessages } from "@/i18n/messages/reseller";
import type { BusinessModel } from "@/lib/onboarding/constants";
import { updateBusinessModel } from "@/lib/reseller/actions";
import { cn } from "@/lib/utils";

/** Settings → Store: how the store sells (changes the home page and the menu, never the data). */
export function BusinessModelForm({ current, disabled }: { current: BusinessModel; disabled: boolean }) {
  const t = resellerMessages[useLocale()];
  const [value, setValue] = useState<BusinessModel>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const options: { value: BusinessModel; title: string; text: string; icon: ReactNode }[] = [
    { value: "reseller", title: t.modes.resellerTitle, text: t.modes.resellerText, icon: <Shirt /> },
    { value: "ecommerce", title: t.modes.ecommerceTitle, text: t.modes.ecommerceText, icon: <Store /> },
  ];
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await updateBusinessModel(value).catch(() => null);
          if (!r || !r.ok) return setError(r?.message ?? t.settings.failed);
          setError(null);
          toast.success(t.settings.saved);
        });
      }}
    >
      <fieldset disabled={disabled}>
        <legend className="sr-only">{t.settings.title}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((o) => (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-md border p-3.5 transition-colors",
                value === o.value ? "border-navy-800 bg-navy-50 ring-1 ring-navy-800" : "border-line-strong hover:bg-hover",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input type="radio" name="businessModel" value={o.value} checked={value === o.value} onChange={() => setValue(o.value)} className="mt-1 accent-navy-800" />
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2 [&_svg]:size-4" aria-hidden>
                {o.icon}
              </span>
              <span>
                <span className="block text-sm font-medium text-ink">{o.title}</span>
                <span className="mt-0.5 block text-xs text-ink-3">{o.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm font-medium text-negative-700">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" loading={pending} disabled={disabled || value === current}>
          {t.settings.save}
        </Button>
      </div>
    </form>
  );
}
