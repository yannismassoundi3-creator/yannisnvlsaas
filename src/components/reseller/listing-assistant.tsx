"use client";

import { Copy, Sparkles, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { describedBy, Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import type { Locale } from "@/i18n/config";
import { useLocale } from "@/i18n/client";
import { listingMessages, type ListingErrorCode } from "@/i18n/messages/listing";
import { platformName } from "@/lib/onboarding/constants";
import { CONDITIONS, type Condition, type Confidence, type Listing, type ListingPlatform } from "@/lib/listing/schema";

/**
 * "Write the listing with AI" in the "Add an item" dialog. Shown once photos
 * are ready. Off ("coming soon") until the server has an API key and the
 * database has the AI migration. The listing is a suggestion: every field can
 * be edited, the price is labelled as an estimate without market data, and
 * nothing is stored (the seller copies what they need; "Use this title" fills
 * the item name, saved only with the item).
 */

type Status = { status: "loading" } | { status: "unavailable" } | { status: "paused" } | { status: "ready"; remaining: number; limit: number };

type Draft = {
  title: string;
  description: string;
  brand: string;
  brandConfidence: Confidence;
  material: string;
  materialConfidence: Confidence;
  size: string;
  category: string;
  colors: string;
  condition: Condition;
  defects: string;
  low: string;
  high: string;
  priceNote: string;
  audience: string;
  keywords: string;
  platforms: { platform: ListingPlatform; reason: string }[];
  test: boolean;
};

/** Euro cents as typed in a field ("15" or "15,50" in French). */
function centsToInput(cents: number, locale: Locale): string {
  const value = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
  return locale === "fr" ? value.replace(".", ",") : value;
}

function toDraft(listing: Listing, locale: Locale, test: boolean): Draft {
  return {
    title: listing.title,
    description: listing.description,
    brand: listing.brand ?? "",
    brandConfidence: listing.brandConfidence,
    material: listing.material ?? "",
    materialConfidence: listing.materialConfidence,
    size: listing.size ?? "",
    category: listing.category,
    colors: listing.colors.join(", "),
    condition: listing.condition,
    defects: listing.defects.join("\n"),
    low: listing.priceRange ? centsToInput(listing.priceRange.low, locale) : "",
    high: listing.priceRange ? centsToInput(listing.priceRange.high, locale) : "",
    priceNote: listing.priceNote,
    audience: listing.targetAudience,
    keywords: listing.keywords.join(", "),
    platforms: listing.platforms,
    test,
  };
}

async function copyText(text: string, messages: { copied: string; copyFailed: string }) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(messages.copied);
  } catch {
    toast.error(messages.copyFailed);
  }
}

