import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildMonthGrid,
  dayOf,
  describeRange,
  EMPTY_RANGE,
  fromIso,
  isRangeActive,
  isWithinRange,
  orderRange,
  RANGE_PRESETS,
  summariseByDay,
  toIso,
} from "./dateRange";

describe("toIso / fromIso", () => {
  it("formats a local date without shifting to UTC", () => {
    // 1 Jan 2026 00:30 local. toISOString() would report 2025-12-31 in any UTC+ zone.
    expect(toIso(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
  });

  it("pads single-digit months and days", () => {
    expect(toIso(new Date(2026, 7, 2))).toBe("2026-08-02");
  });

  it("round-trips through fromIso at local midnight", () => {
    const parsed = fromIso("2026-08-02");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7);
    expect(parsed.getDate()).toBe(2);
    expect(toIso(parsed)).toBe("2026-08-02");
  });
});

describe("dayOf", () => {
  it("reduces a timestamp to its local calendar day", () => {
    expect(dayOf(new Date(2026, 7, 2, 23, 59))).toBe("2026-08-02");
  });

  it.each([undefined, null, "", "not-a-date"])("returns empty for %s", (value) => {
    expect(dayOf(value as string)).toBe("");
  });
});

describe("isWithinRange", () => {
  const range = { from: "2026-08-01", to: "2026-08-31" };

  it("passes everything when no range is set", () => {
    expect(isWithinRange(new Date(1999, 0, 1), EMPTY_RANGE)).toBe(true);
    expect(isWithinRange(undefined, EMPTY_RANGE)).toBe(true);
  });

  it("includes both bounds", () => {
    expect(isWithinRange(new Date(2026, 7, 1, 0, 0), range)).toBe(true);
    expect(isWithinRange(new Date(2026, 7, 31, 23, 59), range)).toBe(true);
  });

  it("excludes the days either side", () => {
    expect(isWithinRange(new Date(2026, 6, 31, 23, 59), range)).toBe(false);
    expect(isWithinRange(new Date(2026, 8, 1, 0, 1), range)).toBe(false);
  });

  it("supports an open lower or upper bound", () => {
    expect(isWithinRange(new Date(2020, 0, 1), { from: "", to: "2026-08-31" })).toBe(true);
    expect(isWithinRange(new Date(2030, 0, 1), { from: "2026-08-01", to: "" })).toBe(true);
    expect(isWithinRange(new Date(2020, 0, 1), { from: "2026-08-01", to: "" })).toBe(false);
  });

  it("drops undated records once a range is active, rather than silently keeping them", () => {
    expect(isWithinRange(undefined, range)).toBe(false);
    expect(isWithinRange("garbage", range)).toBe(false);
  });

  it("treats a same-day range as exactly that day", () => {
    const single = { from: "2026-08-02", to: "2026-08-02" };
    expect(isWithinRange(new Date(2026, 7, 2, 12), single)).toBe(true);
    expect(isWithinRange(new Date(2026, 7, 3, 0, 0), single)).toBe(false);
  });
});

describe("orderRange", () => {
  it("keeps an already-ordered pair", () => {
    expect(orderRange("2026-08-01", "2026-08-05")).toEqual({ from: "2026-08-01", to: "2026-08-05" });
  });

  it("swaps when the user clicks the later day first", () => {
    expect(orderRange("2026-08-05", "2026-08-01")).toEqual({ from: "2026-08-01", to: "2026-08-05" });
  });
});

describe("isRangeActive", () => {
  it("is false only for a completely empty range", () => {
    expect(isRangeActive(EMPTY_RANGE)).toBe(false);
    expect(isRangeActive({ from: "2026-08-01", to: "" })).toBe(true);
    expect(isRangeActive({ from: "", to: "2026-08-01" })).toBe(true);
  });
});

describe("presets", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 2, 10, 0)); // Sun 2 Aug 2026, local
  });
  afterEach(() => vi.useRealTimers());

  it("Today is a single day", () => {
    expect(RANGE_PRESETS[0].build()).toEqual({ from: "2026-08-02", to: "2026-08-02" });
  });

  it("7 days covers today plus the previous six, not eight days", () => {
    expect(RANGE_PRESETS[1].build()).toEqual({ from: "2026-07-27", to: "2026-08-02" });
  });

  it("30 days spans a calendar month back", () => {
    expect(RANGE_PRESETS[2].build()).toEqual({ from: "2026-07-04", to: "2026-08-02" });
  });

  it("This month starts on the 1st and ends today, not at month end", () => {
    expect(RANGE_PRESETS[3].build()).toEqual({ from: "2026-08-01", to: "2026-08-02" });
  });
});

