import { describe, expect, it } from "vitest";
import { detectDecimalSeparator, divideRoundHalfAwayFromZero, parseDecimal, rescale } from "@/lib/finance/decimal";

function ok(input: string, sep: "." | "," = ".") {
  const r = parseDecimal(input, sep);
  if (!r.ok) throw new Error(`expected ${input} to parse, got ${r.error}`);
  return r.value;
}

describe("parseDecimal", () => {
  it.each([
    ["0", 0n, 0],
    ["12", 12n, 0],
    ["12.5", 125n, 1],
    ["12.50", 1250n, 2],
    ["0.045", 45n, 3],
    [".5", 5n, 1],
    ["12.", 12n, 0],
    ["1,234.56", 123456n, 2],
    ["1,234,567.89", 123456789n, 2],
    ["+3", 3n, 0],
    ["-12.5", -125n, 1],
    ["−12.5", -125n, 1],
    ["(12.50)", -1250n, 2],
    ["12.50-", -1250n, 2],
    ["€12.50", 1250n, 2],
    ["-€12.50", -1250n, 2],
    ["12.50 EUR", 1250n, 2],
    ["USD 1,000", 1000n, 0],
    ["  7.25  ", 725n, 2],
    ["000123.40", 12340n, 2],
  ])("parses %s with dot decimals", (input, value, scale) => {
    expect(ok(input)).toEqual({ value, scale });
  });

  it.each([
    ["1.234,56", 123456n, 2],
    ["1 234,56", 123456n, 2],
    ["1 234,56", 123456n, 2],
    ["1 234,56", 123456n, 2],
    ["12,5", 125n, 1],
    ["0,045", 45n, 3],
    ["12,50 €", 1250n, 2],
    ["-1.000", -1000n, 0],
  ])("parses %s with comma decimals", (input, value, scale) => {
    expect(ok(input, ",")).toEqual({ value, scale });
  });

  it("treats negative zero as zero", () => {
    expect(ok("-0.00")).toEqual({ value: 0n, scale: 2 });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["abc", "invalid_format"],
    ["TBD", "invalid_format"],
    ["N/A", "invalid_format"],
    ["12.3.4", "invalid_format"],
    ["12,34.5", "invalid_format"],
    ["1,23", "invalid_format"],
    ["--5", "multiple_signs"],
    ["(-5)", "multiple_signs"],
    ["5-5", "invalid_format"],
    ["1e5", "scientific_notation"],
    ["1.2E+05", "scientific_notation"],
    ["€", "invalid_format"],
    ["XYZ 12", "invalid_format"],
    ["=1+2", "invalid_format"],
  ])("rejects %j", (input, error) => {
    const r = parseDecimal(input, ".");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(error);
  });

  it("does not accept a thousands separator in the fraction", () => {
    expect(parseDecimal("1,234.5,6", ".").ok).toBe(false);
  });
});

describe("rescale", () => {
  it("pads when increasing scale", () => {
    expect(rescale({ value: 125n, scale: 1 }, 2)).toEqual({ value: 1250n, rounded: false });
  });
  it("rounds half away from zero when reducing scale", () => {
    expect(rescale({ value: 12345n, scale: 3 }, 2)).toEqual({ value: 1235n, rounded: true });
    expect(rescale({ value: -12345n, scale: 3 }, 2)).toEqual({ value: -1235n, rounded: true });
    expect(rescale({ value: 12344n, scale: 3 }, 2)).toEqual({ value: 1234n, rounded: true });
    expect(rescale({ value: 12340n, scale: 3 }, 2)).toEqual({ value: 1234n, rounded: false });
  });
});

describe("divideRoundHalfAwayFromZero", () => {
  it.each([
    [5n, 2n, 3n],
    [-5n, 2n, -3n],
    [5n, -2n, -3n],
    [4n, 3n, 1n],
    [-4n, 3n, -1n],
    [0n, 7n, 0n],
  ])("%d / %d = %d", (n, d, expected) => {
    expect(divideRoundHalfAwayFromZero(n, d)).toBe(expected);
  });
  it("throws on division by zero", () => {
    expect(() => divideRoundHalfAwayFromZero(1n, 0n)).toThrow(RangeError);
  });
});

describe("detectDecimalSeparator", () => {
  it("detects comma decimals", () => {
    expect(detectDecimalSeparator(["12,50", "1.234,56", "3,1"])).toBe(",");
  });
  it("detects dot decimals", () => {
    expect(detectDecimalSeparator(["12.50", "1,234.56", "3.1"])).toBe(".");
  });
  it("defaults to dot when ambiguous", () => {
    expect(detectDecimalSeparator(["1,234", "12"])).toBe(".");
  });
});
