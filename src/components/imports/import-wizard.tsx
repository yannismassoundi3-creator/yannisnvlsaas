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
import { useFormat, useLocale } from "@/i18n/client";
import { importUi } from "@/i18n/messages/imports-ui";
import { EXPENSE_CATEGORIES, expenseCategoryLabel, PLATFORM_LABELS, platformLabel, type ExpenseCategory, type Platform } from "@/lib/domain/types";
import { detectDecimalSeparator } from "@/lib/finance/decimal";
import { cancelImport, createImportJob, finalizeImport, stageImportRows } from "@/lib/imports/actions";
import { detectDateOrder } from "@/lib/imports/dates";
import { autoMap, detectSource, extractMapped, missingRequired, sourceLabel, type ColumnMapping, type DetectedSource } from "@/lib/imports/mapping";
import { normalizeRows, normalizeText, type NormalizedRow, type RawRow } from "@/lib/imports/normalize";
import { readCsvFile, type ParsedCsv } from "@/lib/imports/parse-file";
import { DEFAULT_OPTIONS, fieldCopy, fieldLabels, IMPORT_KINDS, IMPORT_LIMITS, kindCopy, KIND_ORDER, type ImportKind, type ImportOptions } from "@/lib/imports/schema";
import { cn } from "@/lib/utils";

type StoreInfo = { name: string; currency: string; timezone: string; pricesIncludeTax: boolean; isDemo: boolean };

type Props = {
  initialKind: ImportKind | null;
  store: StoreInfo;
  maxRows: number;
  canWrite: boolean;
};

