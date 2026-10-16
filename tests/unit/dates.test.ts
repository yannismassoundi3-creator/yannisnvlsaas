import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  eachDay,
  formatRange,
  isValidDateString,
  localDateOf,
  presetRange,
  previousPeriod,
  rangeLength,
  rangeToUtcBounds,
  weekStart,
  zonedTimeToUtc,
} from "@/lib/dates";

describe("dates", () => {
  it("validates calendar dates", () => {
    expect(isValidDateString("2026-02-28")).toBe(true);
    expect(isValidDateString("2026-02-29")).toBe(false);
    expect(isValidDateString("2028-02-29")).toBe(true);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("26-01-01")).toBe(false);
  });

  it("does calendar arithmetic", () => {
    expect(addDays("2026-03-28", 5)).toBe("2026-04-02");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(rangeLength({ from: "2026-03-01", to: "2026-03-31" })).toBe(31);
    expect(eachDay({ from: "2026-03-30", to: "2026-04-02" })).toEqual(["2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02"]);
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday -> Monday
  });

  it("computes the previous equivalent period", () => {
    expect(previousPeriod({ from: "2026-09-01", to: "2026-09-30" })).toEqual({ from: "2026-08-02", to: "2026-08-31" });
    expect(previousPeriod({ from: "2026-03-01", to: "2026-03-01" })).toEqual({ from: "2026-02-28", to: "2026-02-28" });
  });

  it("converts between local time and UTC across DST", () => {
    // Paris: UTC+1 in winter, UTC+2 in summer.
    expect(zonedTimeToUtc("2026-01-15", "10:00:00", "Europe/Paris")).toBe("2026-01-15T09:00:00.000Z");
    expect(zonedTimeToUtc("2026-07-15", "10:00:00", "Europe/Paris")).toBe("2026-07-15T08:00:00.000Z");
    expect(localDateOf("2026-07-15T22:30:00Z", "Europe/Paris")).toBe("2026-07-16");
    expect(localDateOf("2026-07-15T22:30:00Z", "America/New_York")).toBe("2026-07-15");
    expect(rangeToUtcBounds({ from: "2026-03-29", to: "2026-03-29" }, "Europe/Paris")).toEqual({
      start: "2026-03-28T23:00:00.000Z",
      end: "2026-03-29T22:00:00.000Z", // the DST day has 23 hours
    });
  });

  it("resolves presets", () => {
    expect(presetRange("last_7", "2026-10-16")).toEqual({ from: "2026-10-10", to: "2026-10-16" });
    expect(presetRange("month_to_date", "2026-10-16")).toEqual({ from: "2026-10-01", to: "2026-10-16" });
    expect(presetRange("last_month", "2026-03-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(presetRange("quarter_to_date", "2026-11-05")).toEqual({ from: "2026-10-01", to: "2026-11-05" });
    expect(presetRange("year_to_date", "2026-10-16")).toEqual({ from: "2026-01-01", to: "2026-10-16" });
  });

  it("formats ranges", () => {
    expect(formatRange({ from: "2026-09-01", to: "2026-09-30" })).toBe("1 Sept – 30 Sept 2026");
    expect(formatRange({ from: "2025-12-28", to: "2026-01-03" })).toBe("28 Dec 2025 – 3 Jan 2026");
  });
});
