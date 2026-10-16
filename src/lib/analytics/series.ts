import { addDays, formatShortDate, rangeLength, weekStart } from "@/lib/dates";
import type { DateRange } from "@/lib/domain/types";
import { deriveMetrics, EMPTY_TOTALS, type PeriodTotals } from "@/lib/finance/metrics";

export type Granularity = "day" | "week" | "month";

export type SeriesPoint = {
  /** Bucket start date (YYYY-MM-DD). */
  key: string;
  from: string;
  to: string;
  label: string;
  netSales: number;
  netRevenue: number;
  contributionMargin: number;
  adSpend: number;
  orders: number;
  /** Ad spend as a share of net revenue; null without revenue. */
  adSpendRate: number | null;
  /** True when the range cuts the bucket short (e.g. a week with only 3 days in range). */
  partial: boolean;
};

export type TimeSeries = { granularity: Granularity; points: SeriesPoint[] };

/** Daily up to 45 days, weekly up to ~6 months, monthly beyond. */
export function granularityFor(range: DateRange): Granularity {
  const days = rangeLength(range);
  if (days <= 45) return "day";
  if (days <= 200) return "week";
  return "month";
}

const monthFormatter = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

function bucketKey(date: string, granularity: Granularity): string {
  if (granularity === "day") return date;
  if (granularity === "week") return weekStart(date);
  return `${date.slice(0, 7)}-01`;
}

/**
 * Groups daily totals into chart buckets. Partial buckets at the edges of the
 * range are clipped to the range so values are never borrowed from outside it.
 */
export function buildTimeSeries(daily: Map<string, PeriodTotals> | [string, PeriodTotals][], range: DateRange): TimeSeries {
  const granularity = granularityFor(range);
  const buckets = new Map<string, { from: string; to: string; totals: PeriodTotals }>();
  const entries = daily instanceof Map ? [...daily.entries()] : daily;
  entries.sort(([a], [b]) => (a < b ? -1 : 1));

  for (const [date, totals] of entries) {
    if (date < range.from || date > range.to) continue;
    const key = bucketKey(date, granularity);
    let bucket = buckets.get(key);
    if (!bucket) {
      // Clip the bucket to the range so its dates describe exactly what it contains.
      const end = endOfBucket(key, granularity);
      bucket = { from: key < range.from ? range.from : key, to: end > range.to ? range.to : end, totals: { ...EMPTY_TOTALS } };
      buckets.set(key, bucket);
    }
    for (const k of Object.keys(totals) as (keyof PeriodTotals)[]) bucket.totals[k] += totals[k];
  }

  const points: SeriesPoint[] = [...buckets.entries()].map(([key, b]) => {
    const m = deriveMetrics(b.totals);
    const label =
      granularity === "day"
        ? formatShortDate(key)
        : granularity === "week"
          ? `${formatShortDate(b.from)}`
          : monthFormatter.format(new Date(`${key}T00:00:00Z`));
    return {
      key,
      from: b.from,
      to: b.to,
      label,
      netSales: m.netSales,
      netRevenue: m.netRevenue,
      contributionMargin: m.contributionMargin,
      adSpend: m.adSpend,
      orders: m.orders,
      adSpendRate: m.adSpendRate,
      partial: b.from !== key || b.to !== endOfBucket(key, granularity),
    };
  });
  return { granularity, points };
}

/** Human description of a bucket for tooltips and tables. */
export function bucketDescription(point: Pick<SeriesPoint, "from" | "to">, granularity: Granularity): string {
  if (granularity === "day") return formatShortDate(point.from);
  return point.from === point.to ? formatShortDate(point.from) : `${formatShortDate(point.from)} – ${formatShortDate(point.to)}`;
}

export function endOfBucket(start: string, granularity: Granularity): string {
  if (granularity === "day") return start;
  if (granularity === "week") return addDays(start, 6);
  const [y, m] = start.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
