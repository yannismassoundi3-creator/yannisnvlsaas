import { addDays, isValidDateString } from "@/lib/dates";
import { isPlatformId, type PlatformId } from "@/lib/onboarding/constants";

/**
 * Pure rules of the reseller mode (no I/O), shared by server actions, read
 * models and the interface, and unit-tested.
 */

/** Items in stock for more than this many days are listed as "items that linger". */
export const STALE_AFTER_DAYS = 60;

/** Crockford base32: no I, L, O or U, so references read and type back unambiguously. */
const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function randomBase32(length: number, random: (n: number) => Uint8Array = defaultRandom): string {
  const bytes = random(length);
  let out = "";
  for (let i = 0; i < length; i++) out += BASE32[bytes[i] % 32];
  return out;
}

function defaultRandom(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/**
 * Order number of a quick sale: "V-20261017-7KQ2MZ" (sale date, then 6
 * random characters, about a billion values per day). The database keeps
 * order numbers unique per store; the caller retries on the rare collision.
 */
export function saleNumber(date: string, random?: (n: number) => Uint8Array): string {
  if (!isValidDateString(date)) throw new Error("Invalid sale date");
  return `V-${date.replaceAll("-", "")}-${randomBase32(6, random)}`;
}

/**
 * Internal reference of an item ("R-…"). Products are unique per store by SKU,
 * else by name; resellers often own several pieces with the same name, so each
 * item gets its own reference. It is never shown in the reseller screens.
 */
export function itemReference(random?: (n: number) => Uint8Array): string {
  return `R-${randomBase32(10, random)}`;
}

/** Items acquired (or added) before this date have been in stock for more than STALE_AFTER_DAYS. */
export function staleBefore(today: string, days = STALE_AFTER_DAYS): string {
  return addDays(today, -days);
}

/** Whole days between two local dates (YYYY-MM-DD), never negative. */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
}

/** Selling platform preselected in the sale form: the last one used, else the store's platform. */
export function defaultSalesChannel(lastUsed: string | null | undefined, storePlatform: string): PlatformId {
  if (isPlatformId(lastUsed)) return lastUsed;
  return isPlatformId(storePlatform) ? storePlatform : "other";
}

const DIACRITICS = /[̀-ͯ]/g;

/** Lower-case words without accents or punctuation, for loose name comparisons. */
export function nameTokens(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);
}

/**
 * Similarity of two item names between 0 and 1 (shared words over the words of
 * the shorter name). "Veste en jean Levi's taille M" and "veste jean levis"
 * score high; unrelated names score 0.
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

/**
 * The stock item whose name best matches `title`, when the match is clear
 * enough (score ≥ 0.6). Used to prefill the sale form from a sale email; the
 * user always confirms.
 */
export function bestNameMatch<T extends { name: string }>(title: string | null | undefined, items: readonly T[]): T | null {
  if (!title) return null;
  let best: T | null = null;
  let bestScore = 0;
  for (const item of items) {
    const score = nameSimilarity(title, item.name);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return bestScore >= 0.6 ? best : null;
}
