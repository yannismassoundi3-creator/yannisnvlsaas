import { describe, expect, it } from "vitest";
import { currencyDigits, isValidCurrency } from "@/lib/finance/currency";
import {
  allocateProportionally,
  applyBasisPoints,
  e4ToInputValue,
  e4ToMinor,
  formatMoney,
  formatUnitCost,
  lineCostMinor,
  minorToDecimalString,
  minorToE4,
  mulDivRound,
  parseAmountToMinor,
  parseUnitCostToE4,
  sumMinor,
} from "@/lib/finance/money";

describe("currency metadata", () => {
  it.each([
    ["EUR", 2],
    ["USD", 2],
    ["GBP", 2],
    ["JPY", 0],
    ["KRW", 0],
    ["KWD", 3],
    ["BHD", 3],
    ["CHF", 2],
  ])("%s has %d minor digits", (code, digits) => {
    expect(currencyDigits(code)).toBe(digits);
  });

  it("rejects unknown or malformed codes", () => {
    expect(isValidCurrency("EUR")).toBe(true);
    expect(isValidCurrency("eur")).toBe(false);
    expect(isValidCurrency("XXQ")).toBe(false);
    expect(isValidCurrency("EURO")).toBe(false);
    expect(() => currencyDigits("ABC")).toThrow(RangeError);
  });
});

describe("parseAmountToMinor", () => {
  it("parses into minor units per currency", () => {
    expect(parseAmountToMinor("19.99", "EUR")).toEqual({ ok: true, value: 1999, rounded: false });
    expect(parseAmountToMinor("1999", "JPY")).toEqual({ ok: true, value: 1999, rounded: false });
    expect(parseAmountToMinor("1.234", "KWD")).toEqual({ ok: true, value: 1234, rounded: false });
    expect(parseAmountToMinor("1.234,56", "EUR", { decimalSeparator: "," })).toEqual({ ok: true, value: 123456, rounded: false });
  });

  it("rounds extra decimals half away from zero and reports it", () => {
    expect(parseAmountToMinor("0.125", "EUR")).toEqual({ ok: true, value: 13, rounded: true });
    expect(parseAmountToMinor("1999.5", "JPY")).toEqual({ ok: true, value: 2000, rounded: true });
    expect(parseAmountToMinor("-0.125", "EUR", { allowNegative: true })).toEqual({ ok: true, value: -13, rounded: true });
  });

  it("rejects negatives unless allowed", () => {
    expect(parseAmountToMinor("-5", "EUR")).toEqual({ ok: false, error: "negative_not_allowed" });
    expect(parseAmountToMinor("(5.00)", "EUR", { allowNegative: true })).toEqual({ ok: true, value: -500, rounded: false });
  });

  it("rejects absurdly large values", () => {
    expect(parseAmountToMinor("100000000000", "EUR")).toEqual({ ok: false, error: "too_large" });
  });

  it("returns parse errors", () => {
    expect(parseAmountToMinor("", "EUR")).toEqual({ ok: false, error: "empty" });
    expect(parseAmountToMinor("twelve", "EUR")).toEqual({ ok: false, error: "invalid_format" });
  });
});

describe("unit costs (e4)", () => {
  it("keeps sub-cent precision", () => {
    expect(parseUnitCostToE4("0.045")).toEqual({ ok: true, value: 450, rounded: false });
    expect(parseUnitCostToE4("12.3456")).toEqual({ ok: true, value: 123456, rounded: false });
    expect(parseUnitCostToE4("0,00005", { decimalSeparator: "," })).toEqual({ ok: true, value: 1, rounded: true });
  });

  it("never accepts negative costs", () => {
    expect(parseUnitCostToE4("-1")).toEqual({ ok: false, error: "negative_not_allowed" });
  });

  it("computes line costs exactly, even for large quantities", () => {
    // 0.045 x 1000 = 45.00
    expect(lineCostMinor(450, 1000, "EUR")).toBe(4500);
    // 0.125 x 3 = 0.375 -> 0.38 (half away from zero)
    expect(lineCostMinor(1250, 3, "EUR")).toBe(38);
    // 12.3456 x 999,999 = 12,345,587.6544 -> 1,234,558,765 cents
    expect(lineCostMinor(123456, 999_999, "EUR")).toBe(1_234_558_765);
    // JPY has no minor unit: 123.5 yen x 3 = 370.5 -> 371
    expect(lineCostMinor(1_235_000, 3, "JPY")).toBe(371);
    // KWD has three: 1.2345 x 2 = 2.469
    expect(lineCostMinor(12345, 2, "KWD")).toBe(2469);
    expect(lineCostMinor(0, 10, "EUR")).toBe(0);
    expect(lineCostMinor(999, 0, "EUR")).toBe(0);
  });

  it("converts between minor units and e4", () => {
    expect(minorToE4(1234, "EUR")).toBe(123400);
    expect(minorToE4(1234, "JPY")).toBe(12340000);
    expect(e4ToMinor(123450, "EUR")).toBe(1235);
    expect(e4ToMinor(123449, "EUR")).toBe(1234);
  });

  it("formats input values without noise", () => {
    expect(e4ToInputValue(450)).toBe("0.045");
    expect(e4ToInputValue(120000)).toBe("12.00");
    expect(e4ToInputValue(123456)).toBe("12.3456");
  });
});

