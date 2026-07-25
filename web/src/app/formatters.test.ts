import { describe, expect, it } from "vitest";
import { dateRangeForPreset, money } from "./formatters";

describe("dateRangeForPreset", () => {
  const now = new Date(2026, 6, 24, 15, 30);

  it("resolves the quick date ranges against local calendar days", () => {
    expect(dateRangeForPreset("today", now)).toEqual({
      startDate: "2026-07-24",
      endDate: "2026-07-24",
    });
    expect(dateRangeForPreset("yesterday", now)).toEqual({
      startDate: "2026-07-23",
      endDate: "2026-07-23",
    });
    expect(dateRangeForPreset("this-week", now)).toEqual({
      startDate: "2026-07-20",
      endDate: "2026-07-24",
    });
    expect(dateRangeForPreset("last-week", now)).toEqual({
      startDate: "2026-07-13",
      endDate: "2026-07-19",
    });
    expect(dateRangeForPreset("this-month", now)).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-24",
    });
    expect(dateRangeForPreset("last-month", now)).toEqual({
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });
  });
});

describe("money", () => {
  it("keeps sub-cent usage costs visible", () => {
    expect(money(0.000123)).toBe("$0.000123");
    expect(money(0)).toBe("$0.00");
  });
});
