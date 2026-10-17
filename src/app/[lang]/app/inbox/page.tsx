import { ExternalLink, Inbox, KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DismissInboundButton } from "@/components/inbound/inbound-client";
import { InboundGuide } from "@/components/inbound/inbound-guide";
import { QuickActionsProvider, SellButton } from "@/components/reseller/quick-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/i18n/config";
import type { Format } from "@/i18n/format";
import { inboundMessages } from "@/i18n/messages/inbound";
import { getFormat, getLocale } from "@/i18n/server";
import { requireStore, type Store } from "@/lib/auth/workspace";
import { listPendingInbound, type InboundEntry } from "@/lib/data/inbound";
import { getSellContext, type StockOption } from "@/lib/data/reseller";
import { ReportsPausedError } from "@/lib/data/reports";
import { todayIn } from "@/lib/dates";
import { toInputDecimal } from "@/lib/finance/input";
import { minorToInputValue } from "@/lib/finance/money";
import { inboundConfig, storeInboundAddress } from "@/lib/inbound/config";
import { isPlatformId, isReseller, platformName } from "@/lib/onboarding/constants";
import { bestNameMatch } from "@/lib/reseller/logic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: inboundMessages[await getLocale()].inbox.metaTitle };
}

export default function InboxPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] rounded-lg" />}>
      <InboxContent />
    </Suspense>
  );
}

async function InboxContent() {
  const [ws, locale, f] = await Promise.all([requireStore(), getLocale(), getFormat()]);
  const store = ws.activeStore;
  if (!isReseller(store)) redirect("/app");
  const t = inboundMessages[locale].inbox;
  const enabled = inboundConfig().enabled;
  const canWrite = ws.entitlements.canWrite;
  const guide = (
    <InboundGuide address={storeInboundAddress(store.inbound_token)} locale={locale} canRegenerate={ws.role !== "member"} disabled={!canWrite} />
  );

  let entries: InboundEntry[] = [];
  let sell: Awaited<ReturnType<typeof getSellContext>> = { stock: [], defaultChannel: "other" };
  try {
    [entries, sell] = await Promise.all([listPendingInbound(store), getSellContext(store)]);
  } catch (error) {
    if (!(error instanceof ReportsPausedError)) throw error;
    entries = await listPendingInbound(store);
  }

  return (
    <QuickActionsProvider currency={store.currency} today={todayIn(store.timezone)} stock={sell.stock} defaultChannel={sell.defaultChannel} disabled={!canWrite}>
      <div className="space-y-6">
        <PageHeader eyebrow={store.name} title={t.title} description={t.description} />
        {!enabled ? (
          <Alert tone="info" title={t.comingSoonTitle}>
            {t.comingSoonBody}
          </Alert>
        ) : null}
        {entries.length > 0 ? (
          <ul className="space-y-4" aria-label={t.listLabel(entries.length)}>
            {entries.map((entry) => (
              <li key={entry.id}>
                {entry.kind === "gmail_verification" ? (
                  <GmailConfirmation entry={entry} store={store} locale={locale} f={f} disabled={!canWrite} />
                ) : (
                  <SaleEmail entry={entry} store={store} stock={sell.stock} defaultChannel={sell.defaultChannel} locale={locale} f={f} disabled={!canWrite} />
                )}
              </li>
            ))}
          </ul>
        ) : enabled ? (
          <Card>
            <EmptyState icon={<Inbox aria-hidden />} title={t.emptyTitle} description={t.emptyBody} />
          </Card>
        ) : null}
        {guide}
      </div>
    </QuickActionsProvider>
  );
}

function Excerpt({ text, locale }: { text: string | null; locale: Locale }) {
  if (!text) return null;
  return (
    <details className="group rounded-md border border-line">
      <summary className="cursor-pointer px-3.5 py-2.5 text-sm font-medium text-ink select-none">{inboundMessages[locale].inbox.showEmail}</summary>
      <p className="border-t border-line px-3.5 py-3 text-sm whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">{text}</p>
    </details>
  );
}

function SaleEmail({
  entry,
  store,
  stock,
  defaultChannel,
  locale,
  f,
  disabled,
}: {
  entry: InboundEntry;
  store: Store;
  stock: StockOption[];
  defaultChannel: string;
  locale: Locale;
  f: Format;
  disabled: boolean;
}) {
  const t = inboundMessages[locale].inbox;
  const platform = entry.platform && isPlatformId(entry.platform) ? entry.platform : null;
  const match = bestNameMatch(entry.title, stock);
  const what = entry.title ?? (entry.amountMinor !== null ? f.money(entry.amountMinor, store.currency) : (entry.subject ?? t.titleUnknown));
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone={platform ? "info" : "neutral"}>{platform ? platformName(platform, locale) : t.platformUnknown}</Badge>
          <span className="text-xs text-ink-3">{t.received(f.dateTime(entry.receivedAt, store.timezone))}</span>
        </div>
        <div>
          <p className="text-2xl font-semibold tracking-tight text-ink tabular">
            {entry.amountMinor !== null ? f.money(entry.amountMinor, store.currency) : <span className="text-lg text-caution-700">{t.amountUnknown}</span>}
          </p>
          <p className="mt-0.5 text-md break-words text-ink">{entry.title ?? <span className="text-ink-3">{t.titleUnknown}</span>}</p>
          {match ? <p className="mt-1 text-sm text-emerald-700">{t.matchedItem(match.name)}</p> : null}
        </div>
        <p className="text-xs text-ink-3">{entry.kind === "other" ? t.otherKind : t.detectedNote}</p>
        <Excerpt text={entry.excerpt} locale={locale} />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <DismissInboundButton id={entry.id} ariaLabel={t.dismissLabel(what)} disabled={disabled} />
          <SellButton
            label={t.validate}
            aria-label={t.validateLabel(what)}
            prefill={{
              price: entry.amountMinor !== null ? toInputDecimal(minorToInputValue(entry.amountMinor, store.currency), locale) : undefined,
              channel: platform ?? (isPlatformId(defaultChannel) ? defaultChannel : undefined),
              title: entry.title,
              productId: match?.id ?? null,
              inboundEmailId: entry.id,
            }}
          />
        </div>
      </CardBody>
    </Card>
  );
}

function GmailConfirmation({ entry, store, locale, f, disabled }: { entry: InboundEntry; store: Store; locale: Locale; f: Format; disabled: boolean }) {
  const t = inboundMessages[locale].inbox;
  return (
    <Card className="border-info-100">
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
            <KeyRound className="size-4 text-info-700" aria-hidden />
            {t.gmailTitle}
          </h2>
          <span className="text-xs text-ink-3">{t.received(f.dateTime(entry.receivedAt, store.timezone))}</span>
        </div>
        <p className="text-sm text-ink-2">{t.gmailBody}</p>
        {entry.verificationUrl ? (
          <Button asChild size="lg" className="w-full sm:w-auto">
            <a href={entry.verificationUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              {t.gmailOpen}
            </a>
          </Button>
        ) : null}
        {entry.verificationCode ? (
          <p className="text-sm text-ink-2">
            {t.gmailCode} <strong className="font-mono text-xl tracking-wider text-ink select-all">{entry.verificationCode}</strong>
          </p>
        ) : null}
        {!entry.verificationUrl && !entry.verificationCode ? <p className="text-sm text-caution-700">{t.gmailNoDetails}</p> : null}
        <Excerpt text={entry.excerpt} locale={locale} />
        <div className="flex justify-end">
          <DismissInboundButton id={entry.id} label={t.gmailDone} disabled={disabled} />
        </div>
      </CardBody>
    </Card>
  );
}
