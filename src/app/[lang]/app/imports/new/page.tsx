import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ImportWizard } from "@/components/imports/import-wizard";
import { Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { requireStore } from "@/lib/auth/workspace";
import { isImportKind } from "@/lib/imports/schema";

export const metadata: Metadata = { title: "New import" };

export default function NewImportPage({ searchParams }: PageProps<"/[lang]/app/imports/new">) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/app/imports" className="hover:underline">
            Imports
          </Link>
        }
        title="New import"
        description="Nothing is saved until you have reviewed the result and confirmed."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-lg" />}>
        <Wizard searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Wizard({ searchParams }: { searchParams: PageProps<"/[lang]/app/imports/new">["searchParams"] }) {
  const [ws, params] = await Promise.all([requireStore(), searchParams]);
  const kindParam = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  const store = ws.activeStore;
  return (
    <ImportWizard
      initialKind={isImportKind(kindParam) ? kindParam : null}
      store={{ name: store.name, currency: store.currency, timezone: store.timezone, pricesIncludeTax: store.prices_include_tax, isDemo: store.is_demo }}
      maxRows={ws.entitlements.limits.importRowsPerFile}
      canWrite={ws.entitlements.canWrite}
    />
  );
}
