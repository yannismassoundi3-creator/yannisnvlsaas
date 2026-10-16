import { AlertTriangle, ArrowRight, Info } from "lucide-react";
import Link from "next/link";
import type { Insight } from "@/lib/finance/insights";
import { cn } from "@/lib/utils";

type Props = {
  insights: Insight[];
  /** Hide action links (e.g. in the public preview). */
  showActions?: boolean;
  limit?: number;
  className?: string;
};

export function InsightList({ insights, showActions = true, limit, className }: Props) {
  const visible = limit ? insights.slice(0, limit) : insights;
  return (
    <ul className={cn("divide-y divide-line", className)}>
      {visible.map((insight) => (
        <li key={insight.id} className="flex gap-3 px-5 py-4">
          <span
            className={cn(
              "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm",
              insight.severity === "attention" ? "bg-caution-50 text-caution-700" : "bg-info-50 text-info-700",
            )}
          >
            {insight.severity === "attention" ? <AlertTriangle className="size-3.5" aria-hidden /> : <Info className="size-3.5" aria-hidden />}
            <span className="sr-only">{insight.severity === "attention" ? "Needs attention" : "Information"}</span>
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="font-medium text-ink">{insight.title}</p>
            <p className="text-sm text-ink-2">{insight.body}</p>
            <dl className="grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-[auto_1fr]">
              {insight.evidence.map((e) => (
                <div key={e.label} className="contents">
                  <dt className="text-ink-3">{e.label}</dt>
                  <dd className="text-ink-2 tabular">{e.value}</dd>
                </div>
              ))}
            </dl>
            {showActions && insight.action ? (
              <Link
                href={insight.action.href}
                className="inline-flex items-center gap-1 pt-0.5 text-sm font-medium text-emerald-700 hover:underline"
              >
                {insight.action.label}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
