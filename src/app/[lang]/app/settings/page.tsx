import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SampleStoreButton } from "@/components/app/sample-store-button";
import { AddStoreDialog, DataControls, DeleteStoreButton, ProfileForms, StoreSettingsForm } from "@/components/settings/settings-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { requireWorkspace } from "@/lib/auth/workspace";
import { currencyName } from "@/lib/finance/currency";
import { PLATFORM_NAMES, type PlatformId } from "@/lib/onboarding/constants";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };

type Section = "profile" | "store" | "stores" | "data";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "store", label: "Store and costs" },
  { id: "stores", label: "Stores" },
  { id: "profile", label: "Profile and sign-in" },
  { id: "data", label: "Data and privacy" },
];

export default function SettingsPage({ searchParams }: PageProps<"/[lang]/app/settings">) {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Store rules used in your reports, your stores, your account and your data." />
      <Suspense fallback={<Skeleton className="h-96 rounded-lg" />}>
        <Settings searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Settings({ searchParams }: { searchParams: PageProps<"/[lang]/app/settings">["searchParams"] }) {
  const [ws, sp] = await Promise.all([requireWorkspace(), searchParams]);
  const raw = Array.isArray(sp.section) ? sp.section[0] : sp.section;
  const section: Section = raw === "costs" ? "store" : (SECTIONS.find((s) => s.id === raw)?.id ?? (ws.activeStore ? "store" : "profile"));
  const store = ws.activeStore;
  const canWrite = ws.entitlements.canWrite;
  const realStores = ws.stores.filter((s) => !s.is_demo);
  const demoStore = ws.stores.find((s) => s.is_demo) ?? null;
  const atLimit = realStores.length >= ws.entitlements.limits.stores;

  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
      <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:flex-col">
        {SECTIONS.map((s) => (
          <Link
            key={s.id}
            href={`/app/settings?section=${s.id}` as Route}
            aria-current={s.id === section ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap",
              s.id === section ? "bg-surface text-ink shadow-xs ring-1 ring-line" : "text-ink-2 hover:bg-hover",
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      <div className="min-w-0 space-y-6">
        {!canWrite && section !== "data" ? (
          <Alert tone="caution">Changes are paused because your trial or subscription has ended. You can still export or delete your data.</Alert>
        ) : null}

        {section === "store" ? (
          store ? (
            <Card>
              <CardHeader
                title={store.name}
                description={store.is_demo ? "Settings of the sample store. Its figures are fictional." : `${PLATFORM_NAMES[store.platform as PlatformId] ?? store.platform} store`}
                actions={store.is_demo ? <Badge tone="demo">Demo data</Badge> : null}
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
            <Alert tone="info">You have no store yet.</Alert>
          )
        ) : null}

        {section === "stores" ? (
          <Card>
            <CardHeader
              title="Stores"
              description={`${realStores.length} of ${ws.entitlements.limits.stores} ${ws.entitlements.limits.stores === 1 ? "store" : "stores"} on your plan. The sample store does not count.`}
              actions={
                ws.role !== "member" ? (
                  <AddStoreDialog disabled={!canWrite || atLimit} reason={atLimit ? (ws.entitlements.plan === "pro" ? "Store limit reached" : "The trial includes one store; Pro includes three") : undefined} />
                ) : null
              }
            />
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {ws.stores.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-ink">
                      {s.name}
                      {s.is_demo ? <Badge tone="demo">Demo</Badge> : null}
                      {s.id === store?.id ? <Badge tone="outline">Viewing</Badge> : null}
                    </p>
                    <p className="text-xs text-ink-3">
                      {s.currency} · {currencyName(s.currency)} · {s.timezone.replaceAll("_", " ")}
                    </p>
                  </div>
                  {ws.role !== "member" && (s.is_demo || realStores.length > 1) ? <DeleteStoreButton storeId={s.id} storeName={s.name} isDemo={s.is_demo} /> : null}
                </li>
              ))}
            </ul>
            <CardBody className="border-t border-line">
              {demoStore ? (
                <p className="text-sm text-ink-3">The sample store contains fictional data to explore every view. It is labelled everywhere it appears.</p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-ink-3">Explore every view with a labelled sample store of fictional data.</p>
                  {canWrite ? <SampleStoreButton demoStoreId={null} /> : null}
                </div>
              )}
              {atLimit && ws.entitlements.plan !== "pro" ? (
                <p className="mt-3 text-sm text-ink-3">
                  The trial includes one store.{" "}
                  <Link href="/app/billing" className="font-medium text-emerald-700 hover:underline">
                    Pro includes three
                  </Link>
                  .
                </p>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        {section === "profile" ? (
          <Card>
            <CardHeader title="Profile and sign-in" description={`Signed in as ${ws.user.email ?? "unknown"} · ${ws.organization.name} (${ws.role})`} />
            <CardBody>
              <ProfileForms fullName={ws.user.fullName} email={ws.user.email} />
            </CardBody>
          </Card>
        ) : null}

        {section === "data" ? (
          <Card>
            <CardHeader title="Data and privacy" description="Your data belongs to you. Narixia uses it only to provide the service; see the privacy policy for details." />
            <CardBody>
              <DataControls isOwner={ws.role === "owner"} />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
