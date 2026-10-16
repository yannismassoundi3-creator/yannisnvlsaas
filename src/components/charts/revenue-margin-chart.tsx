"use client";

import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import { useFormat } from "@/i18n/client";
import type { Format } from "@/i18n/format";
import { chartMessages } from "@/i18n/messages/dashboard-charts";
import { bucketDescription, bucketLabel, type Granularity, type SeriesPoint } from "@/lib/analytics/series";
import { niceScale } from "@/lib/analytics/ticks";
import { ChartFrame, LegendKey } from "./chart-frame";
import { AXIS_TICK, CHART } from "./chart-theme";

type Props = {
  points: SeriesPoint[];
  granularity: Granularity;
  currency: string;
  title?: string;
  description?: string;
  height?: number;
  headingLevel?: "h2" | "h3";
};

const REVENUE_COLOR = CHART.series[0];
const MARGIN_COLOR = CHART.series[1];

export function RevenueMarginChart({
  points,
  granularity,
  currency,
  title,
  description,
  height = 280,
  headingLevel,
}: Props) {
  const f = useFormat();
  const t = chartMessages[f.locale];
  const REVENUE = { label: t.netRevenue, color: REVENUE_COLOR };
  const MARGIN = { label: t.contributionMargin, color: MARGIN_COLOR };
  const data = points.map((p) => ({ ...p, label: bucketLabel(p, granularity, f.locale) }));
  const hasNegative = points.some((p) => p.contributionMargin < 0 || p.netRevenue < 0);
  const values = points.flatMap((p) => [p.netRevenue, p.contributionMargin]);
  const scale = niceScale(Math.min(0, ...values), Math.max(0, ...values), 6);
  const partialNote = points.some((p) => p.partial) ? t.lighterBarsCut(granularity === "week" ? "week" : "month") : "";

  return (
    <ChartFrame
      title={title ?? t.revenueMarginTitle}
      description={(description ?? t.revenueMarginDescription(granularity)) + partialNote}
      headingLevel={headingLevel}
      legend={[
        { label: REVENUE.label, color: REVENUE.color, shape: "bar" },
        { label: MARGIN.label, color: MARGIN.color, shape: "line" },
      ]}
      table={{
        caption: t.revenueMarginCaption(granularity),
        columns: [
          { key: "period", label: granularity === "day" ? t.date : t.period },
          { key: "revenue", label: REVENUE.label, numeric: true },
          { key: "margin", label: MARGIN.label, numeric: true },
          { key: "rate", label: t.marginRate, numeric: true },
        ],
        rows: points.map((p) => ({
          period: bucketDescription(p, granularity, f.locale),
          revenue: f.money(p.netRevenue, currency),
          margin: f.money(p.contributionMargin, currency),
          rate: f.percent(p.netRevenue > 0 ? p.contributionMargin / p.netRevenue : null),
        })),
      }}
    >
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: CHART.axis }}
              tick={AXIS_TICK}
              interval="preserveStartEnd"
              minTickGap={28}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              width={64}
              domain={scale.domain}
              ticks={scale.ticks}
              tickFormatter={(v: number) => f.money(v, currency, { compact: true })}
            />
            {hasNegative ? <ReferenceLine y={0} stroke={CHART.axis} /> : null}
            <Tooltip
              cursor={{ fill: CHART.cursorFill }}
              content={(props) => <SeriesTooltip {...props} currency={currency} granularity={granularity} format={f} />}
              isAnimationActive={false}
            />
            <Bar dataKey="netRevenue" name={REVENUE.label} fill={REVENUE.color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
              {points.map((p) => (
                <Cell key={p.key} fill={REVENUE.color} fillOpacity={p.partial ? 0.45 : 1} />
              ))}
            </Bar>
            <Line
              dataKey="contributionMargin"
              name={MARGIN.label}
              type="monotone"
              stroke={MARGIN.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface, fill: MARGIN.color }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

function SeriesTooltip({
  active,
  payload,
  currency,
  granularity,
  format: f,
}: Partial<TooltipContentProps> & { currency: string; granularity: Granularity; format: Format }) {
  if (!active || !payload || payload.length === 0) return null;
  const t = chartMessages[f.locale];
  const point = payload[0].payload as SeriesPoint;
  const rate = point.netRevenue > 0 ? point.contributionMargin / point.netRevenue : null;
  return (
    <div className="min-w-52 rounded-md border border-line bg-surface px-3 py-2.5 text-sm shadow-lg">
      <p className="mb-1.5 text-xs font-medium text-ink-3">
        {bucketDescription(point, granularity, f.locale)}
        {point.partial ? t.partialBucket(granularity) : ""}
      </p>
      <dl className="space-y-1">
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-2 text-ink-3">
            <LegendKey color={REVENUE_COLOR} shape="line" />
            {t.netRevenue}
          </dt>
          <dd className="font-semibold text-ink tabular">{f.money(point.netRevenue, currency)}</dd>
        </div>
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-2 text-ink-3">
            <LegendKey color={MARGIN_COLOR} shape="line" />
            {t.contributionMargin}
          </dt>
          <dd className="font-semibold text-ink tabular">{f.money(point.contributionMargin, currency)}</dd>
        </div>
        <div className="flex items-center justify-between gap-6 border-t border-line pt-1">
          <dt className="pl-5.5 text-ink-3">{t.marginRate}</dt>
          <dd className="font-medium text-ink-2 tabular">{f.percent(rate)}</dd>
        </div>
      </dl>
    </div>
  );
}