describe("arithmetic helpers", () => {
  it("applies basis points with half-away-from-zero rounding", () => {
    expect(applyBasisPoints(10_000, 290)).toBe(290);
    expect(applyBasisPoints(1_999, 290)).toBe(58); // 57.971
    expect(applyBasisPoints(50, 100)).toBe(1); // 0.5 -> 1
    expect(applyBasisPoints(-50, 100)).toBe(-1);
    expect(applyBasisPoints(0, 290)).toBe(0);
  });

  it("mulDivRound avoids float error", () => {
    // 0.1 + 0.2 style traps never apply: integers only.
    expect(mulDivRound(1, 1, 3)).toBe(0);
    expect(mulDivRound(2, 1, 3)).toBe(1);
    expect(mulDivRound(1_000_000_007, 3, 7)).toBe(428_571_432);
  });

  it("sums safely and refuses unsafe integers", () => {
    expect(sumMinor([1, 2, 3])).toBe(6);
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
    expect(() => sumMinor([0.5])).toThrow(RangeError);
  });
});

describe("allocateProportionally", () => {
  it("splits a total exactly", () => {
    expect(allocateProportionally(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateProportionally(1000, [2000, 3000, 5000])).toEqual([200, 300, 500]);
    expect(allocateProportionally(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });

  it("always sums to the total", () => {
    const weights = [1999, 4550, 1, 12_000, 333];
    for (const total of [0, 1, 7, 99, 1234, 98765, -321]) {
      const parts = allocateProportionally(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it("gives remainders to the largest fractional parts, ties to the first", () => {
    expect(allocateProportionally(10, [1, 2])).toEqual([3, 7]); // 3.33 / 6.67
    expect(allocateProportionally(1, [1, 1])).toEqual([1, 0]);
  });

  it("handles zero weights", () => {
    expect(allocateProportionally(10, [0, 0])).toEqual([5, 5]);
    expect(allocateProportionally(10, [0, 5])).toEqual([0, 10]);
    expect(allocateProportionally(0, [])).toEqual([]);
    expect(() => allocateProportionally(5, [])).toThrow(RangeError);
    expect(() => allocateProportionally(5, [-1, 2])).toThrow(RangeError);
  });
});

describe("formatting", () => {
  it("formats from exact decimal strings", () => {
    expect(minorToDecimalString(123456, "EUR")).toBe("1234.56");
    expect(minorToDecimalString(-5, "EUR")).toBe("-0.05");
    expect(minorToDecimalString(1999, "JPY")).toBe("1999");
    expect(minorToDecimalString(1, "KWD")).toBe("0.001");
  });

  it("formats money per currency", () => {
    expect(formatMoney(123456, "EUR")).toBe("€1,234.56");
    expect(formatMoney(-123456, "EUR")).toBe("-€1,234.56");
    expect(formatMoney(1999, "JPY")).toBe("¥1,999");
    expect(formatMoney(1234, "KWD", { currencyDisplay: "code" })).toBe("KWD\u00a01.234");
    expect(formatMoney(150, "EUR", { signDisplay: "always" })).toBe("+€1.50");
    expect(formatMoney(1_234_500, "EUR", { compact: true })).toBe("€12.3K");
    expect(formatMoney(123456, "EUR", { wholeUnits: true })).toBe("€1,235");
  });

  it("formats large values without precision loss", () => {
    expect(formatMoney(900_719_925_474_099, "EUR")).toBe("€9,007,199,254,740.99");
  });

  it("formats unit costs with up to four decimals", () => {
    expect(formatUnitCost(450, "EUR")).toBe("€0.045");
    expect(formatUnitCost(120000, "EUR")).toBe("€12.00");
    expect(formatUnitCost(1_235_000, "JPY")).toBe("¥123.5");
  });
});
