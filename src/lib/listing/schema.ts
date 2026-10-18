import { z } from "zod";
import { LOCALES } from "@/i18n/config";

/**
 * Listings written with AI from item photos: the request the browser sends,
 * its limits, and the listing Claude returns (JSON schema sent to the API for
 * structured output, then validated again with zod). Pure (no I/O) and
 * unit-tested.
 */

export const LISTING_LIMITS = {
  maxImages: 3,
  /** Per image, after base64 decoding. */
  maxImageBytes: 1.5 * 1024 * 1024,
  /** Whole request body. */
  maxBodyBytes: 5 * 1024 * 1024,
} as const;

export const CONDITIONS = ["neuf_avec_etiquette", "tres_bon", "bon", "satisfaisant"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const LISTING_PLATFORMS = ["vinted", "leboncoin", "ebay", "vestiaire_collective"] as const;
export type ListingPlatform = (typeof LISTING_PLATFORMS)[number];

export const CONFIDENCE = ["visible_label", "likely", "unknown"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

// -----------------------------------------------------------------------------
// Request
// -----------------------------------------------------------------------------
export const listingRequest = z.object({
  /** Base64 JPEG (or PNG/WebP) without the data: prefix. */
  images: z.array(z.string().min(1)).min(1).max(LISTING_LIMITS.maxImages),
  name: z.string().max(300).optional().default(""),
  price: z.string().max(40).optional().default(""),
  locale: z.enum(LOCALES),
});
export type ListingRequest = z.input<typeof listingRequest>;

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

/** Image type from its first bytes (never from a name or a declared type). */
export function sniffImage(bytes: Uint8Array): ImageMediaType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF" &&
    String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export type CheckedImage = { mediaType: ImageMediaType; data: string; bytes: number };
export type ImageCheck = { ok: true; images: CheckedImage[] } | { ok: false; reason: "too_many" | "too_large" | "invalid" };

/** Decodes and checks the images of a request: count, size per image, real image type. */
export function checkImages(images: readonly string[]): ImageCheck {
  if (images.length === 0) return { ok: false, reason: "invalid" };
  if (images.length > LISTING_LIMITS.maxImages) return { ok: false, reason: "too_many" };
  const out: CheckedImage[] = [];
  for (const data of images) {
    // Cheap size check before decoding: 4 base64 characters carry 3 bytes.
    if (Math.floor((data.length * 3) / 4) > LISTING_LIMITS.maxImageBytes + 2) return { ok: false, reason: "too_large" };
    if (data.length % 4 !== 0 || !BASE64.test(data)) return { ok: false, reason: "invalid" };
    const bytes = Buffer.from(data, "base64");
    if (bytes.length > LISTING_LIMITS.maxImageBytes) return { ok: false, reason: "too_large" };
    const mediaType = sniffImage(bytes);
    if (!mediaType) return { ok: false, reason: "invalid" };
    out.push({ mediaType, data, bytes: bytes.length });
  }
  return { ok: true, images: out };
}

// -----------------------------------------------------------------------------
// Listing returned by Claude
// -----------------------------------------------------------------------------
const nullableText = (max: number) =>
  z
    .string()
    .nullable()
    .transform((v) => {
      const t = v?.trim() ?? "";
      return t ? t.slice(0, max) : null;
    });

const text = (max: number) => z.string().transform((v) => v.trim().slice(0, max));

const minor = z.number().int().min(0).max(100_000_000);

/**
 * The listing as the app uses it. Types and enums are strict (an answer that
 * does not match is rejected and the analysis refunded); lengths are clamped
 * rather than rejected, since structured output cannot enforce them.
 */
export const listingSchema = z.object({
  title: text(80).pipe(z.string().min(1)),
  description: text(2000).pipe(z.string().min(1)),
  brand: nullableText(80),
  brandConfidence: z.enum(CONFIDENCE),
  category: text(80),
  colors: z.array(text(40)).transform((v) => v.filter(Boolean).slice(0, 6)),
  material: nullableText(80),
  materialConfidence: z.enum(CONFIDENCE),
  size: nullableText(40),
  condition: z.enum(CONDITIONS),
  defects: z.array(text(200)).transform((v) => v.filter(Boolean).slice(0, 10)),
  priceRange: z
    .object({ low: minor, high: minor })
    .nullable()
    .transform((r) => (r ? { low: Math.min(r.low, r.high), high: Math.max(r.low, r.high) } : null)),
  priceNote: text(300),
  targetAudience: text(120),
  platforms: z
    .array(z.object({ platform: z.enum(LISTING_PLATFORMS), reason: text(240) }))
    .min(1)
    .transform((list) => {
      // Ranked, 1 to 4 entries, each platform once.
      const seen = new Set<string>();
      return list.filter((p) => (seen.has(p.platform) ? false : (seen.add(p.platform), true))).slice(0, 4);
    }),
  keywords: z.array(text(40)).transform((v) => [...new Set(v.filter(Boolean))].slice(0, 10)),
});
export type Listing = z.output<typeof listingSchema>;

const str = (description: string) => ({ type: "string", description });
const nullableStr = (description: string) => ({ anyOf: [{ type: "string" }, { type: "null" }], description });

/**
 * JSON schema for the API's structured output (output_config.format). Only
 * features structured output supports: no length or number constraints (they
 * are stated in the descriptions and enforced by listingSchema).
 */
export const LISTING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "description",
    "brand",
    "brandConfidence",
    "category",
    "colors",
    "material",
    "materialConfidence",
    "size",
    "condition",
    "defects",
    "priceRange",
    "priceNote",
    "targetAudience",
    "platforms",
    "keywords",
  ],
  properties: {
    title: str("Listing title, at most 80 characters."),
    description: str("Listing description in the style of Vinted: 3 to 8 short lines separated by newlines, no emoji spam, only what is visible."),
    brand: nullableStr("Brand, or null when no label or logo makes it visible."),
    brandConfidence: { type: "string", enum: [...CONFIDENCE], description: "visible_label when a label or logo is readable, likely when inferred from the design, unknown otherwise." },
    category: str("Item category, e.g. jacket, dress, sneakers."),
    colors: { type: "array", items: { type: "string" }, description: "Main colours as seen in the photos." },
    material: nullableStr("Material, or null when no composition label is readable and it cannot be seen."),
    materialConfidence: { type: "string", enum: [...CONFIDENCE], description: "visible_label, likely or unknown, like brandConfidence." },
    size: nullableStr("Size only when a size label is readable in a photo, else null."),
    condition: { type: "string", enum: [...CONDITIONS], description: "Condition seen in the photos: neuf_avec_etiquette (new with tag visible), tres_bon, bon or satisfaisant." },
    defects: { type: "array", items: { type: "string" }, description: "Visible defects (stains, holes, pilling, wear). Empty when none is visible." },
    priceRange: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["low", "high"],
          properties: { low: { type: "integer", description: "Low estimate in euro cents." }, high: { type: "integer", description: "High estimate in euro cents." } },
        },
        { type: "null" },
      ],
      description: "Rough second-hand price range in euro cents (integers), or null when no sensible estimate is possible.",
    },
    priceNote: str("One sentence saying the price is an estimate without market data, to be checked against similar listings."),
    targetAudience: str("Who the item is for, in a few words."),
    platforms: {
      type: "array",
      description: "1 to 4 platforms ranked from best to least suited, each with a short reason.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["platform", "reason"],
        properties: { platform: { type: "string", enum: [...LISTING_PLATFORMS] }, reason: { type: "string" } },
      },
    },
    keywords: { type: "array", items: { type: "string" }, description: "At most 10 search keywords." },
  },
} as const;
