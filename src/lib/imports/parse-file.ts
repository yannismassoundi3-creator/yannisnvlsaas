import Papa from "papaparse";
import { normalizeHeader } from "./mapping";
import { IMPORT_KINDS, IMPORT_LIMITS, type ImportKind } from "./schema";

/**
 * Reads a CSV file in the browser. The file itself is never uploaded: only
 * the cells of the columns the user maps are sent, row by row, for import.
 */

export type ParsedCsv = {
  headers: string[];
  /** Data rows with their 1-based row number in the file (the header row is row 1 in most files). */
  rows: { rowNumber: number; cells: string[] }[];
  delimiter: string;
  encoding: "utf-8" | "windows-1252";
  /** Rows above the header (report titles in Google Ads exports, for example). */
  skippedLeadingRows: number;
};

export type ParseResult = { ok: true; csv: ParsedCsv } | { ok: false; message: string };

/** The row (within the first ten) whose cells look most like known column names. */
export function detectHeaderRow(data: string[][], kind: ImportKind): number {
  const known = new Set(IMPORT_KINDS[kind].fields.flatMap((f) => f.synonyms));
  let best = 0;
  let bestScore = 0;
  data.slice(0, 10).forEach((row, index) => {
    const score = row.filter((cell) => known.has(normalizeHeader(cell))).length;
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

/** Unique, non-empty column names: blanks become "Column 3", repeats get a suffix. */
export function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((cell, i) => {
    const base = cell.replace(/^﻿/, "").trim() || `Column ${i + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

export function parseCsvText(text: string, kind: ImportKind, maxRows: number): ParseResult {
  const clean = text.replace(/^﻿/, "");
  if (/\u0000/.test(clean.slice(0, 10_000))) {
    return { ok: false, message: "This does not look like a CSV file. Export your data as CSV (comma-separated values) and try again." };
  }
  const parsed = Papa.parse<string[]>(clean, { skipEmptyLines: false });
  const quoteError = parsed.errors.find((e) => e.type === "Quotes");
  if (quoteError) {
    return { ok: false, message: `The file has an unclosed quotation mark near row ${(quoteError.row ?? 0) + 1}. Check the file and export it again.` };
  }
  const data = parsed.data;
  const headerIndex = detectHeaderRow(data, kind);
  const headerCells = data[headerIndex] ?? [];
  if (headerCells.filter((c) => c.trim()).length === 0) return { ok: false, message: "The file is empty." };
  if (headerCells.length > IMPORT_LIMITS.maxColumns) {
    return { ok: false, message: `The file has ${headerCells.length} columns; at most ${IMPORT_LIMITS.maxColumns} are supported.` };
  }
  const rows: ParsedCsv["rows"] = [];
  for (let i = headerIndex + 1; i < data.length; i++) {
    const cells = data[i];
    if (!cells.some((c) => c.trim() !== "")) continue;
    rows.push({ rowNumber: i + 1, cells });
  }
  if (rows.length === 0) return { ok: false, message: "The file has column names but no data rows." };
  if (rows.length > maxRows) {
    return {
      ok: false,
      message: `This file has ${rows.length.toLocaleString("en-GB")} rows; your plan allows ${maxRows.toLocaleString("en-GB")} per import. Split the file into smaller files, or upgrade for larger imports.`,
    };
  }
  return {
    ok: true,
    csv: {
      headers: uniqueHeaders(headerCells),
      rows,
      delimiter: parsed.meta.delimiter,
      encoding: "utf-8",
      skippedLeadingRows: headerIndex,
    },
  };
}

/** Decodes as UTF-8, falling back to Windows-1252 (common for files saved by Excel). */
export async function readCsvFile(file: File, kind: ImportKind, maxRows: number): Promise<ParseResult> {
  if (file.size === 0) return { ok: false, message: "The file is empty." };
  if (file.size > IMPORT_LIMITS.maxFileBytes) {
    return { ok: false, message: `The file is larger than ${IMPORT_LIMITS.maxFileBytes / 1024 / 1024} MB. Split it into smaller files.` };
  }
  const buffer = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buffer);
  let encoding: ParsedCsv["encoding"] = "utf-8";
  if (text.includes("�")) {
    text = new TextDecoder("windows-1252").decode(buffer);
    encoding = "windows-1252";
  }
  const result = parseCsvText(text, kind, maxRows);
  return result.ok ? { ok: true, csv: { ...result.csv, encoding } } : result;
}
