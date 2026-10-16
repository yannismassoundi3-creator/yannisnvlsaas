"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import { bucketDescription, type BucketPoint, type Granularity } from "@/lib/analytics/series";
import { niceScale } from "@/lib/analytics/ticks";
import { formatCount } from "@/lib/finance/format";
import { formatMoney } from "@/lib/finance/money";
import { ChartFrame, LegendKey } from "./chart-frame";
import { AXIS_TICK, CHART } from "./chart-theme";

export type ChartSeries = { key: string; label: string; color: string };

type Props = {
  title: string;
  description: string;
  series: ChartSeries[];
  points: BucketPoint<string>[];
  granularity: Granularity;
  valueKind: "money" | "count";
  currency: string;
  /** Extra columns for the table view only (e.g. units next to sales). */
  extras?: { key: string; label: string; kind: "money" | "count"; values: number[] }[];
  height?: number;
  headingLevel?: "h2" | "h3";
};

/**
 * Bars per period, stacked when there are several series of the same unit.
 * One axis only; other measures go to the table view instead of a second axis.
 */
export function BarSeriesChart({ title, description, series, points, granularity, valueKind, currency, extras = [], height = 260, headingLevel }: Props) {
  const fmt = (v: number, compact = false) => (valueKind === "money" ? formatMoney(v, currency, { compact }) : formatCount(v));
  const totals = points.map((p) => series.reduce((sum, s) => sum + (p.values[s.key] ?? 0), 0));
  const scale = niceScale(0, Math.max(0, ...totals), 5);
  const data = points.map((p) => ({ ...p, ...p.values }));
  const partialNote = points.some((p) => p.partial) ? ` Lighter bars are partial ${granularity === "week" ? "weeks" : "months"}.` : "";

  return (
    <ChartFrame
      title={title}
      description={description + partialNote}
      headingLevel={headingLevel}
      legend={series.length > 1 ? series.map((s) => ({ label: s.label, color: s.color, shape: "bar" as const })) : undefined}
      table={{
        caption: title,
        columns: [
          { key: "period", label: granularity === "day" ? "Date" : "Period" },
          ...series.map((s) => ({ key: s.key, label: s.label, numeric: true })),
          ...(series.length > 1 ? [{ key: "total", label: "Total", numeric: true }] : []),
          ...extras.map((e) => ({ key: e.key, label: e.label, numeric: true })),
        ],
        rows: points.map((p, i) => ({
          period: bucketDescription(p, granularity) + (p.partial ? " (partial)" : ""),
          ...Object.fromEntries(series.map((s) => [s.key, fmt(p.values[s.key] ?? 0)])),
          ...(series.length > 1 ? { total: fmt(totals[i]) } : {}),
          ...Object.fromEntries(extras.map((e) => [e.key, e.kind === "money" ? formatMoney(e.values[i] ?? 0, currency) : formatCount(e.values[i] ?? 0)])),
        })),
      }}
    >
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: CHART.axis }} tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={28} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={64} domain={scale.domain} ticks={scale.ticks} tickFormatter={(v: number) => fmt(v, true)} />
            <Tooltip
              cursor={{ fill: CHART.cursorFill }}
              isAnimationActive={false}
              content={(props) => <SeriesTooltip {...props} series={series} granularity={granularity} format={(v) => fmt(v)} />}
            />
            {series.map((s, si) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} stackId="stack" fill={s.color} maxBarSize={28} isAnimationActive={false} radius={si === series.length - 1 ? [3, 3, 0, 0] : 0}>
                {points.map((p) => (
                  <Cell key={p.key} fill={s.color} fillOpacity={p.partial ? 0.45 : 1} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

function SeriesTooltip({
  active,
  payload,
  series,
  granularity,
  format,
}: Partial<TooltipContentProps> & { series: ChartSeries[]; granularity: Granularity; format: (v: number) => string }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload as BucketPoint<string>;
  const total = series.reduce((sum, s) => sum + (point.values[s.key] ?? 0), 0);
  return (
    <div className="min-w-48 rounded-md border border-line bg-surface px-3 py-2.5 text-sm shadow-lg">
      <p className="mb-1.5 text-xs font-medium text-ink-3">
        {bucketDescription(point, granularity)}
        {point.partial ? ` (partial ${granularity})` : ""}
      </p>
      <dl className="space-y-1">
        {[...series].reverse().map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-6">
            <dt className="flex items-center gap-2 text-ink-3">
              <LegendKey color={s.color} shape="bar" />
              {s.label}
            </dt>
            <dd className="font-medium text-ink tabular">{format(point.values[s.key] ?? 0)}</dd>
          </div>
        ))}
        {series.length > 1 ? (
          <div className="flex items-center justify-between gap-6 border-t border-line pt-1">
            <dt className="pl-5.5 text-ink-3">Total</dt>
            <dd className="font-semibold text-ink tabular">{format(total)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