export function ListingAssistant({
  photoCount,
  photosBusy,
  aiImages,
  name,
  price,
  onUseTitle,
}: {
  /** Ready photos; the assistant shows only when there is at least one. */
  photoCount: number;
  photosBusy: boolean;
  aiImages: () => Promise<string[]>;
  name: string;
  price: string;
  onUseTitle: (title: string) => void;
}) {
  const id = useId();
  const locale = useLocale();
  const t = listingMessages[locale].ai;
  const [status, setStatus] = useState<Status>({ status: "loading" });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<ListingErrorCode | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const controller = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/listing", { signal: abort.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((body: { status?: string; remaining?: number; limit?: number }) => {
        if (body.status === "ready" && typeof body.remaining === "number") setStatus({ status: "ready", remaining: body.remaining, limit: body.limit ?? body.remaining });
        else setStatus({ status: body.status === "paused" ? "paused" : "unavailable" });
      })
      .catch(() => {
        if (!abort.signal.aborted) setStatus({ status: "unavailable" });
      });
    return () => {
      abort.abort();
      controller.current?.abort();
    };
  }, []);

  if (photoCount === 0 || status.status === "loading" || status.status === "paused") return null;

  const analyse = async () => {
    setError(null);
    setInfo(null);
    setRunning(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const images = await aiImages();
      const response = await fetch("/api/listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images, name, price, locale }),
        signal: abort.signal,
      });
      const body = (await response.json().catch(() => null)) as
        | { ok: true; listing: Listing; remaining: number; limit: number; test?: boolean }
        | { ok: false; code: ListingErrorCode }
        | null;
      if (!body) return setError("unavailable");
      if (!body.ok) {
        setError(body.code in t.errors ? body.code : "unavailable");
        if (body.code === "quota" && status.status === "ready") setStatus({ ...status, remaining: 0 });
        return;
      }
      setStatus({ status: "ready", remaining: body.remaining, limit: body.limit });
      setDraft(toDraft(body.listing, locale, Boolean(body.test)));
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch {
      if (abort.signal.aborted) setInfo(t.cancelled);
      else setError("network");
    } finally {
      setRunning(false);
      controller.current = null;
    }
  };

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  if (status.status === "unavailable") {
    return (
      <section aria-labelledby={`${id}-title`} className="space-y-2 rounded-md border border-line bg-sunken/60 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`${id}-title`} className="text-sm font-medium text-ink">
            {t.button}
          </h3>
          <Badge tone="info">{t.comingSoon}</Badge>
        </div>
        <p className="text-xs text-ink-3">{t.comingSoonText}</p>
        <Button type="button" variant="secondary" size="lg" className="w-full" disabled aria-describedby={`${id}-soon`}>
          <Sparkles aria-hidden />
          {t.comingSoon}
        </Button>
        <span id={`${id}-soon`} className="sr-only">
          {t.comingSoonText}
        </span>
      </section>
    );
  }

  const exhausted = status.remaining <= 0;
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3 rounded-md border border-line p-3.5">
      <h3 id={`${id}-title`} className="sr-only">
        {t.button}
      </h3>
      {running ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <Button type="button" variant="accent" size="lg" className="w-full" loading>
            {t.button}
          </Button>
          <p className="text-sm text-ink-2">{t.loading}</p>
          <Button type="button" variant="secondary" className="w-full" onClick={() => controller.current?.abort()}>
            <X aria-hidden />
            {t.cancel}
          </Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Button type="button" variant="accent" size="lg" className="w-full" disabled={exhausted || photosBusy} onClick={() => void analyse()} aria-describedby={`${id}-quota ${id}-privacy`}>
            <Sparkles aria-hidden />
            {t.button}
          </Button>
          <p id={`${id}-quota`} className="text-xs font-medium text-ink-2 tabular">
            {exhausted ? t.exhausted : t.remaining(status.remaining)}
          </p>
        </div>
      )}
      <p id={`${id}-privacy`} className="text-xs text-ink-3">
        {t.privacy}
      </p>
      {error ? (
        <Alert
          tone="negative"
          action={
            error !== "quota" && error !== "paused" && error !== "signIn" ? (
              <Button type="button" size="sm" variant="secondary" onClick={() => void analyse()}>
                {t.retry}
              </Button>
            ) : undefined
          }
        >
          {t.errors[error]}
        </Alert>
      ) : null}
      {info ? <Alert tone="info">{info}</Alert> : null}
      {draft ? <ListingResult id={id} draft={draft} set={set} onUseTitle={onUseTitle} headingRef={resultRef} /> : null}
    </section>
  );
}

function ConfidenceNote({ value }: { value: Confidence }) {
  const t = listingMessages[useLocale()].ai;
  return <Badge tone={value === "visible_label" ? "positive" : value === "likely" ? "caution" : "neutral"}>{t.confidence[value]}</Badge>;
}

