import { describe, expect, it } from "vitest";
import { systemPrompt, userPrompt } from "@/lib/listing/prompt";
import { DEFAULT_MONTHLY_LIMIT, isMissingObject, parseMonthlyLimit, remainingAnalyses, usagePeriod } from "@/lib/listing/quota";
import { checkImages, LISTING_JSON_SCHEMA, LISTING_LIMITS, listingRequest, listingSchema, sniffImage } from "@/lib/listing/schema";

const validListing = {
  title: "Veste en jean bleue",
  description: "Veste en jean bleue.\nBoutons métalliques.\nLégère usure aux poignets.",
  brand: null,
  brandConfidence: "unknown",
  category: "Veste",
  colors: ["Bleu"],
  material: "Jean",
  materialConfidence: "likely",
  size: null,
  condition: "bon",
  defects: ["Usure aux poignets"],
  priceRange: { low: 1500, high: 2500 },
  priceNote: "Estimation sans données de marché.",
  targetAudience: "Adultes",
  platforms: [{ platform: "vinted", reason: "Vêtements" }],
  keywords: ["veste", "jean"],
};

const jpeg = (size = 64) => {
  const b = Buffer.alloc(size, 0x11);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  return b.toString("base64");
};

describe("listing returned by the AI", () => {
  it("accepts a valid listing", () => {
    const r = listingSchema.safeParse(validListing);
    expect(r.success).toBe(true);
  });

  it("clamps lengths and list sizes instead of rejecting them", () => {
    const r = listingSchema.parse({
      ...validListing,
      title: "x".repeat(120),
      keywords: Array.from({ length: 15 }, (_, i) => `k${i}`),
      platforms: [
        { platform: "vinted", reason: "a" },
        { platform: "vinted", reason: "dup" },
        { platform: "ebay", reason: "b" },
        { platform: "leboncoin", reason: "c" },
        { platform: "vestiaire_collective", reason: "d" },
      ],
      brand: "  ",
    });
    expect(r.title).toHaveLength(80);
    expect(r.keywords).toHaveLength(10);
    expect(r.platforms.map((p) => p.platform)).toEqual(["vinted", "ebay", "leboncoin", "vestiaire_collective"]);
    expect(r.brand).toBeNull();
  });

  it("orders the price range and rejects non-integer or negative amounts", () => {
    expect(listingSchema.parse({ ...validListing, priceRange: { low: 3000, high: 1000 } }).priceRange).toEqual({ low: 1000, high: 3000 });
    expect(listingSchema.parse({ ...validListing, priceRange: null }).priceRange).toBeNull();
    expect(listingSchema.safeParse({ ...validListing, priceRange: { low: 10.5, high: 20 } }).success).toBe(false);
    expect(listingSchema.safeParse({ ...validListing, priceRange: { low: -1, high: 20 } }).success).toBe(false);
  });

  it("rejects unknown enums, missing fields and empty platform lists", () => {
    expect(listingSchema.safeParse({ ...validListing, condition: "comme_neuf" }).success).toBe(false);
    expect(listingSchema.safeParse({ ...validListing, brandConfidence: "sure" }).success).toBe(false);
    expect(listingSchema.safeParse({ ...validListing, platforms: [] }).success).toBe(false);
    expect(listingSchema.safeParse({ ...validListing, platforms: [{ platform: "amazon", reason: "x" }] }).success).toBe(false);
    const noTitle: Partial<typeof validListing> = { ...validListing };
    delete noTitle.title;
    expect(listingSchema.safeParse(noTitle).success).toBe(false);
  });

  it("sends a JSON schema that requires exactly the validated fields, without unsupported constraints", () => {
    expect([...LISTING_JSON_SCHEMA.required].sort()).toEqual(Object.keys(listingSchema.shape).sort());
    expect(Object.keys(LISTING_JSON_SCHEMA.properties).sort()).toEqual(Object.keys(listingSchema.shape).sort());
    const text = JSON.stringify(LISTING_JSON_SCHEMA);
    for (const unsupported of ["maxLength", "minLength", "maximum", "minimum", "maxItems"]) expect(text).not.toContain(unsupported);
    expect(LISTING_JSON_SCHEMA.additionalProperties).toBe(false);
  });
});

