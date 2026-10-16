import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { requireStore } from "@/lib/auth/workspace";

export const metadata: Metadata = { title: "Overview" };

async function Summary() {
  const ws = await requireStore();
  return (
    <PageHeader eyebrow={ws.activeStore.name} title="Overview" description="Your store's profitability at a glance." />
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<Skeleton className="h-16 w-80" />}>
      <Summary />
    </Suspense>
  );
}
