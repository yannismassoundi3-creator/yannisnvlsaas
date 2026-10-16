"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Lock, Upload, XCircle } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { TemplateButton } from "@/components/imports/import-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Alert } from "@/components/ui/feedback";
import { NativeSelect } from "@/components/ui/input";
import { Table, TableContainer, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EXPENSE_CATEGORIES, PLATFORM_LABELS, type ExpenseCategory, type Platform } from "@/lib/domain/types";
import { detectDecimalSeparator } from "@/lib/finance/decimal";
import { cancelImport, createImportJob, finalizeImport, stageImportRows } from "@/lib/imports/actions";
import { detectDateOrder } from "@/lib/imports/dates";
import { autoMap, detectSource, extractMapped, missingRequired, SOURCE_LABELS, type ColumnMapping, type DetectedSource } from "@/lib/imports/mapping";
import { normalizeRows, normalizeText, type NormalizedRow, type RawRow } from "@/lib/imports/normalize";
import { readCsvFile, type ParsedCsv } from "@/lib/imports/parse-file";
import { DEFAULT_OPTIONS, IMPORT_KINDS, IMPORT_LIMITS, KIND_ORDER, type ImportKind, type ImportOptions } from "@/lib/imports/schema";
import { cn } from "@/lib/utils";

type StoreInfo = { name: string; currency: string; timezone: string; pricesIncludeTax: boolean; isDemo: boolean };

type Props = {
  initialKind: ImportKind | null;
  store: StoreInfo;
  maxRows: number;
  canWrite: boolean;
};

type Step = "kind" | "file" | "columns" | "options" | "review";
const STEPS: { id: Step; label: string }[] = [
  { id: "kind", label: "Data type" },
  { id: "file", label: "File" },
  { id: "columns", label: "Columns" },
  { id: "options", label: "Options" },
  { id: "review", label: "Check and upload" },
];

const DATE_FIELDS: Record<ImportKind, string[]> = { orders: ["ordered_at", "refunded_at"], products: [], ad_spend: ["date"], expenses: ["date"] };
const AMOUNT_FIELDS: Record<ImportKind, string[]> = {
  orders: ["unit_price", "line_discount", "order_discount", "shipping_charged", "taxes", "shipping_cost", "transaction_fees", "refunded_amount", "unit_cost"],
  products: ["unit_cost", "price"],
  ad_spend: ["spend", "conversion_value"],
  expenses: ["amount"],
};
const PREVIEW_FIELDS: Record<ImportKind, string[]> = {
  orders: ["order_number", "line_name", "quantity", "unit_price"],
  products: ["name", "sku", "unit_cost", "price"],
  ad_spend: ["date", "campaign", "spend", "clicks"],
  expenses: ["date", "category", "amount", "description"],
};

