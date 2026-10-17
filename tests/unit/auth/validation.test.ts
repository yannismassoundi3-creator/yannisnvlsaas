import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { onboardingMessages } from "@/i18n/messages/auth-onboarding";
import { authErrorMessage, isPasswordValid, passwordChecks } from "@/lib/auth/validation";
import { displayStore, type Store } from "@/lib/auth/workspace";
import { currencyLabel, timezoneLabel } from "@/lib/locale-lists";
import { platformName, PLATFORMS } from "@/lib/onboarding/constants";

describe("passwordChecks", () => {
  it("keeps the English rules by default", () => {
    expect(passwordChecks("abc").map((c) => c.label)).toEqual(["At least 10 characters", "At least one letter", "At least one number"]);
    expect(isPasswordValid("margins2026ok")).toBe(true);
  });

  it("translates the rules into French without changing the checks", () => {
    const fr = passwordChecks("margins2026ok", "fr");
    expect(fr.map((c) => c.label)).toEqual(["Au moins 10 caractères", "Au moins une lettre", "Au moins un chiffre"]);
    expect(fr.every((c) => c.ok)).toBe(true);
  });
});

describe("authErrorMessage", () => {
  it("maps Supabase errors in English by default", () => {
    expect(authErrorMessage({ code: "invalid_credentials" })).toBe("Email or password is incorrect.");
    expect(authErrorMessage({ status: 429 })).toBe("Too many attempts. Please wait a few minutes and try again.");
    expect(authErrorMessage(null)).toBe("Something went wrong. Please try again.");
    expect(authErrorMessage({ code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 26 seconds." }, "fr")).toBe(
      "Un e-mail vient d'être envoyé. Vous pourrez en demander un autre dans 26 secondes.",
    );
    expect(authErrorMessage({ code: "over_email_send_rate_limit", message: "Email rate limit exceeded" })).toBe("Too many attempts. Please wait a few minutes and try again.");
  });

  it("maps Supabase errors in French", () => {
    expect(authErrorMessage({ code: "invalid_credentials" }, "fr")).toBe("E-mail ou mot de passe incorrect.");
    expect(authErrorMessage({ code: "email_not_confirmed" }, "fr")).toMatch(/^Veuillez d'abord confirmer votre adresse e-mail/);
    expect(authErrorMessage({ code: "over_request_rate_limit" }, "fr")).toBe("Trop de tentatives. Patientez quelques minutes, puis réessayez.");
    expect(authErrorMessage({ status: 429 }, "fr")).toBe("Trop de tentatives. Patientez quelques minutes, puis réessayez.");
    expect(authErrorMessage(undefined, "fr")).toBe("Une erreur est survenue. Veuillez réessayer.");
  });
});

describe("onboarding option labels", () => {
  it("translates only the non-brand platform name", () => {
    expect(platformName("shopify", "fr")).toBe("Shopify");
    expect(platformName("other")).toBe("Other or custom");
    expect(platformName("other", "fr")).toBe("Autre ou sur mesure");
  });

  it("offers the resale marketplaces, under their brand names in both languages", () => {
    expect(PLATFORMS).toEqual(expect.arrayContaining(["vinted", "leboncoin", "ebay", "vestiaire_collective"]));
    expect(PLATFORMS.at(-1)).toBe("other");
    for (const locale of ["en", "fr"] as const) {
      expect(platformName("vinted", locale)).toBe("Vinted");
      expect(platformName("leboncoin", locale)).toBe("Leboncoin");
      expect(platformName("ebay", locale)).toBe("eBay");
      expect(platformName("vestiaire_collective", locale)).toBe("Vestiaire Collective");
    }
  });

  it("lists exactly the platforms the database accepts", () => {
    const dir = path.join(process.cwd(), "supabase", "migrations");
    const latest = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(path.join(dir, f), "utf8"))
      .filter((sql) => /stores_platform_check|platform text not null default 'other'/.test(sql))
      .at(-1)!;
    const list = /check \(platform in \(([^)]*)\)/.exec(latest.slice(latest.search(/stores_platform_check|platform text not null default 'other'/)))![1];
    expect([...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual([...PLATFORMS].sort());
  });

  it("names currencies in the interface language", () => {
    expect(currencyLabel("EUR")).toBe("EUR — Euro");
    expect(currencyLabel("EUR", "fr")).toBe("EUR — euro");
  });

  it("keeps the time zone identifier and adds its localized name", () => {
    expect(timezoneLabel("America/New_York")).toBe("America/New York (Eastern Time)");
    expect(timezoneLabel("America/New_York", "fr")).toMatch(/^America\/New York \(heure de l.Est/);
    expect(timezoneLabel("UTC")).toBe("UTC");
    expect(timezoneLabel("Not/AZone", "fr")).toBe("Not/AZone");
  });
});

describe("sample store name", () => {
  const store = (name: string, isDemo: boolean) => ({ id: "s1", name, is_demo: isDemo }) as Store;

  it("shows the default sample-store name in the interface language", () => {
    const { en, fr } = { en: onboardingMessages.en.actions.sampleStoreName, fr: onboardingMessages.fr.actions.sampleStoreName };
    expect(displayStore(store("Sample store", true), "fr").name).toBe(fr);
    expect(displayStore(store("Boutique exemple", true), "en").name).toBe(en);
    expect(displayStore(store(fr, true), "fr").name).toBe(fr);
    expect(displayStore(store(en, true), "fr").name).toBe(fr);
  });

  it("leaves real stores and renamed sample stores alone", () => {
    expect(displayStore(store("Sample store", false), "fr").name).toBe("Sample store");
    expect(displayStore(store("Ma boutique test", true), "en").name).toBe("Ma boutique test");
  });
});
