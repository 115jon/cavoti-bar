import { describe, expect, it } from "vitest";
import {
  date,
  dateRangeOptions,
  dateRangeForPreset,
  defaultUsageFilterState,
  money,
  planVariant,
  tokens,
} from "./formatters";

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
    expect(dateRangeForPreset("last-24-hours", now)).toEqual({
      startDate: "2026-07-23",
      endDate: "2026-07-24",
    });
    expect(dateRangeForPreset("last-7-days", now)).toEqual({
      startDate: "2026-07-18",
      endDate: "2026-07-24",
    });
    expect(dateRangeForPreset("last-14-days", now)).toEqual({
      startDate: "2026-07-11",
      endDate: "2026-07-24",
    });
    expect(dateRangeForPreset("last-30-days", now)).toEqual({
      startDate: "2026-06-25",
      endDate: "2026-07-24",
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

  it("starts Usage on the website's seven-day default", () => {
    const state = defaultUsageFilterState(new Date(2026, 6, 24, 15, 30));
    expect(state.startDate).toBe("2026-07-18");
    expect(state.endDate).toBe("2026-07-24");
  });

  it("orders quick ranges from the smallest current window outward", () => {
    expect(dateRangeOptions.map((option) => option.label)).toEqual([
      "Today",
      "Yesterday",
      "Last 24 hours",
      "Last 7 days",
      "Last 14 days",
      "Last 30 days",
      "This month",
      "Last month",
    ]);
  });
});

describe("money", () => {
  it("keeps sub-cent usage costs visible", () => {
    expect(money(0.000123)).toBe("$0.000123");
    expect(money(0)).toBe("$0.00");
  });
});

describe("tokens", () => {
  it("keeps two meaningful decimal places for dashboard totals", () => {
    expect(tokens(26_542_916)).toBe("26.54M");
  });
});

describe("display state formatters", () => {
  it("uses a safe fallback for invalid dates", () => {
    expect(date("not-a-date")).toBe("Not provided");
  });

  it("does not present unknown plan states as healthy", () => {
    expect(planVariant("unknown", "available")).toBe("outline");
    expect(planVariant("active", "available")).toBe("success");
    expect(planVariant("active", "limited")).toBe("warning");
  });
});
