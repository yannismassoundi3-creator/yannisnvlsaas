import { describe, expect, it } from "vitest";
import { PLANS, planCopy } from "@/config/plans";
import { processorsFor, site, siteCopy } from "@/config/site";
import { marketingCommon, publicAlternates } from "@/i18n/messages/marketing-common";
import { marketingPages } from "@/i18n/messages/marketing-pages";

describe("planCopy", () => {
  it("returns the existing English fields unchanged", () => {
    expect(planCopy("pro")).toEqual({ name: PLANS.pro.name, description: PLANS.pro.description, highlights: PLANS.pro.highlights });
    expect(planCopy("trial", "en").highlights).toContain("CSV imports up to 5,000 rows per file");
  });

  it("translates descriptions and highlights to French with French number formatting", () => {
    const trial = planCopy("trial", "fr");
    expect(trial.name).toBe("Essai gratuit");
    expect(trial.description).toMatch(/^14 jours/);
    expect(trial.highlights).toHaveLength(PLANS.trial.highlights.length);
    expect(trial.highlights.some((h) => /5\s000 lignes par fichier/.test(h))).toBe(true);
    const pro = planCopy("pro", "fr");
    expect(pro.name).toBe("Pro");
    expect(pro.highlights).toHaveLength(PLANS.pro.highlights.length);
    expect(pro.highlights.some((h) => /100\s000 lignes/.test(h))).toBe(true);
  });
});

describe("site copy", () => {
  it("keeps English and provides French tagline and description", () => {
    expect(siteCopy("en")).toEqual({ tagline: site.tagline, description: site.description });
    expect(siteCopy("fr").tagline).toBe("Comprenez vos vraies marges. Prenez de meilleures décisions.");
  });

  it("localizes processor purposes but keeps provider names", () => {
    const en = processorsFor("en");
    const fr = processorsFor("fr");
    expect(en.map((p) => p.purpose)).toEqual(site.processors.map((p) => p.purpose));
    expect(fr.map((p) => p.name)).toEqual(en.map((p) => p.name));
    expect(fr.find((p) => p.id === "payments")?.location).toBe("Union européenne et États-Unis");
  });
});

describe("marketing messages", () => {
  it("builds language alternates for public pages", () => {
    expect(publicAlternates("/pricing", "fr")).toMatchObject({ canonical: "/fr/pricing", languages: { en: "/pricing", fr: "/fr/pricing" } });
    expect(publicAlternates("/", "en")).toMatchObject({ canonical: "/", languages: { en: "/", fr: "/fr" } });
  });

  it("labels demo data in both languages and formats history periods", () => {
    expect(marketingCommon.en.demo.badge).toBe("Demo data");
    expect(marketingCommon.fr.demo.badge).toBe("Données de démonstration");
    expect(marketingPages.en.pricing.history(3 * 366)).toBe("Last 3 years");
    expect(marketingPages.fr.pricing.history(90)).toBe("90 derniers jours");
  });
});
