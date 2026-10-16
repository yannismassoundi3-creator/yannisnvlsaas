"use client";

import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import { bucketDescription, type Granularity, type SeriesPoint } from "@/lib/analytics/series";
import { niceScale } from "@/lib/analytics/ticks";
import { formatPercent } from "@/lib/finance/format";
import { formatMoney } from "@/lib/finance/money";
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

const REVENUE = { label: "Net revenue", color: CHART.series[0] };
const MARGIN = { label: "Contribution margin", color: CHART.series[1] };

export function RevenueMarginChart({
  points,
  granularity,
  currency,
  title = "Net revenue and contribution margin",
  description,
  height = 280,
  headingLevel,
}: Props) {
  const hasNegative = points.some((p) => p.contributionMargin < 0 || p.netRevenue < 0);
  const values = points.flatMap((p) => [p.netRevenue, p.contributionMargin]);
  const scale = niceScale(Math.min(0, ...values), Math.max(0, ...values), 6);
  const granularityLabel = granularity === "day" ? "Daily" : granularity === "week" ? "Weekly" : "Monthly";
  const unit = granularity === "week" ? "weeks" : "months";
  const partialNote = points.some((p) => p.partial) ? ` Lighter bars are partial ${unit}, cut short by the selected dates.` : "";

  return (
    <ChartFrame
      title={title}
      description={(description ?? `${granularityLabel} totals. Contribution margin is net revenue minus product and variable costs.`) + partialNote}
      headingLevel={headingLevel}
      legend={[
        { label: REVENUE.label, color: REVENUE.color, shape: "bar" },
        { label: MARGIN.label, color: MARGIN.color, shape: "line" },
      ]}
      table={{
        caption: `${granularityLabel} net revenue and contribution margin`,
        columns: [
          { key: "period", label: granularity === "day" ? "Date" : "Period" },
          { key: "revenue", label: REVENUE.label, numeric: true },
          { key: "margin", label: MARGIN.label, numeric: true },
          { key: "rate", label: "Margin %", numeric: true },
        ],
        rows: points.map((p) => ({
          period: bucketDescription(p, granularity),
          revenue: formatMoney(p.netRevenue, currency),
          margin: formatMoney(p.contributionMargin, currency),
          rate: formatPercent(p.netRevenue > 0 ? p.contributionMargin / p.netRevenue : null),
        })),
      }}
    >
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 4 }} barCategoryGap="28%">
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
              tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })}
            />
            {hasNegative ? <ReferenceLine y={0} stroke={CHART.axis} /> : null}
            <Tooltip
              cursor={{ fill: CHART.cursorFill }}
              content={(props) => <SeriesTooltip {...props} currency={currency} granularity={granularity} />}
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
}: Partial<TooltipContentProps> & { currency: string; granularity: Granularity }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload as SeriesPoint;
  const rate = point.netRevenue > 0 ? point.contributionMargin / point.netRevenue : null;
  return (
    <div className="min-w-52 rounded-md border border-line bg-surface px-3 py-2.5 text-sm shadow-lg">
      <p className="mb-1.5 text-xs font-medium text-ink-3">
        {bucketDescription(point, granularity)}
        {point.partial ? ` (partial ${granularity})` : ""}
      </p>
      <dl className="space-y-1">
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-2 text-ink-3">
            <LegendKey color={REVENUE.color} shape="line" />
            {REVENUE.label}
          </dt>
          <dd className="font-semibold text-ink tabular">{formatMoney(point.netRevenue, currency)}</dd>
        </div>
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-2 text-ink-3">
            <LegendKey color={MARGIN.color} shape="line" />
            {MARGIN.label}
          </dt>
          <dd className="font-semibold text-ink tabular">{formatMoney(point.contributionMargin, currency)}</dd>
        </div>
        <div className="flex items-center justify-between gap-6 border-t border-line pt-1">
          <dt className="pl-5.5 text-ink-3">Margin %</dt>
          <dd className="font-medium text-ink-2 tabular">{formatPercent(rate)}</dd>
        </div>
      </dl>
    </div>
  );
}
