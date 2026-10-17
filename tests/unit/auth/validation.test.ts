import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { onboardingMessages } from "@/i18n/messages/auth-onboarding";
import { authErrorMessage, isPasswordValid, passwordChecks } from "@/lib/auth/validation";
import { displayStore, type Store } from "@/lib/auth/workspace";
import { currencyLabel, timezoneLabel, timezoneOptions, utcOffsetLabel } from "@/lib/locale-lists";
import { platformName, PLATFORMS, pricesIncludeTaxFor, TAX_CHOICES } from "@/lib/onboarding/constants";

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
  it("offers a no-VAT answer that stores prices as collected (flag off, like tax added on top)", () => {
    expect(TAX_CHOICES).toEqual(["yes", "no", "none"]);
    expect(pricesIncludeTaxFor("yes")).toBe(true);
    expect(pricesIncludeTaxFor("no")).toBe(false);
    expect(pricesIncludeTaxFor("none")).toBe(false);
  });

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

  it("accepts exactly the same platforms as sales channels of reseller sales", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "20261017110000_reseller_mode.sql"), "utf8");
    const list = /check \(sales_channel is null or sales_channel in \(([^)]*)\)/.exec(sql)![1];
    expect([...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual([...PLATFORMS].sort());
  });

  it("names currencies in the interface language", () => {
    expect(currencyLabel("EUR")).toBe("EUR — Euro");
    expect(currencyLabel("EUR", "fr")).toBe("EUR — euro");
  });

  it("labels time zones with the identifier and UTC offset only", () => {
    const winter = new Date("2026-01-15T12:00:00Z");
    const summer = new Date("2026-07-15T12:00:00Z");
    expect(timezoneLabel("America/New_York", { at: winter })).toBe("America/New York (UTC−05:00)");
    expect(timezoneLabel("Europe/Paris", { at: summer })).toBe("Europe/Paris (UTC+02:00)");
    expect(timezoneLabel("Asia/Kolkata", { at: summer })).toBe("Asia/Kolkata (UTC+05:30)");
    expect(timezoneLabel("Africa/Abidjan", { at: summer })).toBe("Africa/Abidjan (UTC)");
    expect(timezoneLabel("UTC")).toBe("UTC");
    expect(timezoneLabel("Europe/Paris", { offset: false })).toBe("Europe/Paris");
    expect(timezoneLabel("Not/AZone")).toBe("Not/AZone");
  });

  it("never uses localized zone names, which differ between ICU versions", () => {
    // Node and browsers named this zone "Scoresbysund" or "Ittoqqortoormiit", breaking hydration.
    expect(timezoneLabel("America/Scoresbysund", { at: new Date("2026-01-15T12:00:00Z") })).toMatch(/^America\/Scoresbysund \(UTC−0[12]:00\)$/);
    expect(utcOffsetLabel("Not/AZone")).toBeNull();
  });

  it("lists time zones with UTC first, then alphabetically", () => {
    const list = timezoneOptions(["Europe/Paris"]);
    expect(list[0]).toBe("UTC");
    expect(list).toContain("Europe/Paris");
    expect(new Set(list).size).toBe(list.length);
    expect(list.slice(1)).toEqual([...list.slice(1)].sort((a, b) => a.localeCompare(b, "en")));
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