/** Packs rows into upload chunks. For orders, all rows of an order stay in one chunk. */
function buildChunks(kind: ImportKind, rows: RawRow[]): RawRow[][] {
  const size = IMPORT_LIMITS.chunkRows;
  if (kind !== "orders") {
    const out: RawRow[][] = [];
    for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
    return out;
  }
  const groups = new Map<string, RawRow[]>();
  for (const row of rows) {
    const key = normalizeText(row.values.order_number) || `__row_${row.rowNumber}`;
    const g = groups.get(key);
    if (g) g.push(row);
    else groups.set(key, [row]);
  }
  const chunks: RawRow[][] = [];
  let current: RawRow[] = [];
  for (const group of groups.values()) {
    if (current.length > 0 && current.length + group.length > size) {
      chunks.push(current);
      current = [];
    }
    current.push(...group);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export function ImportWizard({ initialKind, store, maxRows, canWrite }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialKind ? "file" : "kind");
  const [kind, setKind] = useState<ImportKind>(initialKind ?? "orders");
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [source, setSource] = useState<DetectedSource>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);
  const [dateAmbiguous, setDateAmbiguous] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState<{ phase: "creating" | "uploading" | "checking"; done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const id = useId();

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const def = IMPORT_KINDS[kind];
  const set = <K extends keyof ImportOptions>(key: K, value: ImportOptions[K]) => setOptions((o) => ({ ...o, [key]: value }));

  const rawRows: RawRow[] = useMemo(
    () => (csv ? csv.rows.map((r) => ({ rowNumber: r.rowNumber, values: extractMapped(r.cells, mapping) })) : []),
    [csv, mapping],
  );
  const normalized: NormalizedRow[] = useMemo(
    () => (step === "review" && csv ? normalizeRows(kind, rawRows, options, { currency: store.currency, timezone: store.timezone }) : []),
    [step, csv, kind, rawRows, options, store.currency, store.timezone],
  );
  const counts = useMemo(() => {
    const c = { valid: 0, invalid: 0, skipped: 0, warnings: 0 };
    for (const r of normalized) {
      c[r.status]++;
      if (r.warnings.length) c.warnings++;
    }
    return c;
  }, [normalized]);

  function samples(column: number | null | undefined, max = 3): string[] {
    if (!csv || column === null || column === undefined) return [];
    const out: string[] = [];
    for (const r of csv.rows) {
      const v = (r.cells[column] ?? "").trim();
      if (v) out.push(v);
      if (out.length >= max) break;
    }
    return out;
  }

  async function onFile(selected: File | undefined) {
    if (!selected) return;
    setParseError(null);
    setParsing(true);
    await new Promise((r) => setTimeout(r, 0));
    const result = await readCsvFile(selected, kind, maxRows);
    setParsing(false);
    if (!result.ok) {
      setParseError(result.message);
      return;
    }
    const parsed = result.csv;
    const m = autoMap(kind, parsed.headers);
    const columnSamples = (fields: string[], limit: number) =>
      fields.flatMap((f) => {
        const col = m[f];
        if (col === null || col === undefined) return [];
        return parsed.rows.slice(0, limit).map((r) => r.cells[col] ?? "");
      });
    const dates = detectDateOrder(columnSamples(DATE_FIELDS[kind], 500));
    const decimal = detectDecimalSeparator(columnSamples(AMOUNT_FIELDS[kind], 500));
    const detected = detectSource(parsed.headers);
    setCsv(parsed);
    setFile({ name: selected.name, size: selected.size });
    setSource(detected);
    setMapping(m);
    setDateAmbiguous(dates.ambiguous && DATE_FIELDS[kind].length > 0);
    setOptions({
      ...DEFAULT_OPTIONS,
      dateFormat: dates.order,
      decimalSeparator: decimal,
      duplicates: kind === "products" ? "update" : "skip",
      pricesIncludeTax: store.pricesIncludeTax,
      refundsIncludeTax: true,
    });
    setStep("columns");
  }

  async function upload() {
    if (!csv || !file) return;
    setUploadError(null);
    setProgress({ phase: "creating", done: 0, total: csv.rows.length });
    const headerMapping = Object.fromEntries(Object.entries(mapping).map(([k, col]) => [k, col === null || col === undefined ? null : csv.headers[col]]));
    const created = await createImportJob({ kind, fileName: file.name, fileSize: file.size, totalRows: csv.rows.length, mapping: headerMapping, options });
    if (!created.ok) {
      setProgress(null);
      setUploadError(created.message);
      return;
    }
    const chunks = buildChunks(kind, rawRows);
    let done = 0;
    for (let i = 0; i < chunks.length; i++) {
      setProgress({ phase: "uploading", done, total: rawRows.length });
      let result = await stageImportRows(created.jobId, i, chunks[i]).catch(() => null);
      if (!result) result = await stageImportRows(created.jobId, i, chunks[i]).catch(() => null);
      if (!result || !result.ok) {
        setProgress(null);
        setUploadError(result && !result.ok ? result.message : "The connection was interrupted. Check your connection and try again.");
        await cancelImport(created.jobId).catch(() => undefined);
        return;
      }
      done += chunks[i].length;
    }
    setProgress({ phase: "checking", done, total: rawRows.length });
    const finalized = await finalizeImport(created.jobId).catch(() => null);
    if (!finalized || !finalized.ok) {
      setProgress(null);
      setUploadError(finalized && !finalized.ok ? finalized.message : "We could not check the import. Please try again.");
      return;
    }
    router.push(`/app/imports/${created.jobId}` as Route);
  }

  const missing = missingRequired(kind, mapping);
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const reachable = (s: Step) => {
    const i = STEPS.findIndex((x) => x.id === s);
    if (i <= stepIndex) return true;
    if (s === "file") return true;
    if (!csv) return false;
    if (s === "options" || s === "review") return missing.length === 0;
    return true;
  };

  if (!canWrite) {
    return (
      <Alert tone="caution" title="Imports are paused">
        Your trial or subscription has ended. Your data is kept; subscribe to Pro to import again.
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Import steps">
        <ol className="flex flex-wrap gap-x-1 gap-y-2 text-sm">
          {STEPS.map((s, i) => {
            const current = s.id === step;
            const complete = i < stepIndex;
            return (
              <li key={s.id} className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!reachable(s.id) || Boolean(progress)}
                  onClick={() => setStep(s.id)}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-1.5 font-medium transition-colors disabled:cursor-not-allowed",
                    current ? "bg-navy-800 text-white" : complete ? "text-ink-2 hover:bg-hover" : "text-ink-3",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full text-xs tabular",
                      current ? "bg-white/15" : complete ? "bg-emerald-600 text-white" : "bg-sunken text-ink-3",
                    )}
                  >
                    {i + 1}
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 ? <span aria-hidden className="h-px w-3 bg-line-strong" /> : null}
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="rounded-lg border border-line bg-surface shadow-xs" aria-labelledby={`${id}-heading`}>
        <div className="border-b border-line px-5 py-4">
          <h2 id={`${id}-heading`} ref={headingRef} tabIndex={-1} className="text-md font-semibold tracking-tight text-ink focus:outline-none">
            {step === "kind" && "What are you importing?"}
            {step === "file" && `Choose your ${def.label.toLowerCase()} file`}
            {step === "columns" && "Match your columns"}
            {step === "options" && "Check how values are read"}
            {step === "review" && "Check and upload"}
          </h2>
          {store.isDemo ? (
            <p className="mt-1 text-sm text-caution-800">
              You are importing into the sample store. Switch to your own store to import real data.
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-3">
              Into <span className="font-medium text-ink-2">{store.name}</span> · amounts in {store.currency} · dates in {store.timezone}
            </p>
          )}
        </div>

        <div className="px-5 py-5">
          {step === "kind" ? (
            <div className="space-y-5">
              <div role="radiogroup" aria-label="Data type" className="grid gap-3 sm:grid-cols-2">
                {KIND_ORDER.map((k) => {
                  const selected = k === kind;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setKind(k);
                        setCsv(null);
                        setFile(null);
                      }}
                      className={cn(
                        "rounded-lg border px-4 py-3.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-emerald-500/25 focus-visible:outline-none",
                        selected ? "border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600" : "border-line hover:border-line-strong hover:bg-hover",
                      )}
                    >
                      <span className="font-medium text-ink">{IMPORT_KINDS[k].label}</span>
                      <span className="mt-1 block text-sm text-ink-3">{IMPORT_KINDS[k].description}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TemplateButton kind={kind} variant="ghost" />
                <Button onClick={() => setStep("file")}>Continue</Button>
              </div>
            </div>
          ) : null}

          {step === "file" ? (
            <div className="space-y-4">
              <label
                htmlFor={`${id}-file`}
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line-strong bg-sunken/40 px-6 py-10 text-center transition-colors hover:border-emerald-600 hover:bg-emerald-50/40"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void onFile(e.dataTransfer.files?.[0]);
                }}
              >
                <FileSpreadsheet className="size-7 text-ink-3" aria-hidden />
                <span className="font-medium text-ink">{parsing ? "Reading the file…" : "Choose a CSV file or drop it here"}</span>
                <span className="text-sm text-ink-3">
                  Up to {maxRows.toLocaleString("en-GB")} rows on your plan · {IMPORT_LIMITS.maxFileBytes / 1024 / 1024} MB maximum
                </span>
                <input
                  id={`${id}-file`}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="sr-only"
                  disabled={parsing}
                  onChange={(e) => {
                    void onFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {parseError ? (
                <Alert tone="negative" title="This file cannot be imported">
                  {parseError}
                </Alert>
              ) : null}
              <p className="flex items-start gap-2 text-sm text-ink-3">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                The file is read in this browser. Only the columns you match in the next step are sent to Narixia; customer names, emails and addresses in
                your export are never uploaded.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => setStep("kind")}>
                  Back
                </Button>
                <TemplateButton kind={kind} variant="ghost" />
              </div>
            </div>
          ) : null}

          {step === "columns" && csv ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
                <Badge tone="outline">{file?.name}</Badge>
                <span className="tabular">
                  {csv.rows.length.toLocaleString("en-GB")} rows · {csv.headers.length} columns
                </span>
                {source ? <Badge tone="positive">{SOURCE_LABELS[source]} recognised</Badge> : null}
                {csv.encoding === "windows-1252" ? <Badge tone="info">Windows encoding</Badge> : null}
              </div>
              {csv.skippedLeadingRows > 0 ? (
                <Alert tone="info">
                  The first {csv.skippedLeadingRows} {csv.skippedLeadingRows === 1 ? "line looks like a report title and was" : "lines look like report titles and were"} skipped; column names
                  were found on line {csv.skippedLeadingRows + 1}.
                </Alert>
              ) : null}
              {missing.length > 0 ? (
                <Alert tone="caution" title="Some required columns are not matched">
                  Choose a column for: {missing.join(", ")}.
                </Alert>
              ) : null}
              <TableContainer className="rounded-md border border-line">
                <Table>
                  <caption className="sr-only">Column matching</caption>
                  <THead>
                    <TR>
                      <TH>Narixia field</TH>
                      <TH>Column in your file</TH>
                      <TH>First values</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {[...def.fields].sort((a, b) => Number(b.required) - Number(a.required)).map((field) => {
                      const selectId = `${id}-map-${field.key}`;
                      const value = mapping[field.key];
                      return (
                        <TR key={field.key}>
                          <TD className="max-w-64 py-2.5 align-top">
                            <label htmlFor={selectId} className="font-medium text-ink">
                              {field.label}
                              {field.required ? (
                                <span className="ml-1 text-negative-700" aria-hidden>
                                  *
                                </span>
                              ) : null}
                              <span className="sr-only">{field.required ? " (required)" : " (optional)"}</span>
                            </label>
                            {field.description ? <p className="mt-0.5 text-xs text-ink-3">{field.description}</p> : null}
                          </TD>
                          <TD className="w-64 py-2.5 align-top">
                            <NativeSelect
                              id={selectId}
                              inputSize="sm"
                              value={value === null || value === undefined ? "" : String(value)}
                              onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value === "" ? null : Number(e.target.value) }))}
                              aria-invalid={field.required && (value === null || value === undefined) ? true : undefined}
                            >
                              <option value="">{field.required ? "Choose a column…" : "Not in this file"}</option>
                              {csv.headers.map((h, i) => (
                                <option key={i} value={i}>
                                  {h}
                                </option>
                              ))}
                            </NativeSelect>
                          </TD>
                          <TD className="max-w-72 py-2.5 align-top text-sm text-ink-3">
                            <span className="line-clamp-2 break-all">{samples(value).join(" · ") || "—"}</span>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </TableContainer>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => setStep("file")}>
                  Choose another file
                </Button>
                <Button disabled={missing.length > 0} onClick={() => setStep("options")}>
                  Continue
                </Button>
              </div>
            </div>
          ) : null}

          {step === "options" && csv ? (
            <div className="space-y-6">
              <div className="grid gap-5 sm:grid-cols-2">
                {DATE_FIELDS[kind].length > 0 ? (
                  <div className="space-y-1.5">
                    <label htmlFor={`${id}-date`} className="text-sm font-medium text-ink">
                      Date format
                    </label>
                    <NativeSelect id={`${id}-date`} value={options.dateFormat} onChange={(e) => set("dateFormat", e.target.value as ImportOptions["dateFormat"])}>
                      <option value="ymd">Year-month-day (2026-03-15)</option>
                      <option value="dmy">Day/month/year (15/03/2026)</option>
                      <option value="mdy">Month/day/year (03/15/2026)</option>
                    </NativeSelect>
                    <p className={cn("text-xs", dateAmbiguous ? "font-medium text-caution-800" : "text-ink-3")}>
                      {dateAmbiguous
                        ? "Every date in this file could be read either way (e.g. 03/04). Make sure this is right."
                        : `First dates: ${samples(mapping[DATE_FIELDS[kind][0]], 2).join(", ") || "—"}`}
                    </p>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <label htmlFor={`${id}-decimal`} className="text-sm font-medium text-ink">
                    Decimal separator
                  </label>
                  <NativeSelect id={`${id}-decimal`} value={options.decimalSeparator} onChange={(e) => set("decimalSeparator", e.target.value as "." | ",")}>
                    <option value=".">Point (1,234.50)</option>
                    <option value=",">Comma (1.234,50)</option>
                  </NativeSelect>
                  <p className="text-xs text-ink-3">First amounts: {samples(mapping[AMOUNT_FIELDS[kind][0]], 3).join(", ") || "—"}</p>
                </div>
              </div>

              {kind !== "expenses" ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-ink">When a record already exists in Narixia</legend>
                  {(["skip", "update"] as const).map((strategy) => (
                    <label key={strategy} className="flex items-start gap-2.5 text-sm">
                      <input
                        type="radio"
                        name={`${id}-duplicates`}
                        value={strategy}
                        checked={options.duplicates === strategy}
                        onChange={() => set("duplicates", strategy)}
                        className="mt-0.5 size-4 accent-emerald-600"
                      />
                      <span>
                        <span className="font-medium text-ink">{strategy === "skip" ? "Skip it" : "Replace it with the file's version"}</span>
                        <span className="block text-ink-3">
                          {strategy === "skip"
                            ? "Safe for re-importing a file you imported before: nothing is counted twice."
                            : kind === "orders"
                              ? "Use when orders changed since the last import. Refunds and costs not in the file are kept."
                              : kind === "products"
                                ? "Updates names and costs from the file. Values missing in the file are kept."
                                : "Replaces that day's figures for the campaign."}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : (
                <p className="text-sm text-ink-3">An expense identical to one already recorded (same date, category, amount and description) is skipped.</p>
              )}

              {kind === "orders" ? (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium text-ink">Orders</legend>
                  <OptionCheck
                    checked={options.pricesIncludeTax}
                    onChange={(v) => set("pricesIncludeTax", v)}
                    label="Prices in this file include VAT / sales tax"
                    hint="Narixia removes each order's tax so margins are not inflated by tax you pass on. Needs the Taxes column."
                  />
                  <OptionCheck
                    checked={options.refundsIncludeTax}
                    onChange={(v) => set("refundsIncludeTax", v)}
                    label="Refunded amounts include tax"
                    hint="True for Shopify exports, even when prices exclude tax."
                  />
                  <OptionCheck checked={options.skipCancelled} onChange={(v) => set("skipCancelled", v)} label="Skip cancelled orders" hint="Rows with a cancellation date are listed as skipped." />
                  {options.pricesIncludeTax && (mapping.taxes === null || mapping.taxes === undefined) ? (
                    <Alert tone="caution">No Taxes column is matched, so no tax can be removed. Amounts will be stored as they are.</Alert>
                  ) : null}
                </fieldset>
              ) : null}

              {kind === "ad_spend" && (mapping.platform === null || mapping.platform === undefined) ? (
                <div className="max-w-sm space-y-1.5">
                  <label htmlFor={`${id}-platform`} className="text-sm font-medium text-ink">
                    Platform of these campaigns
                  </label>
                  <NativeSelect id={`${id}-platform`} value={options.defaultPlatform} onChange={(e) => set("defaultPlatform", e.target.value as Platform)}>
                    {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : null}

              {kind === "expenses" ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  {mapping.category === null || mapping.category === undefined ? (
                    <div className="space-y-1.5">
                      <label htmlFor={`${id}-category`} className="text-sm font-medium text-ink">
                        Category for these expenses
                      </label>
                      <NativeSelect id={`${id}-category`} value={options.defaultCategory} onChange={(e) => set("defaultCategory", e.target.value as ExpenseCategory)}>
                        {Object.entries(EXPENSE_CATEGORIES).map(([value, c]) => (
                          <option key={value} value={value}>
                            {c.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  ) : null}
                  <div className="space-y-1.5">
                    <label htmlFor={`${id}-kind`} className="text-sm font-medium text-ink">
                      Fixed or variable
                    </label>
                    <NativeSelect
                      id={`${id}-kind`}
                      value={options.defaultKind ?? ""}
                      onChange={(e) => set("defaultKind", e.target.value === "" ? null : (e.target.value as "fixed" | "variable"))}
                    >
                      <option value="">Each category&rsquo;s usual type</option>
                      <option value="variable">Variable (grows with sales)</option>
                      <option value="fixed">Fixed</option>
                    </NativeSelect>
                    <p className="text-xs text-ink-3">Variable costs reduce contribution margin; fixed costs only the operating estimate.</p>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => setStep("columns")}>
                  Back
                </Button>
                <Button onClick={() => setStep("review")}>Check the rows</Button>
              </div>
            </div>
          ) : null}

          {step === "review" && csv ? (
            <div className="space-y-5">
              <dl className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
                {[
                  { label: "Rows in file", value: normalized.length, icon: null },
                  { label: "Ready", value: counts.valid, icon: <CheckCircle2 className="size-4 text-emerald-700" aria-hidden /> },
                  { label: "With errors", value: counts.invalid, icon: <XCircle className="size-4 text-negative-700" aria-hidden /> },
                  { label: "Skipped", value: counts.skipped, icon: <Info className="size-4 text-ink-3" aria-hidden /> },
                ].map((s) => (
                  <div key={s.label} className="bg-surface px-4 py-3">
                    <dt className="flex items-center gap-1.5 text-xs text-ink-3">
                      {s.icon}
                      {s.label}
                    </dt>
                    <dd className="mt-0.5 text-lg font-semibold text-ink tabular">{s.value.toLocaleString("en-GB")}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm text-ink-3">
                Duplicates of records already in Narixia are detected after upload. Nothing is imported until you confirm on the next screen.
                {counts.invalid > 0 ? " Rows with errors are kept aside and listed with the reason; fix them in your file and import it again." : ""}
              </p>

              <PreviewTable kind={kind} rows={normalized} />

              {uploadError ? (
                <Alert tone="negative" title="Upload stopped">
                  {uploadError}
                </Alert>
              ) : null}
              {progress ? (
                <div className="space-y-2" aria-live="polite">
                  <div className="flex justify-between text-sm text-ink-2">
                    <span>
                      {progress.phase === "creating" ? "Starting…" : progress.phase === "uploading" ? "Uploading and validating rows…" : "Looking for duplicates…"}
                    </span>
                    <span className="tabular">
                      {progress.done.toLocaleString("en-GB")} / {progress.total.toLocaleString("en-GB")}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => setStep("options")} disabled={Boolean(progress)}>
                  Back
                </Button>
                <Button onClick={() => void upload()} loading={Boolean(progress)} disabled={counts.valid === 0}>
                  <Upload aria-hidden />
                  Upload {counts.valid.toLocaleString("en-GB")} {counts.valid === 1 ? "row" : "rows"} for review
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function OptionCheck({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" aria-describedby={`${id}-hint`} />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-sm text-ink-3">
          {hint}
        </p>
      </div>
    </div>
  );
}

function PreviewTable({ kind, rows }: { kind: ImportKind; rows: NormalizedRow[] }) {
  const problems = rows.filter((r) => r.status !== "valid" || r.warnings.length > 0);
  const shown = (problems.length > 0 ? problems : rows).slice(0, 25);
  const fields = PREVIEW_FIELDS[kind];
  const labels = Object.fromEntries(IMPORT_KINDS[kind].fields.map((f) => [f.key, f.label]));
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-ink">
        {problems.length > 0 ? `Rows to look at (${problems.length.toLocaleString("en-GB")}${problems.length > 25 ? ", first 25 shown" : ""})` : "First rows"}
      </h3>
      <TableContainer className="rounded-md border border-line">
        <Table className="text-sm">
          <caption className="sr-only">Row preview</caption>
          <THead>
            <TR>
              <TH className="w-16">Row</TH>
              <TH className="w-28">Status</TH>
              {fields.map((f) => (
                <TH key={f}>{labels[f]}</TH>
              ))}
              <TH>Notes</TH>
            </TR>
          </THead>
          <TBody>
            {shown.map((r) => (
              <TR key={r.rowNumber} className="align-top">
                <TD className="py-2 text-ink-3 tabular">{r.rowNumber}</TD>
                <TD className="py-2">
                  {r.status === "valid" ? (
                    <Badge tone={r.warnings.length ? "caution" : "positive"}>{r.warnings.length ? "Ready, see note" : "Ready"}</Badge>
                  ) : r.status === "skipped" ? (
                    <Badge tone="neutral">Skipped</Badge>
                  ) : (
                    <Badge tone="negative">Error</Badge>
                  )}
                </TD>
                {fields.map((f) => (
                  <TD key={f} className="max-w-48 truncate py-2 text-ink-2">
                    {r.raw[f] ?? ""}
                  </TD>
                ))}
                <TD className="min-w-64 py-2 text-xs">
                  {[...r.errors.map((e) => ({ ...e, tone: "error" as const })), ...r.warnings.map((w) => ({ ...w, tone: "warning" as const }))].map((issue, i) => (
                    <p key={i} className={cn("flex gap-1.5", issue.tone === "error" ? "text-negative-700" : "text-caution-800")}>
                      {issue.tone === "error" ? <XCircle className="mt-0.5 size-3 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />}
                      <span>{issue.message}</span>
                    </p>
                  ))}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableContainer>
    </div>
  );
}
