import type { Locale } from "@/i18n/config";
import { importRows } from "@/i18n/messages/imports-rows";
import { fieldCopy, IMPORT_KINDS, type ImportKind } from "./schema";

/** Field key -> column index in the file, or null when not mapped. */
export type ColumnMapping = Record<string, number | null>;

/** "Amount spent (EUR)" -> "amountspent"; "Coût unitaire" -> "coutunitaire". */
export function normalizeHeader(header: string): string {
  return header
    .replace(/^﻿/, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Suggests a column for each field from the header names. Each column is used
 * at most once; when several fields could claim a column, the field for which
 * it is the more specific synonym wins.
 */
export function autoMap(kind: ImportKind, headers: string[]): ColumnMapping {
  const fields = IMPORT_KINDS[kind].fields;
  const normalized = headers.map(normalizeHeader);
  const candidates: { field: string; fieldIndex: number; column: number; rank: number }[] = [];
  fields.forEach((field, fieldIndex) => {
    field.synonyms.forEach((synonym, rank) => {
      normalized.forEach((h, column) => {
        if (h === synonym) candidates.push({ field: field.key, fieldIndex, column, rank });
      });
    });
  });
  candidates.sort((a, b) => a.rank - b.rank || a.fieldIndex - b.fieldIndex || a.column - b.column);

  const mapping: ColumnMapping = Object.fromEntries(fields.map((field) => [field.key, null]));
  const usedColumns = new Set<number>();
  for (const c of candidates) {
    if (mapping[c.field] !== null || usedColumns.has(c.column)) continue;
    mapping[c.field] = c.column;
    usedColumns.add(c.column);
  }
  return mapping;
}

export type DetectedSource = "shopify_orders" | "shopify_products" | "meta_ads" | "google_ads" | "tiktok_ads" | null;

export function detectSource(headers: string[]): DetectedSource {
  const h = new Set(headers.map(normalizeHeader));
  if (h.has("lineitemname") && h.has("name") && h.has("createdat")) return "shopify_orders";
  if (h.has("handle") && h.has("title") && (h.has("variantsku") || h.has("variantprice"))) return "shopify_products";
  if (h.has("campaignname") && h.has("amountspent")) return "meta_ads";
  if (h.has("campaign") && h.has("cost") && (h.has("impr") || h.has("convvalue"))) return "google_ads";
  if (h.has("campaignname") && h.has("cost")) return "tiktok_ads";
  return null;
}

export const SOURCE_LABELS: Record<Exclude<DetectedSource, null>, string> = importRows.en.sources;

/** Name of a recognised export, e.g. "Shopify order export". */
export function sourceLabel(source: Exclude<DetectedSource, null>, locale: Locale = "en"): string {
  return importRows[locale].sources[source];
}

/** Labels of the required fields that have no column. */
export function missingRequired(kind: ImportKind, mapping: ColumnMapping, locale: Locale = "en"): string[] {
  return IMPORT_KINDS[kind].fields
    .filter((f) => f.required && (mapping[f.key] === null || mapping[f.key] === undefined))
    .map((f) => fieldCopy(kind, f.key, locale).label);
}

/** Cells of the mapped columns only: the rest of the file never leaves the browser. */
export function extractMapped(row: string[], mapping: ColumnMapping): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, column] of Object.entries(mapping)) {
    if (column === null || column === undefined) continue;
    out[key] = row[column] ?? "";
  }
  return out;
}
