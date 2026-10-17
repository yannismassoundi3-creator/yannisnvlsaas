import { describe, expect, it } from "vitest";
import { niceScale } from "@/lib/analytics/ticks";

describe("niceScale", () => {
  it("uses round steps that include zero", () => {
    expect(niceScale(0, 1730, 5)).toEqual({ domain: [0, 2000], ticks: [0, 500, 1000, 1500, 2000] });
    expect(niceScale(-120, 480, 6).ticks).toContain(0);
  });

  it("returns a single zero tick when every value is zero", () => {
    expect(niceScale(0, 0, 5)).toEqual({ domain: [0, 1], ticks: [0] });
  });

  it("never produces fractional ticks for small integer values", () => {
    const { ticks } = niceScale(0, 3, 5);
    expect(ticks.every(Number.isInteger)).toBe(true);
  });
});
