import { RevenueMarginChart } from "@/components/charts/revenue-margin-chart";
import { InsightList } from "@/components/dashboard/insight-list";
import { KpiGrid, KpiTile } from "@/components/dashboard/kpi-tile";
import { Badge } from "@/components/ui/badge";
import { formatRange } from "@/lib/dates";
import type { MarketingDemo } from "@/lib/demo/marketing";
import { buildPrimaryKpis } from "@/lib/finance/kpis";

export function DemoDataNote({ className }: { className?: string }) {
  return (
    <p className={className}>
      <Badge tone="demo">Demo data</Badge>
      <span className="ml-2 text-xs text-ink-3">Figures from a fictional sample store, generated for illustration.</span>
    </p>
  );
}

/** Browser-like frame around a product view. */
export function ProductFrame({ title, range, children }: { title: string; range: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line-strong/80 bg-ivory shadow-frame">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-xs text-ink-3">
          <span className="truncate font-medium text-ink-2">{title}</span>
          <span aria-hidden>·</span>
          <span className="truncate tabular">{range}</span>
        </div>
        <Badge tone="demo">Demo data</Badge>
      </div>
      <div className="p-3 sm:p-5">{children}</div>
    </div>
  );
}

export function HeroDashboardPreview({ demo }: { demo: MarketingDemo }) {
  const kpis = buildPrimaryKpis(demo.metrics, demo.previous, demo.currency);
  return (
    <ProductFrame title="Sample store — Overview" range={formatRange(demo.range)}>
      <div className="space-y-4">
        <KpiGrid>
          {kpis.map((k) => (
            <KpiTile
              key={k.key}
              label={k.label}
              value={k.value}
              definition={k.definition}
              delta={k.delta}
              deltaContext="vs previous 30 days"
              status={k.status}
              footnote={k.footnote}
            />
          ))}
        </KpiGrid>
        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <RevenueMarginChart points={demo.series.points} granularity={demo.series.granularity} currency={demo.currency} height={300} headingLevel="h3" />
          <div className="rounded-lg border border-line bg-surface shadow-xs">
            <div className="px-5 pt-4">
              <h3 className="text-md font-semibold tracking-tight text-ink">What changed</h3>
              <p className="text-sm text-ink-3">Rule-based insights, each traceable to the figures.</p>
            </div>
            <InsightList insights={demo.insights} showActions={false} limit={2} className="mt-1" />
          </div>
        </div>
      </div>
    </ProductFrame>
  );
}
