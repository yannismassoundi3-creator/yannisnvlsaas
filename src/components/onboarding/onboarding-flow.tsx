"use client";

import { ArrowRight, Check, FileSpreadsheet, LayoutDashboard, PencilLine, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { COMMON_CURRENCIES, currencyName } from "@/lib/finance/currency";
import { completeOnboarding, createDemoStore, createWorkspace } from "@/lib/onboarding/actions";
import { PLATFORM_NAMES, PLATFORMS, type PlatformId } from "@/lib/onboarding/constants";
import { cn } from "@/lib/utils";

const STEPS = ["Store profile", "Currency and reporting", "Add your data", "Explore a sample"] as const;

type Props = { initialStep: 0 | 2; defaultName: string | null };

function allCurrencies(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (k: string) => string[] };
  const all = intl.supportedValuesOf ? intl.supportedValuesOf("currency") : [...COMMON_CURRENCIES];
  const common = new Set<string>(COMMON_CURRENCIES);
  return all.filter((c) => !common.has(c));
}

function allTimezones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (k: string) => string[] };
  return intl.supportedValuesOf ? intl.supportedValuesOf("timeZone") : ["UTC", "Europe/Paris", "Europe/London", "America/New_York"];
}

export function OnboardingFlow({ initialStep, defaultName }: Props) {
  const router = useRouter();
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
    pricesIncludeTax: "" as "" | "yes" | "no",
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const otherCurrencies = useMemo(allCurrencies, []);
  // Always offer UTC and the browser's own zone, which may be missing from the canonical list.
  const timezones = useMemo(() => {
    const list = allTimezones();
    return [...new Set(["UTC", browserTz, ...list])].sort((a, b) => (a === "UTC" ? -1 : b === "UTC" ? 1 : a.localeCompare(b)));
  }, [browserTz]);

  function next() {
    setError(null);
    if (step === 0) {
      if (!form.storeName.trim()) return setFieldErrors({ storeName: "Enter your store's name." });
      setFieldErrors({});
      setStep(1);
    }
  }

  const failed = () => setError("Something went wrong. Please try again.");

  function submitWorkspace() {
    setError(null);
    if (!form.pricesIncludeTax) return setFieldErrors({ pricesIncludeTax: "Tell us whether your prices include tax." });
    startTransition(async () => {
      const result = await createWorkspace({ ...form, pricesIncludeTax: form.pricesIncludeTax as "yes" | "no" }).catch(() => null);
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
      <ol className="flex gap-2 overflow-x-auto md:flex-col md:gap-0" aria-label="Onboarding progress">
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
              <span className={cn("text-sm whitespace-nowrap", state === "current" ? "font-medium text-ink" : "text-ink-3")}>
                {label}
                {i >= 2 ? <span className="ml-1.5 text-xs text-ink-3">Optional</span> : null}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="rounded-lg border border-line bg-surface p-6 shadow-sm sm:p-8">
        {error ? <Alert tone="negative" className="mb-5">{error}</Alert> : null}

        {step === 0 ? (
          <StepShell title={defaultName ? `Welcome, ${defaultName.split(" ")[0]}. Tell us about your store.` : "Tell us about your store."} description="This creates your workspace. You can change these details later in settings.">
            <div className="space-y-4">
              <Field htmlFor="storeName" label="Store name" error={fieldErrors.storeName}>
                <Input id="storeName" value={form.storeName} onChange={(e) => set("storeName", e.target.value)} maxLength={120} autoFocus aria-invalid={fieldErrors.storeName ? true : undefined} />
              </Field>
              <Field htmlFor="organizationName" label="Business name" optional hint="Defaults to the store name.">
                <Input id="organizationName" value={form.organizationName} onChange={(e) => set("organizationName", e.target.value)} maxLength={120} />
              </Field>
              <Field htmlFor="platform" label="Where do you sell?">
                <NativeSelect id="platform" value={form.platform} onChange={(e) => set("platform", e.target.value as PlatformId)}>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_NAMES[p]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <StepActions>
              <Button onClick={next}>
                Continue
                <ArrowRight aria-hidden />
              </Button>
            </StepActions>
          </StepShell>
        ) : null}

        {step === 1 ? (
          <StepShell title="Currency and reporting" description="Narixia reports every amount in your store currency and assigns orders to days in your time zone.">
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field htmlFor="currency" label="Store currency" hint="Cannot be changed later." error={fieldErrors.currency}>
                  <NativeSelect id="currency" value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                    <optgroup label="Common">
                      {COMMON_CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c} — {currencyName(c)}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="All currencies">
                      {otherCurrencies.map((c) => (
                        <option key={c} value={c}>
                          {c} — {currencyName(c)}
                        </option>
                      ))}
                    </optgroup>
                  </NativeSelect>
                </Field>
                <Field htmlFor="timezone" label="Reporting time zone" error={fieldErrors.timezone}>
                  <NativeSelect id="timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
                    {timezones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replaceAll("_", " ")}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <fieldset>
                <legend className="text-sm font-medium text-ink">Do your selling prices include VAT or sales tax?</legend>
                <p className="mt-0.5 text-xs text-ink-3">Narixia removes tax before calculating margins. This applies to data you add from now on.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {[
                    { value: "yes", title: "Yes, prices include tax", text: "Common in the EU and UK. Order totals already contain VAT." },
                    { value: "no", title: "No, tax is added on top", text: "Common in the US and Canada. Tax is added at checkout." },
                  ].map((o) => (
                    <label
                      key={o.value}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-md border p-3.5 transition-colors",
                        form.pricesIncludeTax === o.value ? "border-navy-800 bg-navy-50 ring-1 ring-navy-800" : "border-line-strong hover:bg-hover",
                      )}
                    >
                      <input
                        type="radio"
                        name="pricesIncludeTax"
                        value={o.value}
                        checked={form.pricesIncludeTax === o.value}
                        onChange={() => set("pricesIncludeTax", o.value as "yes" | "no")}
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
                Back
              </Button>
              <Button onClick={submitWorkspace} loading={pending}>
                Create my workspace
              </Button>
            </StepActions>
          </StepShell>
        ) : null}

        {step === 2 ? (
          <StepShell title="Add your first data" description="Your 14-day free trial has started. Bring in some data to see your real margins.">
            <div className="grid gap-3">
              <ChoiceCard
                icon={<FileSpreadsheet />}
                title="Import a CSV export"
                text="Orders, products and costs, ad spend or expenses. Shopify exports are recognised automatically."
                badge="Recommended"
                onClick={() => startTransition(() => completeOnboarding("import"))}
                disabled={pending}
              />
              <ChoiceCard
                icon={<PencilLine />}
                title="Enter products and costs by hand"
                text="Start with your product catalogue and unit costs. Add orders later."
                onClick={() => startTransition(() => completeOnboarding("products"))}
                disabled={pending}
              />
            </div>
            <StepActions>
              <Button variant="ghost" onClick={() => setStep(3)} disabled={pending}>
                Skip for now
              </Button>
            </StepActions>
          </StepShell>
        ) : null}

        {step === 3 ? (
          <StepShell title="Explore a sample dashboard" description="See Narixia with a complete, fictional store before your own data arrives.">
            <div className="rounded-md border border-line bg-sunken/50 p-4 text-sm text-ink-2">
              <p className="flex items-center gap-2 font-medium text-ink">
                <Badge tone="demo">Demo data</Badge> How the sample store works
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>It is a separate store, labelled as demo data everywhere. Your real store stays empty and untouched.</li>
                <li>Switch between the sample and your store from the store menu in the sidebar.</li>
                <li>When your real data is in, delete the sample store from settings in one click.</li>
              </ul>
            </div>
            <StepActions>
              <Button variant="ghost" onClick={() => startTransition(() => completeOnboarding("dashboard"))} disabled={pending}>
                <LayoutDashboard aria-hidden />
                Go to my dashboard
              </Button>
              <Button variant="accent" onClick={createSample} loading={pending}>
                <Sparkles aria-hidden />
                Create the sample store
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
