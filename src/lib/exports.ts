import "server-only";
import { minorToDecimalString, e4ToDecimalString } from "@/lib/finance/money";

/** Plain decimal cell ("1234.50") for CSV exports: numbers stay numbers in spreadsheets. */
export const moneyCell = (minor: number | null, currency: string) => (minor === null ? null : { decimal: minorToDecimalString(minor, currency) });
export const costCell = (e4: number | null) => (e4 === null ? null : { decimal: e4ToDecimalString(e4) });
export const rateCell = (rate: number | null) => (rate === null ? null : { decimal: (Math.round(rate * 10_000) / 100).toFixed(2) });

/** Plain-text error response for export routes; the message is already in the request language. */
export function textResponse(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
