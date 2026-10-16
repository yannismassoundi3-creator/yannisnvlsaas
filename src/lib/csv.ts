/**
 * CSV writing for exports and reports.
 *
 * Spreadsheet applications execute cells that start with =, +, -, @, tab or
 * carriage return as formulas ("CSV injection"). Text cells — which can hold
 * imported product names or campaign names — are prefixed with an apostrophe
 * when they start with one of those characters. Numbers are written by the
 * application itself and are emitted as plain values.
 */

export type CsvCell = string | number | boolean | null | undefined | { decimal: string };

const FORMULA_START = /^[=+\-@\t\r]/;
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

export function escapeCsvCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) return "";
    return String(cell);
  }
  if (typeof cell === "boolean") return cell ? "true" : "false";
  if (typeof cell === "object") {
    if (!DECIMAL_RE.test(cell.decimal)) throw new TypeError(`Not a decimal: ${cell.decimal}`);
    return cell.decimal;
  }
  let text = cell;
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (/[",\r\n;]/.test(text) || text !== text.trim()) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsvLine(cells: CsvCell[]): string {
  return cells.map(escapeCsvCell).join(",");
}

/** Full CSV document with a UTF-8 BOM (so Excel reads accents correctly) and CRLF line ends. */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  return "﻿" + [toCsvLine(header), ...rows.map(toCsvLine)].join("\r\n") + "\r\n";
}

/** Safe file name part: letters, digits and dashes only. */
export function fileSlug(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "export"
  );
}
