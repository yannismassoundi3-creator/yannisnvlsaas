import { describe, expect, it } from "vitest";
import { rangeQuery, resolveRange } from "@/lib/analytics/range";

const TODAY = "2026-10-16";
const HISTORY = "2026-07-19";

describe("resolveRange", () => {
  it("defaults to the last 30 days", () => {
    expect(resolveRange({}, TODAY, HISTORY)).toEqual({
      range: { from: "2026-09-17", to: TODAY },
      preset: "last_30",
      clampedToHistory: false,
      historyStart: HISTORY,
    });
  });

  it("accepts presets and explicit dates", () => {
    expect(resolveRange({ range: "last_7" }, TODAY, HISTORY).range).toEqual({ from: "2026-10-10", to: TODAY });
    const custom = resolveRange({ from: "2026-09-01", to: "2026-09-30" }, TODAY, HISTORY);
    expect(custom.range).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(custom.preset).toBeNull();
  });

  it("falls back on invalid input", () => {
    expect(resolveRange({ range: "forever" }, TODAY, HISTORY).preset).toBe("last_30");
    expect(resolveRange({ from: "2026-02-30", to: "2026-03-01" }, TODAY, HISTORY).preset).toBe("last_30");
    expect(resolveRange({ from: "2026-09-30", to: "2026-09-01" }, TODAY, HISTORY).preset).toBe("last_30");
  });

  it("never reaches into the future", () => {
    expect(resolveRange({ from: "2026-10-01", to: "2026-12-31" }, TODAY, HISTORY).range).toEqual({ from: "2026-10-01", to: TODAY });
  });

  it("clamps to the plan's history window and says so", () => {
    const r = resolveRange({ range: "year_to_date" }, TODAY, HISTORY);
    expect(r.range).toEqual({ from: HISTORY, to: TODAY });
    expect(r.clampedToHistory).toBe(true);
  });

  it("builds a query string that reproduces the range", () => {
    expect(rangeQuery({ preset: "last_90", range: { from: "x", to: "y" } })).toBe("range=last_90");
    expect(rangeQuery({ preset: null, range: { from: "2026-09-01", to: "2026-09-30" } })).toBe("from=2026-09-01&to=2026-09-30");
  });
});