function ListingResult({
  id,
  draft,
  set,
  onUseTitle,
  headingRef,
}: {
  id: string;
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  onUseTitle: (title: string) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const locale = useLocale();
  const t = listingMessages[locale].ai;
  const f = (name: string) => `${id}-field-${name}`;
  return (
    <div className="space-y-4 rounded-md border border-emerald-100 bg-surface p-3.5 shadow-xs" data-testid="listing-result">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 ref={headingRef} tabIndex={-1} className="text-md font-semibold text-ink focus-visible:outline-none">
            {t.resultTitle}
          </h4>
          {draft.test ? <Badge tone="demo">{t.testData}</Badge> : null}
        </div>
        <p className="text-xs text-ink-3">{t.resultHint}</p>
      </div>

      <Field htmlFor={f("title")} label={t.title} aside={<span className="text-xs text-ink-3 tabular">{t.titleCount(draft.title.length)}</span>}>
        <Input id={f("title")} value={draft.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} autoComplete="off" />
      </Field>
      <div className="-mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => void copyText(draft.title, t)}>
          <Copy aria-hidden />
          {t.copyTitle}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            onUseTitle(draft.title.trim());
            toast.success(t.titleUsed);
          }}
        >
          {t.useTitle}
        </Button>
      </div>

      <Field htmlFor={f("description")} label={t.description}>
        <Textarea id={f("description")} value={draft.description} rows={7} maxLength={2000} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <div className="-mt-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => void copyText(draft.description, t)}>
          <Copy aria-hidden />
          {t.copyDescription}
        </Button>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-medium text-ink">{t.details}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field htmlFor={f("brand")} label={t.brand} aside={<ConfidenceNote value={draft.brandConfidence} />}>
            <Input id={f("brand")} value={draft.brand} maxLength={80} onChange={(e) => set({ brand: e.target.value })} autoComplete="off" />
          </Field>
          <Field htmlFor={f("material")} label={t.material} aside={<ConfidenceNote value={draft.materialConfidence} />}>
            <Input id={f("material")} value={draft.material} maxLength={80} onChange={(e) => set({ material: e.target.value })} autoComplete="off" />
          </Field>
          <Field htmlFor={f("size")} label={t.size} hint={t.sizeHint}>
            <Input id={f("size")} value={draft.size} maxLength={40} onChange={(e) => set({ size: e.target.value })} autoComplete="off" aria-describedby={describedBy(f("size"), { hint: true })} />
          </Field>
          <Field htmlFor={f("condition")} label={t.condition}>
            <NativeSelect id={f("condition")} value={draft.condition} onChange={(e) => set({ condition: e.target.value as Condition })}>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {t.conditions[c]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field htmlFor={f("category")} label={t.category}>
            <Input id={f("category")} value={draft.category} maxLength={80} onChange={(e) => set({ category: e.target.value })} autoComplete="off" />
          </Field>
          <Field htmlFor={f("colors")} label={t.colors} hint={t.listHint}>
            <Input id={f("colors")} value={draft.colors} maxLength={200} onChange={(e) => set({ colors: e.target.value })} autoComplete="off" aria-describedby={describedBy(f("colors"), { hint: true })} />
          </Field>
        </div>
        <Field htmlFor={f("defects")} label={t.defects} hint={draft.defects.trim() ? t.defectsHint : t.noDefects}>
          <Textarea id={f("defects")} value={draft.defects} rows={3} maxLength={2000} onChange={(e) => set({ defects: e.target.value })} aria-describedby={describedBy(f("defects"), { hint: true })} className="min-h-16" />
        </Field>
      </fieldset>

      <fieldset className="space-y-2 rounded-md border border-caution-100 bg-caution-50 p-3">
        <legend className="px-1 text-sm font-medium text-ink">{t.price}</legend>
        <p id={f("price-warning")} className="text-xs font-medium text-caution-800">
          {t.priceWarning}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field htmlFor={f("low")} label={t.priceLow}>
            <Input id={f("low")} inputMode="decimal" leading="€" value={draft.low} onChange={(e) => set({ low: e.target.value })} autoComplete="off" aria-describedby={f("price-warning")} />
          </Field>
          <Field htmlFor={f("high")} label={t.priceHigh}>
            <Input id={f("high")} inputMode="decimal" leading="€" value={draft.high} onChange={(e) => set({ high: e.target.value })} autoComplete="off" aria-describedby={f("price-warning")} />
          </Field>
        </div>
        <p className="text-xs text-ink-2">{draft.low || draft.high ? draft.priceNote : t.noPrice}</p>
      </fieldset>

      <Field htmlFor={f("audience")} label={t.audience}>
        <Input id={f("audience")} value={draft.audience} maxLength={120} onChange={(e) => set({ audience: e.target.value })} autoComplete="off" />
      </Field>
      <Field htmlFor={f("keywords")} label={t.keywords} hint={t.listHint}>
        <Input id={f("keywords")} value={draft.keywords} maxLength={400} onChange={(e) => set({ keywords: e.target.value })} autoComplete="off" aria-describedby={describedBy(f("keywords"), { hint: true })} />
      </Field>

      <div>
        <h5 className="mb-1.5 text-sm font-medium text-ink">{t.platforms}</h5>
        <ol className="space-y-1.5">
          {draft.platforms.map((p, i) => (
            <li key={p.platform} className="flex gap-2 text-sm">
              <span className="w-4 shrink-0 text-ink-3 tabular" aria-hidden>
                {i + 1}.
              </span>
              <span>
                <span className="font-medium text-ink">{platformName(p.platform, locale)}</span>
                <span className="text-ink-2"> — {p.reason}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