type Step = "kind" | "file" | "columns" | "options" | "review";
const STEPS: Step[] = ["kind", "file", "columns", "options", "review"];

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
  const locale = useLocale();
  const t = importUi[locale].wizard;
  const f = useFormat();
  const [step, setStep] = useState<Step>(initialKind ? "file" : "kind");
  const [kind, setKind] = useState<ImportKind>(initialKind ?? "orders");
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [source, setSource] = useState<DetectedSource>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [options, setOptions] = useState<ImportOptions>({ ...DEFAULT_OPTIONS, locale });
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
    () => (step === "review" && csv ? normalizeRows(kind, rawRows, options, { currency: store.currency, timezone: store.timezone }, locale) : []),
    [step, csv, kind, rawRows, options, store.currency, store.timezone, locale],
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
    const result = await readCsvFile(selected, kind, maxRows, locale);
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
      locale,
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
        setUploadError(result && !result.ok ? result.message : t.interrupted);
        await cancelImport(created.jobId).catch(() => undefined);
        return;
      }
      done += chunks[i].length;
    }
    setProgress({ phase: "checking", done, total: rawRows.length });
    const finalized = await finalizeImport(created.jobId).catch(() => null);
    if (!finalized || !finalized.ok) {
      setProgress(null);
      setUploadError(finalized && !finalized.ok ? finalized.message : t.couldNotCheck);
      return;
    }
    router.push(`/app/imports/${created.jobId}` as Route);
  }

  const missing = missingRequired(kind, mapping, locale);
  const stepIndex = STEPS.indexOf(step);
  const reachable = (s: Step) => {
    const i = STEPS.indexOf(s);
    if (i <= stepIndex) return true;
    if (s === "file") return true;
    if (!csv) return false;
    if (s === "options" || s === "review") return missing.length === 0;
    return true;
  };

  if (!canWrite) {
    return (
      <Alert tone="caution" title={t.pausedTitle}>
        {t.pausedBody}
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <nav aria-label={t.stepsLabel}>
        <ol className="flex flex-wrap gap-x-1 gap-y-2 text-sm">
          {STEPS.map((s, i) => {
            const current = s === step;
            const complete = i < stepIndex;
            return (
              <li key={s} className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!reachable(s) || Boolean(progress)}
                  onClick={() => setStep(s)}
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
                  {t.steps[s]}
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
            {step === "kind" && t.headings.kind}
            {step === "file" && t.headings.file(kindCopy(kind, locale).label)}
            {step === "columns" && t.headings.columns}
            {step === "options" && t.headings.options}
            {step === "review" && t.headings.review}
          </h2>
          {store.isDemo ? (
            <p className="mt-1 text-sm text-caution-800">{t.demoStore}</p>
          ) : (
            <p className="mt-1 text-sm text-ink-3">
              {t.into} <span className="font-medium text-ink-2">{store.name}</span>
              {t.storeDetails(store.currency, store.timezone)}
            </p>
          )}
        </div>

        <div className="px-5 py-5">
          {step === "kind" ? (
            <div className="space-y-5">
              <div role="radiogroup" aria-label={t.dataType} className="grid gap-3 sm:grid-cols-2">
                {KIND_ORDER.map((k) => {
                  const selected = k === kind;
                  const copy = kindCopy(k, locale);
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
                      <span className="font-medium text-ink">{copy.label}</span>
                      <span className="mt-1 block text-sm text-ink-3">{copy.description}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TemplateButton kind={kind} variant="ghost" />
                <Button onClick={() => setStep("file")}>{t.continue}</Button>
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
                <span className="font-medium text-ink">{parsing ? t.reading : t.dropZone}</span>
                <span className="text-sm text-ink-3">{t.limits(f.count(maxRows), IMPORT_LIMITS.maxFileBytes / 1024 / 1024)}</span>
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
                <Alert tone="negative" title={t.cannotImport}>
                  {parseError}
                </Alert>
              ) : null}
              <p className="flex items-start gap-2 text-sm text-ink-3">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t.privacy}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => setStep("kind")}>
                  {t.back}
                </Button>
                <TemplateButton kind={kind} variant="ghost" />
              </div>
            </div>
          ) : null}

          {step === "columns" && csv ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
                <Badge tone="outline">{file?.name}</Badge>
                <span className="tabular">{t.fileSummary(f.count(csv.rows.length), csv.headers.length)}</span>
                {source ? <Badge tone="positive">{t.recognised(sourceLabel(source, locale))}</Badge> : null}
                {csv.encoding === "windows-1252" ? <Badge tone="info">{t.windowsEncoding}</Badge> : null}
              </div>
              {csv.skippedLeadingRows > 0 ? (
                <Alert tone="info">{t.skippedLines(csv.skippedLeadingRows)}</Alert>
              ) : null}
              {missing.length > 0 ? (
                <Alert tone="caution" title={t.missingTitle}>
                  {t.missingBody(missing.join(", "))}
                </Alert>
              ) : null}
              <TableContainer className="rounded-md border border-line">
                <Table>
                  <caption className="sr-only">{t.mappingCaption}</caption>
                  <THead>
                    <TR>
                      <TH>{t.narixiaField}</TH>
                      <TH>{t.fileColumn}</TH>
                      <TH>{t.firstValues}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {[...def.fields].sort((a, b) => Number(b.required) - Number(a.required)).map((field) => {
                      const selectId = `${id}-map-${field.key}`;
                      const value = mapping[field.key];
                      const copy = fieldCopy(kind, field.key, locale);
                      return (
                        <TR key={field.key}>
                          <TD className="max-w-64 py-2.5 align-top">
                            <label htmlFor={selectId} className="font-medium text-ink">
                              {copy.label}
                              {field.required ? (
                                <span className="ml-1 text-negative-700" aria-hidden>
                                  *
                                </span>
                              ) : null}
                              <span className="sr-only">{field.required ? t.required : t.optional}</span>
                            </label>
                            {copy.description ? <p className="mt-0.5 text-xs text-ink-3">{copy.description}</p> : null}
                          </TD>
                          <TD className="w-64 py-2.5 align-top">
                            <NativeSelect
                              id={selectId}
                              inputSize="sm"
                              value={value === null || value === undefined ? "" : String(value)}
                              onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value === "" ? null : Number(e.target.value) }))}
                              aria-invalid={field.required && (value === null || value === undefined) ? true : undefined}
                            >
                              <option value="">{field.required ? t.chooseColumn : t.notInFile}</option>
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
                  {t.chooseAnother}
                </Button>
                <Button disabled={missing.length > 0} onClick={() => setStep("options")}>
                  {t.continue}
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
                      {t.dateFormat}
                    </label>
                    <NativeSelect id={`${id}-date`} value={options.dateFormat} onChange={(e) => set("dateFormat", e.target.value as ImportOptions["dateFormat"])}>
                      <option value="ymd">{t.ymd}</option>
                      <option value="dmy">{t.dmy}</option>
                      <option value="mdy">{t.mdy}</option>
                    </NativeSelect>
                    <p className={cn("text-xs", dateAmbiguous ? "font-medium text-caution-800" : "text-ink-3")}>
                      {dateAmbiguous ? t.dateAmbiguous : t.firstDates(samples(mapping[DATE_FIELDS[kind][0]], 2).join(", ") || "—")}
                    </p>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <label htmlFor={`${id}-decimal`} className="text-sm font-medium text-ink">
                    {t.decimalSeparator}
                  </label>
                  <NativeSelect id={`${id}-decimal`} value={options.decimalSeparator} onChange={(e) => set("decimalSeparator", e.target.value as "." | ",")}>
                    <option value=".">{t.point}</option>
                    <option value=",">{t.comma}</option>
                  </NativeSelect>
                  <p className="text-xs text-ink-3">{t.firstAmounts(samples(mapping[AMOUNT_FIELDS[kind][0]], 3).join(", ") || "—")}</p>
                </div>
              </div>

              {kind !== "expenses" ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-ink">{t.existingLegend}</legend>
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
                        <span className="font-medium text-ink">{strategy === "skip" ? t.skipIt : t.replaceIt}</span>
                        <span className="block text-ink-3">
                          {strategy === "skip" ? t.skipHint : kind === "orders" ? t.replaceOrders : kind === "products" ? t.replaceProducts : t.replaceAdSpend}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : (
                <p className="text-sm text-ink-3">{t.expensesDuplicates}</p>
              )}

              {kind === "orders" ? (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium text-ink">{t.ordersLegend}</legend>
                  <OptionCheck checked={options.pricesIncludeTax} onChange={(v) => set("pricesIncludeTax", v)} label={t.pricesIncludeTax} hint={t.pricesIncludeTaxHint} />
                  <OptionCheck checked={options.refundsIncludeTax} onChange={(v) => set("refundsIncludeTax", v)} label={t.refundsIncludeTax} hint={t.refundsIncludeTaxHint} />
                  <OptionCheck checked={options.skipCancelled} onChange={(v) => set("skipCancelled", v)} label={t.skipCancelled} hint={t.skipCancelledHint} />
                  {options.pricesIncludeTax && (mapping.taxes === null || mapping.taxes === undefined) ? <Alert tone="caution">{t.noTaxesColumn}</Alert> : null}
                </fieldset>
              ) : null}

              {kind === "ad_spend" && (mapping.platform === null || mapping.platform === undefined) ? (
                <div className="max-w-sm space-y-1.5">
                  <label htmlFor={`${id}-platform`} className="text-sm font-medium text-ink">
                    {t.platform}
                  </label>
                  <NativeSelect id={`${id}-platform`} value={options.defaultPlatform} onChange={(e) => set("defaultPlatform", e.target.value as Platform)}>
                    {(Object.keys(PLATFORM_LABELS) as Platform[]).map((value) => (
                      <option key={value} value={value}>
                        {platformLabel(value, locale)}
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
                        {t.category}
                      </label>
                      <NativeSelect id={`${id}-category`} value={options.defaultCategory} onChange={(e) => set("defaultCategory", e.target.value as ExpenseCategory)}>
                        {(Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).map((value) => (
                          <option key={value} value={value}>
                            {expenseCategoryLabel(value, locale)}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  ) : null}
                  <div className="space-y-1.5">
                    <label htmlFor={`${id}-kind`} className="text-sm font-medium text-ink">
                      {t.fixedOrVariable}
                    </label>
                    <NativeSelect
                      id={`${id}-kind`}
                      value={options.defaultKind ?? ""}
                      onChange={(e) => set("defaultKind", e.target.value === "" ? null : (e.target.value as "fixed" | "variable"))}
                    >
                      <option value="">{t.usualKind}</option>
                      <option value="variable">{t.variable}</option>
                      <option value="fixed">{t.fixed}</option>
                    </NativeSelect>
                    <p className="text-xs text-ink-3">{t.kindHint}</p>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => setStep("columns")}>
                  {t.back}
                </Button>
                <Button onClick={() => setStep("review")}>{t.checkRows}</Button>
              </div>
            </div>
          ) : null}

          {step === "review" && csv ? (
            <div className="space-y-5">
              <dl className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
                {[
                  { label: t.rowsInFile, value: normalized.length, icon: null },
                  { label: t.ready, value: counts.valid, icon: <CheckCircle2 className="size-4 text-emerald-700" aria-hidden /> },
                  { label: t.withErrors, value: counts.invalid, icon: <XCircle className="size-4 text-negative-700" aria-hidden /> },
                  { label: t.skipped, value: counts.skipped, icon: <Info className="size-4 text-ink-3" aria-hidden /> },
                ].map((s) => (
                  <div key={s.label} className="bg-surface px-4 py-3">
                    <dt className="flex items-center gap-1.5 text-xs text-ink-3">
                      {s.icon}
                      {s.label}
                    </dt>
                    <dd className="mt-0.5 text-lg font-semibold text-ink tabular">{f.count(s.value)}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm text-ink-3">
                {t.reviewNote}
                {counts.invalid > 0 ? t.reviewErrorsNote : ""}
              </p>

              <PreviewTable kind={kind} rows={normalized} />

              {uploadError ? (
                <Alert tone="negative" title={t.uploadStopped}>
                  {uploadError}
                </Alert>
              ) : null}
              {progress ? (
                <div className="space-y-2" aria-live="polite">
                  <div className="flex justify-between text-sm text-ink-2">
                    <span>{progress.phase === "creating" ? t.starting : progress.phase === "uploading" ? t.uploading : t.checking}</span>
                    <span className="tabular">
                      {f.count(progress.done)} / {f.count(progress.total)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => setStep("options")} disabled={Boolean(progress)}>
                  {t.back}
                </Button>
                <Button onClick={() => void upload()} loading={Boolean(progress)} disabled={counts.valid === 0}>
                  <Upload aria-hidden />
                  {t.upload(f.count(counts.valid), counts.valid)}
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
  const locale = useLocale();
  const t = importUi[locale].preview;
  const f = useFormat();
  const problems = rows.filter((r) => r.status !== "valid" || r.warnings.length > 0);
  const shown = (problems.length > 0 ? problems : rows).slice(0, 25);
  const fields = PREVIEW_FIELDS[kind];
  const labels = fieldLabels(kind, locale);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-ink">{problems.length > 0 ? t.rowsToLook(f.count(problems.length), problems.length > 25) : t.firstRows}</h3>
      <TableContainer className="rounded-md border border-line">
        <Table className="text-sm">
          <caption className="sr-only">{t.caption}</caption>
          <THead>
            <TR>
              <TH className="w-16">{t.row}</TH>
              <TH className="w-28">{t.status}</TH>
              {fields.map((key) => (
                <TH key={key}>{labels[key]}</TH>
              ))}
              <TH>{t.notes}</TH>
            </TR>
          </THead>
          <TBody>
            {shown.map((r) => (
              <TR key={r.rowNumber} className="align-top">
                <TD className="py-2 text-ink-3 tabular">{r.rowNumber}</TD>
                <TD className="py-2">
                  {r.status === "valid" ? (
                    <Badge tone={r.warnings.length ? "caution" : "positive"}>{r.warnings.length ? t.readySeeNote : t.ready}</Badge>
                  ) : r.status === "skipped" ? (
                    <Badge tone="neutral">{t.skipped}</Badge>
                  ) : (
                    <Badge tone="negative">{t.error}</Badge>
                  )}
                </TD>
                {fields.map((key) => (
                  <TD key={key} className="max-w-48 truncate py-2 text-ink-2">
                    {r.raw[key] ?? ""}
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
