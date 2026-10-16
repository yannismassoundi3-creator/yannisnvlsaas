import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { TermTip } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

export type KpiDelta = {
  /** Relative change (0.12 = +12%) or percentage-point change for rates. */
  value: number | null;
  /** Pre-formatted text, e.g. "+12.4%" or "+1.3 pts". */
  text: string;
  /** Direction that is good for this metric; null when neither is better. */
  polarity: "up" | "down" | null;
};

type KpiTileProps = {
  label: string;
  value: ReactNode;
  definition?: { term: string; text: ReactNode };
  delta?: KpiDelta | null;
  /** e.g. "vs previous 30 days" */
  deltaContext?: string;
  status?: { tone: "caution" | "info" | "neutral"; label: string } | null;
  footnote?: ReactNode;
  className?: string;
};

/**
 * Headline figure with an optional comparison. Deltas are coloured only when a
 * direction is clearly better (e.g. contribution margin up); otherwise they
 * stay neutral, and the arrow plus text always carry the meaning.
 */
export function KpiTile({ label, value, definition, delta, deltaContext, status, footnote, className }: KpiTileProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 bg-surface px-5 py-4", className)}>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-ink-3">{label}</span>
        {definition ? <TermTip term={definition.term}>{definition.text}</TermTip> : null}
      </div>
      <div className="text-[1.625rem] leading-8 font-semibold tracking-tight text-ink tabular">{value}</div>
      {delta ? <DeltaLine delta={delta} context={deltaContext} /> : null}
      {footnote || status ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
          {footnote ? <span>{footnote}</span> : null}
          {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
        </div>
      ) : null}
    </div>
  );
}

export function DeltaLine({ delta, context }: { delta: KpiDelta; context?: string }) {
  if (delta.value === null) {
    return <p className="text-xs text-ink-3">No comparison available</p>;
  }
  const direction = delta.value > 0 ? "up" : delta.value < 0 ? "down" : "flat";
  const good = delta.polarity !== null && direction !== "flat" ? direction === delta.polarity : null;
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : ArrowRight;
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-medium tabular",
          good === true && "text-emerald-700",
          good === false && "text-negative-700",
          good === null && "text-ink-2",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{direction === "up" ? "Up" : direction === "down" ? "Down" : "Unchanged"}</span>
        {delta.text}
      </span>
      {context ? <span className="text-ink-3">{context}</span> : null}
    </p>
  );
}

/** Grid of KPI tiles separated by hairlines, as one card. */
export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-lg border border-line bg-line shadow-xs",
        "grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
