import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SampleStoreButton } from "@/components/app/sample-store-button";
import { AddStoreDialog, DataControls, DeleteStoreButton, ProfileForms, StoreSettingsForm } from "@/components/settings/settings-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { INTL_LOCALE } from "@/i18n/config";
import { settingsPage } from "@/i18n/messages/account-settings";
import { getLocale } from "@/i18n/server";
import { requireWorkspace } from "@/lib/auth/workspace";
import { currencyName } from "@/lib/finance/currency";
import { platformName, type PlatformId } from "@/lib/onboarding/constants";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: settingsPage[await getLocale()].metaTitle };
}

type Section = "profile" | "store" | "stores" | "data";
const SECTIONS: Section[] = ["store", "stores", "profile", "data"];

export default async function SettingsPage({ searchParams }: PageProps<"/[lang]/app/settings">) {
  const t = settingsPage[await getLocale()];
  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />
      <Suspense fallback={<Skeleton className="h-96 rounded-lg" />}>
        <Settings searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Settings({ searchParams }: { searchParams: PageProps<"/[lang]/app/settings">["searchParams"] }) {
  const [ws, sp, locale] = await Promise.all([requireWorkspace(), searchParams, getLocale()]);
  const t = settingsPage[locale];
  const raw = Array.isArray(sp.section) ? sp.section[0] : sp.section;
  const section: Section = raw === "costs" ? "store" : (SECTIONS.find((s) => s === raw) ?? (ws.activeStore ? "store" : "profile"));
  const store = ws.activeStore;
  const canWrite = ws.entitlements.canWrite;
  const realStores = ws.stores.filter((s) => !s.is_demo);
  const demoStore = ws.stores.find((s) => s.is_demo) ?? null;
  const atLimit = realStores.length >= ws.entitlements.limits.stores;

  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
      <nav aria-label={t.sectionsNav} className="flex gap-1 overflow-x-auto lg:flex-col">
        {SECTIONS.map((s) => (
          <Link
            key={s}
            href={`/app/settings?section=${s}` as Route}
            aria-current={s === section ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap",
              s === section ? "bg-surface text-ink shadow-xs ring-1 ring-line" : "text-ink-2 hover:bg-hover",
            )}
          >
            {t.sections[s]}
          </Link>
        ))}
      </nav>

      <div className="min-w-0 space-y-6">
        {!canWrite && section !== "data" ? (
          <Alert tone="caution">{t.paused}</Alert>
        ) : null}

        {section === "store" ? (
          store ? (
            <Card>
              <CardHeader
                title={store.name}
                description={store.is_demo ? t.sampleStoreSettings : t.platformStore(platformName(store.platform as PlatformId, locale) ?? store.platform)}
                actions={store.is_demo ? <Badge tone="demo">{t.demoData}</Badge> : null}
              />
              <CardBody>
                <StoreSettingsForm
                  key={store.updated_at}
                  disabled={!canWrite}
                  store={{
                    name: store.name,
                    timezone: store.timezone,
                    currency: store.currency,
                    pricesIncludeTax: store.prices_include_tax,
                    feeRuleBps: store.fee_rule_bps,
                    feeRuleFixedMinor: store.fee_rule_fixed_minor,
                    defaultShippingCostMinor: store.default_shipping_cost_minor,
                  }}
                />
              </CardBody>
            </Card>
          ) : (
            <Alert tone="info">{t.noStore}</Alert>
          )
        ) : null}

        {section === "stores" ? (
          <Card>
            <CardHeader
              title={t.storesTitle}
              description={t.storesCount(realStores.length, ws.entitlements.limits.stores)}
              actions={
                ws.role !== "member" ? (
                  <AddStoreDialog disabled={!canWrite || atLimit} reason={atLimit ? (ws.entitlements.plan === "pro" ? t.limitReached : t.trialLimit) : undefined} />
                ) : null
              }
            />
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {ws.stores.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-ink">
                      {s.name}
                      {s.is_demo ? <Badge tone="demo">{t.demoBadge}</Badge> : null}
                      {s.id === store?.id ? <Badge tone="outline">{t.viewing}</Badge> : null}
                    </p>
                    <p className="text-xs text-ink-3">
                      {s.currency} · {currencyName(s.currency, INTL_LOCALE[locale])} · {s.timezone.replaceAll("_", " ")}
                    </p>
                  </div>
                  {ws.role !== "member" && (s.is_demo || realStores.length > 1) ? <DeleteStoreButton storeId={s.id} storeName={s.name} isDemo={s.is_demo} /> : null}
                </li>
              ))}
            </ul>
            <CardBody className="border-t border-line">
              {demoStore ? (
                <p className="text-sm text-ink-3">{t.sampleExists}</p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-ink-3">{t.sampleOffer}</p>
                  {canWrite ? <SampleStoreButton demoStoreId={null} /> : null}
                </div>
              )}
              {atLimit && ws.entitlements.plan !== "pro" ? (
                <p className="mt-3 text-sm text-ink-3">
                  {t.trialOneStore}{" "}
                  <Link href="/app/billing" className="font-medium text-emerald-700 hover:underline">
                    {t.proThree}
                  </Link>
                  .
                </p>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        {section === "profile" ? (
          <Card>
            <CardHeader title={t.sections.profile} description={t.signedInAs(ws.user.email, ws.organization.name, t.roles[ws.role] ?? ws.role)} />
            <CardBody>
              <ProfileForms fullName={ws.user.fullName} email={ws.user.email} />
            </CardBody>
          </Card>
        ) : null}

        {section === "data" ? (
          <Card>
            <CardHeader title={t.sections.data} description={t.dataDescription} />
            <CardBody>
              <DataControls isOwner={ws.role === "owner"} />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
