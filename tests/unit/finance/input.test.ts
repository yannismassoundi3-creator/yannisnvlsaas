import { describe, expect, it } from "vitest";
import { bpsToInputValue, parseUserAmount, parseUserInteger, parseUserPercentToBps, parseUserUnitCost } from "@/lib/finance/input";

describe("form input parsing", () => {
  it("accepts both decimal conventions", () => {
    expect(parseUserAmount("1,234.50", "EUR")).toEqual({ ok: true, value: 123450 });
    expect(parseUserAmount("1.234,50", "EUR")).toEqual({ ok: true, value: 123450 });
    expect(parseUserAmount("1 234,50", "EUR")).toEqual({ ok: true, value: 123450 });
    expect(parseUserAmount("12,5", "EUR")).toEqual({ ok: true, value: 1250 });
    expect(parseUserAmount("12.5", "EUR")).toEqual({ ok: true, value: 1250 });
    expect(parseUserAmount("1999", "JPY")).toEqual({ ok: true, value: 1999 });
  });

  it("handles optional and invalid values", () => {
    expect(parseUserAmount("", "EUR", { optional: true })).toEqual({ ok: true, value: null });
    expect(parseUserAmount("", "EUR")).toEqual({ ok: false, message: "Enter a value." });
    expect(parseUserAmount("abc", "EUR").ok).toBe(false);
    expect(parseUserAmount("-3", "EUR")).toEqual({ ok: false, message: "Enter zero or a positive value." });
  });

  it("parses unit costs with sub-cent precision", () => {
    expect(parseUserUnitCost("0,045")).toEqual({ ok: true, value: 450 });
    expect(parseUserUnitCost("", { optional: true })).toEqual({ ok: true, value: null });
  });

  it("parses percentages to basis points", () => {
    expect(parseUserPercentToBps("2.9")).toEqual({ ok: true, value: 290 });
    expect(parseUserPercentToBps("2,9 %")).toEqual({ ok: true, value: 290 });
    expect(parseUserPercentToBps("100")).toEqual({ ok: true, value: 10_000 });
    expect(parseUserPercentToBps("0.125")).toEqual({ ok: true, value: 13 });
    expect(parseUserPercentToBps("101").ok).toBe(false);
    expect(parseUserPercentToBps("-1").ok).toBe(false);
    expect(parseUserPercentToBps("", { optional: true })).toEqual({ ok: true, value: null });
  });

  it("parses whole numbers with grouping", () => {
    expect(parseUserInteger("1,200")).toEqual({ ok: true, value: 1200 });
    expect(parseUserInteger("1 200")).toEqual({ ok: true, value: 1200 });
    expect(parseUserInteger("12")).toEqual({ ok: true, value: 12 });
    expect(parseUserInteger("1.5").ok).toBe(false);
    expect(parseUserInteger("0", { min: 1 }).ok).toBe(false);
  });

  it("returns validation messages in French when asked", () => {
    expect(parseUserAmount("", "EUR", { locale: "fr" })).toEqual({ ok: false, message: "Saisissez une valeur." });
    expect(parseUserAmount("-3", "EUR", { locale: "fr" })).toEqual({ ok: false, message: "Saisissez zéro ou une valeur positive." });
    expect(parseUserUnitCost("abc", { locale: "fr" })).toEqual({ ok: false, message: "Saisissez un nombre, par exemple 12,50." });
    expect(parseUserPercentToBps("101", { locale: "fr" })).toEqual({ ok: false, message: "Saisissez un pourcentage entre 0 et 100." });
    expect(parseUserInteger("1.5", { locale: "fr" })).toEqual({ ok: false, message: "Saisissez un nombre entier." });
    expect(parseUserInteger("0", { min: 1, locale: "fr" })).toEqual({ ok: false, message: "Saisissez 1 ou plus." });
    expect(parseUserInteger("2000000", { max: 1_000_000, locale: "fr" })).toEqual({ ok: false, message: `Saisissez ${(1_000_000).toLocaleString("fr-FR")} ou moins.` });
    expect(parseUserInteger("2000000", { max: 1_000_000 })).toEqual({ ok: false, message: "Enter 1,000,000 or less." });
    expect(parseUserUnitCost("abc")).toEqual({ ok: false, message: "Enter a number, for example 12.50." });
  });

    it("formats basis points for editing", () => {
    expect(bpsToInputValue(290)).toBe("2.9");
    expect(bpsToInputValue(150)).toBe("1.5");
    expect(bpsToInputValue(1000)).toBe("10");
    expect(bpsToInputValue(1)).toBe("0.01");
  });
});
