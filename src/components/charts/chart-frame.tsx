"use client";

import { BarChart3, Table2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableContainer, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useLocale } from "@/i18n/client";
import { chartMessages } from "@/i18n/messages/dashboard-charts";
import { cn } from "@/lib/utils";

export type LegendItem = { label: string; color: string; shape: "bar" | "line" };

export type ChartTable = {
  caption: string;
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, ReactNode>[];
};

type ChartFrameProps = {
  title: ReactNode;
  description?: ReactNode;
  legend?: LegendItem[];
  table: ChartTable;
  children: ReactNode;
  className?: string;
  /** Extra controls aligned with the title. */
  actions?: ReactNode;
  headingLevel?: "h2" | "h3";
};

/**
 * Chart container: title, legend, and an accessible table twin so every value
 * shown in the chart can be read without hovering or relying on colour.
 */
export function ChartFrame({ title, description, legend, table, children, className, actions, headingLevel = "h2" }: ChartFrameProps) {
  const t = chartMessages[useLocale()];
  const [view, setView] = useState<"chart" | "table">("chart");
  const titleId = useId();
  const Heading = headingLevel;
  return (
    <figure aria-labelledby={titleId} className={cn("rounded-lg border border-line bg-surface shadow-xs", className)}>
      <div className="grid grid-cols-[1fr_auto] items-start gap-x-4 px-5 pt-4">
        <div className="min-w-0 space-y-0.5">
          <Heading id={titleId} className="text-md font-semibold tracking-tight text-ink">
            {title}
          </Heading>
          {description ? <p className="text-sm text-ink-3">{description}</p> : null}
        </div>
        <div className="-mt-1 -mr-2 flex items-center gap-2">
          {actions}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView((v) => (v === "chart" ? "table" : "chart"))}
            aria-pressed={view === "table"}
            className="text-ink-3"
          >
            {view === "chart" ? <Table2 aria-hidden /> : <BarChart3 aria-hidden />}
            <span className="hidden sm:inline">{view === "chart" ? t.viewAsTable : t.viewAsChart}</span>
            <span className="sr-only sm:hidden">{view === "chart" ? t.viewAsTable : t.viewAsChart}</span>
          </Button>
        </div>
      </div>
      {legend && legend.length > 0 && view === "chart" ? <Legend items={legend} className="px-5 pt-3" /> : null}
      <div className="px-2 pt-2 pb-3 sm:px-3">
        {view === "chart" ? (
          children
        ) : (
          <TableContainer className="max-h-80 px-2">
            <Table>
              <caption className="sr-only">{table.caption}</caption>
              <THead>
                <TR>
                  {table.columns.map((c) => (
                    <TH key={c.key} numeric={c.numeric}>
                      {c.label}
                    </TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {table.rows.map((row, i) => (
                  <TR key={i}>
                    {table.columns.map((c) => (
                      <TD key={c.key} numeric={c.numeric} className="h-9">
                        {row[c.key]}
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </div>
    </figure>
  );
}

export function Legend({ items, className }: { items: LegendItem[]; className?: string }) {
  const t = chartMessages[useLocale()];
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-ink-2", className)} aria-label={t.legend}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <LegendKey color={item.color} shape={item.shape} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function LegendKey({ color, shape }: { color: string; shape: "bar" | "line" }) {
  return shape === "bar" ? (
    <span aria-hidden className="inline-block size-2.5 rounded-[2px]" style={{ background: color }} />
  ) : (
    <span aria-hidden className="inline-block h-0.5 w-3.5 rounded-full" style={{ background: color }} />
  );
}