describe("listing request", () => {
  it("validates the shape: 1 to 3 images and a known language", () => {
    expect(listingRequest.safeParse({ images: [jpeg()], locale: "fr" }).success).toBe(true);
    expect(listingRequest.safeParse({ images: [], locale: "fr" }).success).toBe(false);
    expect(listingRequest.safeParse({ images: [jpeg(), jpeg(), jpeg(), jpeg()], locale: "fr" }).success).toBe(false);
    expect(listingRequest.safeParse({ images: [jpeg()], locale: "de" }).success).toBe(false);
  });

  it("sniffs the image type from magic bytes", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImage(new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]))).toBe("image/webp");
    expect(sniffImage(new Uint8Array([...Buffer.from("<svg xmlns")]))).toBeNull();
    expect(sniffImage(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull();
  });

  it("checks each image: count, decoded size, real type, base64", () => {
    const ok = checkImages([jpeg()]);
    expect(ok).toMatchObject({ ok: true, images: [{ mediaType: "image/jpeg", bytes: 64 }] });
    expect(checkImages([jpeg(), jpeg(), jpeg(), jpeg()])).toEqual({ ok: false, reason: "too_many" });
    expect(checkImages([jpeg(LISTING_LIMITS.maxImageBytes + 10)])).toEqual({ ok: false, reason: "too_large" });
    expect(checkImages([jpeg(LISTING_LIMITS.maxImageBytes)]).ok).toBe(true);
    expect(checkImages([Buffer.from("GIF89a fake image").toString("base64")])).toEqual({ ok: false, reason: "invalid" });
    expect(checkImages(["not base64!"])).toEqual({ ok: false, reason: "invalid" });
    // A file renamed to .jpg is still refused by its content.
    expect(checkImages([Buffer.from("%PDF-1.7 ...").toString("base64")])).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("monthly quota helpers", () => {
  it("keys usage by the first day of the UTC month", () => {
    expect(usagePeriod(new Date("2026-10-18T12:00:00Z"))).toBe("2026-10-01");
    expect(usagePeriod(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-01");
    expect(usagePeriod(new Date("2027-01-01T00:00:00Z"))).toBe("2027-01-01");
  });

  it("reads the cap from the environment with a safe default", () => {
    expect(parseMonthlyLimit(undefined)).toBe(DEFAULT_MONTHLY_LIMIT);
    expect(parseMonthlyLimit("")).toBe(50);
    expect(parseMonthlyLimit("20")).toBe(20);
    expect(parseMonthlyLimit("0")).toBe(0);
    expect(parseMonthlyLimit("-5")).toBe(50);
    expect(parseMonthlyLimit("abc")).toBe(50);
    expect(parseMonthlyLimit("99999")).toBe(50);
  });

  it("computes what is left, never below zero", () => {
    expect(remainingAnalyses(50, null)).toBe(50);
    expect(remainingAnalyses(50, 38)).toBe(12);
    expect(remainingAnalyses(50, 60)).toBe(0);
  });

  it("recognises a database without the migration", () => {
    for (const code of ["42P01", "PGRST205", "42703", "PGRST202"]) expect(isMissingObject(code)).toBe(true);
    for (const code of ["42501", "P0001", undefined, null]) expect(isMissingObject(code)).toBe(false);
  });
});

describe("prompts", () => {
  it("asks for honest listings in the requested language", () => {
    expect(systemPrompt("fr")).toMatch(/N'inventez jamais une marque, une taille ou une matière/);
    expect(systemPrompt("fr")).toMatch(/en français/);
    expect(systemPrompt("en")).toMatch(/Never invent a brand, size or material/);
    expect(systemPrompt("en")).toMatch(/defect/);
    expect(userPrompt("fr", { name: "Veste", price: "6,50", photos: 2 })).toContain("2 photos");
    expect(userPrompt("en", { name: "", price: "", photos: 1 })).not.toContain("Name typed");
  });
});
