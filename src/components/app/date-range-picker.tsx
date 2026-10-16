"use client";

import { CalendarDays, Check } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, formatRange, RANGE_PRESETS, type RangePreset } from "@/lib/dates";
import type { DateRange } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type Props = {
  pathname: string;
  /** Other query parameters to keep when the period changes (filters, tabs). */
  preserve?: Record<string, string>;
  range: DateRange;
  preset: RangePreset | null;
  today: string;
  /** Earliest date the plan allows. */
  historyStart: string;
};

/**
 * Reporting period selector. The period lives in the URL (?range= or
 * ?from=&to=) so views can be bookmarked and shared; the server validates and
 * clamps whatever arrives.
 */
export function DateRangePicker({ pathname, preserve = {}, range, preset, today, historyStart }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const id = useId();

  const navigate = (params: Record<string, string>) => {
    const query = new URLSearchParams({ ...preserve, ...params });
    query.delete("page");
    setOpen(false);
    startTransition(() => router.push(`${pathname}?${query.toString()}` as Route, { scroll: false }));
  };

  const customError =
    !from || !to
      ? "Enter both dates."
      : from > to
        ? "The start date must be before the end date."
        : from < historyStart
          ? `Your plan includes data from ${formatDate(historyStart)}.`
          : to > today
            ? "The end date cannot be in the future."
            : null;

  const label = preset ? (RANGE_PRESETS.find((p) => p.id === preset)?.label ?? "Custom") : "Custom range";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setFrom(range.from);
          setTo(range.to);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="secondary">
          {pending ? <Spinner className="size-4" /> : <CalendarDays aria-hidden />}
          <span className="sr-only">Reporting period: </span>
          <span className="font-medium">{label}</span>
          <span className="sr-only sm:not-sr-only sm:text-ink-3 sm:tabular">{formatRange(range)}</span>
          <span className="sr-only">. Change period</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div role="group" aria-labelledby={`${id}-presets`} className="p-2">
          <p id={`${id}-presets`} className="px-2 pt-1 pb-1.5 text-xs font-medium tracking-wide text-ink-3 uppercase">
            Period
          </p>
          <ul className="grid grid-cols-2 gap-0.5">
            {RANGE_PRESETS.map((p) => {
              const selected = p.id === preset;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => navigate({ range: p.id })}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-ink-2 hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none",
                      selected && "bg-sunken font-medium text-ink",
                    )}
                  >
                    {p.label}
                    {selected ? <Check className="size-3.5 text-emerald-700" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <form
          className="space-y-3 border-t border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!customError) navigate({ from, to });
          }}
        >
          <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">Custom range</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-sm text-ink-2">
              <span>From</span>
              <Input type="date" inputSize="sm" value={from} min={historyStart} max={today} onChange={(e) => setFrom(e.target.value)} required />
            </label>
            <label className="space-y-1 text-sm text-ink-2">
              <span>To</span>
              <Input type="date" inputSize="sm" value={to} min={historyStart} max={today} onChange={(e) => setTo(e.target.value)} required />
            </label>
          </div>
          <p className={cn("text-xs", customError ? "text-negative-700" : "text-ink-3")} aria-live="polite">
            {customError ?? "Dates use your store's time zone."}
          </p>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={Boolean(customError)}>
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
