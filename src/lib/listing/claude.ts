import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Locale } from "@/i18n/config";
import type { ListingAiConfig } from "./config";
import { systemPrompt, userPrompt } from "./prompt";
import { LISTING_JSON_SCHEMA, listingSchema, type CheckedImage, type Listing } from "./schema";

/**
 * One call to Claude per analysis: the photos (already enhanced and
 * downscaled in the browser), what the seller typed, and the listing schema as
 * structured output. Never called in tests or locally without a key: tests
 * mock the SDK and LISTING_AI_FAKE returns a canned listing.
 */

export type ListingFailure =
  | "refusal"
  | "truncated"
  | "invalid_output"
  | "rate_limited"
  | "overloaded"
  | "unavailable"
  | "cancelled";

export type ListingOutcome = { ok: true; listing: Listing; model: string } | { ok: false; reason: ListingFailure };

let cachedClient: { key: string; client: Anthropic } | null = null;

function client(apiKey: string): Anthropic {
  if (!cachedClient || cachedClient.key !== apiKey) {
    // One retry on 429/5xx/connection errors; an analysis normally takes 10-30 s.
    cachedClient = { key: apiKey, client: new Anthropic({ apiKey, maxRetries: 1, timeout: 90_000 }) };
  }
  return cachedClient.client;
}

/** Counts and stop reasons only: never image data, prompts or generated text. */
function logOutcome(fields: Record<string, string | number | null | undefined>) {
  console.info("[listing-ai]", fields);
}

export async function generateListing(
  config: ListingAiConfig,
  input: { images: CheckedImage[]; name: string; price: string; locale: Locale },
  signal?: AbortSignal,
): Promise<ListingOutcome> {
  if (config.fake) return fakeListing(input.locale, signal);

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client(config.apiKey).beta.messages.create(
      {
        model: config.model,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: LISTING_JSON_SCHEMA } },
        system: systemPrompt(input.locale),
        messages: [
          {
            role: "user",
            content: [
              ...input.images.map((image) => ({
                type: "image" as const,
                source: { type: "base64" as const, media_type: image.mediaType, data: image.data },
              })),
              { type: "text" as const, text: userPrompt(input.locale, { name: input.name, price: input.price, photos: input.images.length }) },
            ],
          },
        ],
      },
      { signal },
    );
  } catch (error) {
    const reason = failureFromError(error);
    logOutcome({ outcome: "error", reason, status: error instanceof Anthropic.APIError ? (error.status ?? null) : null, images: input.images.length });
    return { ok: false, reason };
  }

  const usage = { images: input.images.length, input_tokens: response.usage?.input_tokens, output_tokens: response.usage?.output_tokens, stop_reason: response.stop_reason, model: response.model };
  // Check why generation stopped before reading the content.
  if (response.stop_reason === "refusal") {
    logOutcome({ outcome: "refusal", ...usage, category: response.stop_details?.category ?? null });
    return { ok: false, reason: "refusal" };
  }
  if (response.stop_reason === "max_tokens") {
    logOutcome({ outcome: "truncated", ...usage });
    return { ok: false, reason: "truncated" };
  }
  const text = response.content.find((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")?.text;
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  const parsed = listingSchema.safeParse(json);
  if (!parsed.success) {
    logOutcome({ outcome: "invalid_output", ...usage });
    return { ok: false, reason: "invalid_output" };
  }
  logOutcome({ outcome: "ok", ...usage });
  return { ok: true, listing: parsed.data, model: response.model };
}

/** Maps the SDK's typed errors to what the interface says (never by matching messages). */
export function failureFromError(error: unknown): ListingFailure {
  if (error instanceof Anthropic.APIUserAbortError) return "cancelled";
  if (error instanceof Anthropic.RateLimitError) return "rate_limited";
  if (error instanceof Anthropic.InternalServerError) return "overloaded";
  if (error instanceof Anthropic.APIConnectionError) return "unavailable";
  if (error instanceof Anthropic.APIError) return "unavailable";
  if (error instanceof Error && error.name === "AbortError") return "cancelled";
  return "unavailable";
}

// -----------------------------------------------------------------------------
// Fake mode (LISTING_AI_FAKE=1, never in production): a canned listing, clearly
// marked as test data, after a short delay so the loading state is visible.
// -----------------------------------------------------------------------------
const FAKE: Record<Locale, unknown> = {
  en: {
    title: "[TEST DATA] Blue denim jacket, classic cut",
    description: "[Test data generated without AI]\nBlue denim jacket with a classic cut.\nMetal buttons, two chest pockets.\nLight fading on the cuffs (see photos).\nSmoke-free home.",
    brand: null,
    brandConfidence: "unknown",
    category: "Jacket",
    colors: ["Blue"],
    material: "Denim",
    materialConfidence: "likely",
    size: null,
    condition: "bon",
    defects: ["Light fading on the cuffs"],
    priceRange: { low: 1500, high: 2500 },
    priceNote: "Test data: an estimate without market data, to be checked against similar listings.",
    targetAudience: "Adults, casual style",
    platforms: [
      { platform: "vinted", reason: "Clothing sells quickly there." },
      { platform: "leboncoin", reason: "Good for local hand-over." },
    ],
    keywords: ["denim jacket", "jean", "blue", "casual"],
  },
  fr: {
    title: "[DONNÉES DE TEST] Veste en jean bleue, coupe classique",
    description: "[Données de test générées sans IA]\nVeste en jean bleue, coupe classique.\nBoutons métalliques, deux poches poitrine.\nLégère décoloration aux poignets (voir photos).\nMaison non-fumeur.",
    brand: null,
    brandConfidence: "unknown",
    category: "Veste",
    colors: ["Bleu"],
    material: "Jean",
    materialConfidence: "likely",
    size: null,
    condition: "bon",
    defects: ["Légère décoloration aux poignets"],
    priceRange: { low: 1500, high: 2500 },
    priceNote: "Données de test : estimation sans données de marché, à comparer avec des annonces similaires.",
    targetAudience: "Adultes, style décontracté",
    platforms: [
      { platform: "vinted", reason: "Les vêtements s'y vendent vite." },
      { platform: "leboncoin", reason: "Pratique pour une remise en main propre." },
    ],
    keywords: ["veste en jean", "jean", "bleu", "décontracté"],
  },
};

async function fakeListing(locale: Locale, signal?: AbortSignal): Promise<ListingOutcome> {
  const cancelled = await new Promise<boolean>((resolve) => {
    if (signal?.aborted) return resolve(true);
    const timer = setTimeout(() => resolve(false), 600);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  if (cancelled) return { ok: false, reason: "cancelled" };
  logOutcome({ outcome: "ok", fake: 1 });
  return { ok: true, listing: listingSchema.parse(FAKE[locale]), model: "fake" };
}