describe("describeRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 2, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("names the preset when the range matches one", () => {
    expect(describeRange({ from: "2026-08-02", to: "2026-08-02" })).toBe("Today");
    expect(describeRange({ from: "2026-07-27", to: "2026-08-02" })).toBe("7 days");
  });

  it("says All time when nothing is selected", () => {
    expect(describeRange(EMPTY_RANGE)).toBe("All time");
  });

  it("renders a custom span with an en dash", () => {
    expect(describeRange({ from: "2026-03-01", to: "2026-03-09" })).toContain("–");
  });

  it("renders a single custom day without a dash", () => {
    expect(describeRange({ from: "2026-03-04", to: "2026-03-04" })).not.toContain("–");
  });
});

describe("buildMonthGrid", () => {
  const today = new Date(2026, 7, 2);

  it("always returns six whole weeks so the grid never jumps height", () => {
    for (let m = 0; m < 12; m++) {
      expect(buildMonthGrid(new Date(2026, m, 1), today)).toHaveLength(42);
    }
  });

  it("starts on a Sunday", () => {
    const grid = buildMonthGrid(new Date(2026, 7, 1), today);
    expect(fromIso(grid[0].iso).getDay()).toBe(0);
  });

  it("pads with the neighbouring months and flags them as outside", () => {
    // 1 Aug 2026 is a Saturday, so the row starts on 26 July.
    const grid = buildMonthGrid(new Date(2026, 7, 1), today);
    expect(grid[0].iso).toBe("2026-07-26");
    expect(grid[0].inMonth).toBe(false);
    expect(grid.find((c) => c.iso === "2026-08-01")?.inMonth).toBe(true);
  });

  it("contains every day of the month exactly once", () => {
    const grid = buildMonthGrid(new Date(2026, 1, 1), today); // February
    const inMonth = grid.filter((c) => c.inMonth).map((c) => c.day);
    expect(inMonth).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
  });

  it("handles a leap February", () => {
    const grid = buildMonthGrid(new Date(2024, 1, 1), new Date(2024, 1, 10));
    expect(grid.filter((c) => c.inMonth)).toHaveLength(29);
  });

  it("marks exactly one cell as today, and only in its own month", () => {
    const grid = buildMonthGrid(new Date(2026, 7, 1), today);
    const todays = grid.filter((c) => c.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0].iso).toBe("2026-08-02");
  });

  it("marks no day as today when viewing a different month", () => {
    expect(buildMonthGrid(new Date(2026, 0, 1), today).some((c) => c.isToday)).toBe(false);
  });

  it("flags days after today as future, and today itself as not future", () => {
    const grid = buildMonthGrid(new Date(2026, 7, 1), today);
    expect(grid.find((c) => c.iso === "2026-08-02")?.isFuture).toBe(false);
    expect(grid.find((c) => c.iso === "2026-08-03")?.isFuture).toBe(true);
    expect(grid.find((c) => c.iso === "2026-08-01")?.isFuture).toBe(false);
  });

  it("crosses a year boundary correctly", () => {
    const grid = buildMonthGrid(new Date(2026, 11, 1), today);
    expect(grid.some((c) => c.iso.startsWith("2027-01"))).toBe(true);
    expect(grid.filter((c) => c.inMonth)).toHaveLength(31);
  });
});

describe("summariseByDay", () => {
  it("groups by local day and sums amounts", () => {
    const totals = summariseByDay([
      { date: new Date(2026, 7, 2, 9), amount: 10 },
      { date: new Date(2026, 7, 2, 21), amount: 5.5 },
      { date: new Date(2026, 7, 3, 9), amount: 2 },
    ]);
    expect(totals.get("2026-08-02")).toEqual({ count: 2, amount: 15.5 });
    expect(totals.get("2026-08-03")).toEqual({ count: 1, amount: 2 });
  });

  it("counts records with no amount", () => {
    const totals = summariseByDay([{ date: new Date(2026, 7, 2) }]);
    expect(totals.get("2026-08-02")).toEqual({ count: 1, amount: 0 });
  });

  it("skips undated records instead of bucketing them under today", () => {
    const totals = summariseByDay([{ date: null }, { date: "nonsense" }]);
    expect(totals.size).toBe(0);
  });
});
