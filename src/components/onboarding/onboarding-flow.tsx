"use client";

import { ArrowRight, Check, FileSpreadsheet, LayoutDashboard, PencilLine, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/i18n/client";
import { onboardingMessages } from "@/i18n/messages/auth-onboarding";
import { COMMON_CURRENCIES } from "@/lib/finance/currency";
import { currencyLabel, otherCurrencies, timezoneLabel, timezoneOptions } from "@/lib/locale-lists";
import { completeOnboarding, createDemoStore, createWorkspace } from "@/lib/onboarding/actions";
import { platformName, PLATFORMS, type PlatformId, type TaxChoice } from "@/lib/onboarding/constants";
import { cn } from "@/lib/utils";

type Props = { initialStep: 0 | 2; defaultName: string | null };

export function OnboardingFlow({ initialStep, defaultName }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const t = onboardingMessages[locale];
  const STEPS = t.steps;
  const [step, setStep] = useState<number>(initialStep);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const browserTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const [form, setForm] = useState({
    storeName: "",
    organizationName: "",
    platform: "shopify" as PlatformId,
    currency: "EUR",
    timezone: browserTz,
    pricesIncludeTax: "" as "" | TaxChoice,
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const moreCurrencies = useMemo(() => otherCurrencies().map((c) => ({ value: c, label: currencyLabel(c, locale) })), [locale]);
  const commonCurrencies = useMemo(() => COMMON_CURRENCIES.map((c) => ({ value: c, label: currencyLabel(c, locale) })), [locale]);
  // Always offer UTC and the browser's own zone, which may be missing from the canonical list.
  const timezones = useMemo(() => timezoneOptions([browserTz]).map((tz) => ({ value: tz, label: timezoneLabel(tz) })), [browserTz]);
  const taxOptions: { value: TaxChoice; title: string; text: string; className?: string }[] = [
    { value: "yes", title: t.reporting.taxYes, text: t.reporting.taxYesText },
    { value: "no", title: t.reporting.taxNo, text: t.reporting.taxNoText },
    // Private sellers and VAT-exempt micro-businesses: full width, under the two usual cases.
    { value: "none", title: t.reporting.taxNone, text: t.reporting.taxNoneText, className: "sm:col-span-2" },
  ];

  function next() {
    setError(null);
    if (step === 0) {
      if (!form.storeName.trim()) return setFieldErrors({ storeName: t.validation.storeName });
      setFieldErrors({});
      setStep(1);
    }
  }

  const failed = () => setError(t.genericError);

  function submitWorkspace() {
    setError(null);
    if (!form.pricesIncludeTax) return setFieldErrors({ pricesIncludeTax: t.validation.pricesIncludeTax });
    startTransition(async () => {
      const result = await createWorkspace({ ...form, pricesIncludeTax: form.pricesIncludeTax as TaxChoice }).catch(() => null);
      if (!result) return failed();
      if (!result.ok) {
        setError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        if (result.fieldErrors?.storeName || result.fieldErrors?.platform) setStep(0);
        return;
      }
      setFieldErrors({});
      setStep(2);
      router.refresh();
    });
  }

  function createSample() {
    setError(null);
    startTransition(async () => {
      const result = await createDemoStore().catch(() => null);
      if (!result) return failed();
      if (!result.ok) return setError(result.message);
      await completeOnboarding("dashboard");
    });
  }

  return (
    <div className="grid gap-8 md:grid-cols-[220px_1fr]">
      <ol className="flex gap-2 overflow-x-auto md:flex-col md:gap-0 md:overflow-visible" aria-label={t.progress}>
        {STEPS.map((label, i) => {
          const state = i < step ? "done" : i === step ? "current" : "todo";
          return (
            <li key={label} className="relative flex shrink-0 items-center gap-3 md:pb-6 md:last:pb-0" aria-current={state === "current" ? "step" : undefined}>
              {i < STEPS.length - 1 ? <span aria-hidden className="absolute top-7 bottom-0 left-[13px] hidden w-px bg-line-strong md:block" /> : null}
              <span
                className={cn(
                  "relative flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular",
                  state === "done" && "border-emerald-600 bg-emerald-600 text-white",
                  state === "current" && "border-navy-800 bg-navy-800 text-white",
                  state === "todo" && "border-line-strong bg-surface text-ink-3",
                )}
              >
                {state === "done" ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              {/* One line in the horizontal (mobile) stepper; in the narrow side column the label wraps and "Optional" goes below it. */}
              <span className={cn("text-sm whitespace-nowrap md:whitespace-normal", state === "current" ? "font-medium text-ink" : "text-ink-3")}>
                {label}
                {i >= 2 ? <span className="ml-1.5 text-xs font-normal text-ink-3 md:ml-0 md:block">{t.optional}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="rounded-lg border border-line bg-surface p-6 shadow-sm sm:p-8">
        {error ? <Alert tone="negative" className="mb-5">{error}</Alert> : null}

        {step === 0 ? (
          <StepShell title={defaultName ? t.profile.welcome(defaultName.split(" ")[0]) : t.profile.title} description={t.profile.description}>
            <div className="space-y-4">
              <Field htmlFor="storeName" label={t.profile.storeName} error={fieldErrors.storeName}>
                <Input id="storeName" value={form.storeName} onChange={(e) => set("storeName", e.target.value)} maxLength={120} autoFocus aria-invalid={fieldErrors.storeName ? true : undefined} />
              </Field>
              <Field htmlFor="organizationName" label={t.profile.businessName} optional hint={t.profile.businessNameHint}>
                <Input id="organizationName" value={form.organizationName} onChange={(e) => set("organizationName", e.target.value)} maxLength={120} />
              </Field>
              <Field htmlFor="platform" label={t.profile.platform}>
                <NativeSelect id="platform" value={form.platform} onChange={(e) => set("platform", e.target.value as PlatformId)}>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {platformName(p, locale)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <StepActions>
              <Button onClick={next}>
                {t.profile.continue}
                <ArrowRight aria-hidden />
              </Button>
            </StepActions>
          </StepShell>
        ) : null}

        {step === 1 ? (
          <StepShell title={t.reporting.title} description={t.reporting.description}>
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field htmlFor="currency" label={t.reporting.currency} hint={t.reporting.currencyHint} error={fieldErrors.currency}>
                  <NativeSelect id="currency" value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                    <optgroup label={t.reporting.commonCurrencies}>
                      {commonCurrencies.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={t.reporting.allCurrencies}>
                      {moreCurrencies.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </optgroup>
                  </NativeSelect>
                </Field>
                <Field htmlFor="timezone" label={t.reporting.timezone} error={fieldErrors.timezone}>
                  <NativeSelect id="timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
                    {timezones.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <fieldset>
                <legend className="text-sm font-medium text-ink">{t.reporting.taxQuestion}</legend>
                <p className="mt-0.5 text-xs text-ink-3">{t.reporting.taxHelp}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {taxOptions.map((o) => (
                    <label
                      key={o.value}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-md border p-3.5 transition-colors",
                        form.pricesIncludeTax === o.value ? "border-navy-800 bg-navy-50 ring-1 ring-navy-800" : "border-line-strong hover:bg-hover",
                        o.className,
                      )}
                    >
                      <input
                        type="radio"
                        name="pricesIncludeTax"
                        value={o.value}
                        checked={form.pricesIncludeTax === o.value}
                        onChange={() => set("pricesIncludeTax", o.value)}
                        className="mt-1 accent-navy-800"
                      />
                      <span>
                        <span className="block text-sm font-medium text-ink">{o.title}</span>
                        <span className="mt-0.5 block text-xs text-ink-3">{o.text}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {fieldErrors.pricesIncludeTax ? (
                  <p role="alert" className="mt-2 text-xs font-medium text-negative-700">
                    {fieldErrors.pricesIncludeTax}
                  </p>
                ) : null}
              </fieldset>
            </div>
            <StepActions>
              <Button variant="ghost" onClick={() => setStep(0)} disabled={pending}>
                {t.reporting.back}
              </Button>
              <Button onClick={submitWorkspace} loading={pending}>
                {t.reporting.submit}
              </Button>
            </StepActions>
          </StepShell>
        ) : null}

        {step === 2 ? (
          <StepShell title={t.data.title} description={t.data.description}>
            <div className="grid gap-3">
              <ChoiceCard
                icon={<FileSpreadsheet />}
                title={t.data.importTitle}
                text={t.data.importText}
                badge={t.data.recommended}
                onClick={() => startTransition(() => completeOnboarding("import"))}
                disabled={pending}
              />
              <ChoiceCard
                icon={<PencilLine />}
                title={t.data.manualTitle}
                text={t.data.manualText}
                onClick={() => startTransition(() => completeOnboarding("products"))}
                disabled={pending}
              />
            </div>
            <StepActions>
              <Button variant="ghost" onClick={() => setStep(3)} disabled={pending}>
                {t.data.skip}
              </Button>
            </StepActions>
          </StepShell>
        ) : null}

        {step === 3 ? (
          <StepShell title={t.sample.title} description={t.sample.description}>
            <div className="rounded-md border border-line bg-sunken/50 p-4 text-sm text-ink-2">
              <p className="flex items-center gap-2 font-medium text-ink">
                <Badge tone="demo">{t.sample.demoBadge}</Badge> {t.sample.howItWorks}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {t.sample.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
            <StepActions>
              <Button variant="ghost" onClick={() => startTransition(() => completeOnboarding("dashboard"))} disabled={pending}>
                <LayoutDashboard aria-hidden />
                {t.sample.dashboard}
              </Button>
              <Button variant="accent" onClick={createSample} loading={pending}>
                <Sparkles aria-hidden />
                {t.sample.create}
              </Button>
            </StepActions>
          </StepShell>
        ) : null}
      </div>
    </div>
  );
}

function StepShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section>
      <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="mt-1 text-sm text-ink-2">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function StepActions({ children }: { children: ReactNode }) {
  return <div className="mt-8 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-5">{children}</div>;
}

function ChoiceCard({ icon, title, text, badge, onClick, disabled }: { icon: ReactNode; title: string; text: string; badge?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-start gap-4 rounded-md border border-line-strong bg-surface p-4 text-left transition-colors hover:border-control hover:bg-hover disabled:opacity-60"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2 [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium text-ink">
          {title}
          {badge ? <Badge tone="positive">{badge}</Badge> : null}
        </span>
        <span className="mt-0.5 block text-sm text-ink-2">{text}</span>
      </span>
      <ArrowRight className="mt-2 size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </button>
  );
}
