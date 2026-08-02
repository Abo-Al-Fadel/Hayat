// src/utils/dateRange.ts
//
// Pure date-range helpers shared by the order/invoice calendar.
//
// Everything here works in LOCAL time on purpose. Orders carry UTC timestamps,
// but "today" has to mean the user's today: in UTC+3 an order placed at 01:00
// local is 22:00 the previous day in UTC, and a UTC-based filter would drop it
// out of "Today". We compare calendar days (yyyy-mm-dd) rather than instants.

export interface DateRange {
  /** Inclusive start (yyyy-mm-dd), or "" for no lower bound. */
  from: string;
  /** Inclusive end (yyyy-mm-dd), or "" for no upper bound. */
  to: string;
}

export const EMPTY_RANGE: DateRange = { from: "", to: "" };

/** Local yyyy-mm-dd for a Date. Never use toISOString() here - that shifts to UTC. */
export function toIso(d: Date): string {
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Parses yyyy-mm-dd as a LOCAL midnight Date. `new Date("2026-08-02")` would parse as UTC. */
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Local yyyy-mm-dd for today. */
export const todayIso = (): string => toIso(new Date());

export function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return toIso(d);
}

/** Converts any order timestamp to a local calendar day, or "" if unparseable. */
export function dayOf(value: string | Date | undefined | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : toIso(date);
}

/**
 * True when `value` falls inside the range. Both bounds are inclusive; an empty
 * bound means unbounded. A missing/invalid date only passes when no range is set.
 */
export function isWithinRange(value: string | Date | undefined | null, range: DateRange): boolean {
  if (!range.from && !range.to) return true;

  const day = dayOf(value);
  if (!day) return false;
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

export const isRangeActive = (range: DateRange): boolean => Boolean(range.from || range.to);

/** Normalises a range so `from` never sits after `to`. */
export function orderRange(a: string, b: string): DateRange {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

export interface RangePreset {
  label: string;
  build: () => DateRange;
}

export const RANGE_PRESETS: RangePreset[] = [
  { label: "Today", build: () => ({ from: isoDaysAgo(0), to: isoDaysAgo(0) }) },
  { label: "7 days", build: () => ({ from: isoDaysAgo(6), to: isoDaysAgo(0) }) },
  { label: "30 days", build: () => ({ from: isoDaysAgo(29), to: isoDaysAgo(0) }) },
  {
    label: "This month",
    build: () => {
      const now = new Date();
      return { from: toIso(new Date(now.getFullYear(), now.getMonth(), 1)), to: toIso(now) };
    },
  },
];

export function matchingPresetLabel(range: DateRange): string | undefined {
  return RANGE_PRESETS.find((p) => {
    const r = p.build();
    return r.from === range.from && r.to === range.to;
  })?.label;
}

const DAY_FORMAT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

/** Human summary of the current selection, e.g. "Today", "2 Aug 2026" or "1 – 31 Aug 2026". */
export function describeRange(range: DateRange): string {
  if (!isRangeActive(range)) return "All time";

  const preset = matchingPresetLabel(range);
  if (preset) return preset;

  const fmt = (iso: string) => fromIso(iso).toLocaleDateString(undefined, DAY_FORMAT);
  if (range.from && range.to) {
    return range.from === range.to ? fmt(range.from) : `${fmt(range.from)} – ${fmt(range.to)}`;
  }
  return range.from ? `From ${fmt(range.from)}` : `Until ${fmt(range.to)}`;
}

export interface CalendarCell {
  iso: string;
  day: number;
  /** False for the leading/trailing days that pad the grid to whole weeks. */
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
}

/**
 * Builds the 6x7 grid for `month`, padded with the surrounding months' days so
 * every row is a full week. A fixed 42 cells keeps the grid from resizing as the
 * user pages through months.
 */
export function buildMonthGrid(month: Date, today: Date = new Date()): CalendarCell[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstOfMonth = new Date(year, monthIndex, 1);

  // Sunday-first, matching the WEEKDAYS header.
  const start = new Date(firstOfMonth);
  start.setDate(1 - firstOfMonth.getDay());

  const todayKey = toIso(today);
  const cells: CalendarCell[] = [];

  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = toIso(date);
    cells.push({
      iso,
      day: date.getDate(),
      inMonth: date.getMonth() === monthIndex && date.getFullYear() === year,
      isToday: iso === todayKey,
      isFuture: iso > todayKey,
    });
  }
  return cells;
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface DayTotals {
  count: number;
  amount: number;
}

/** Groups dated records by local calendar day, summing their amounts. */
export function summariseByDay(
  items: { date: string | Date | undefined | null; amount?: number }[]
): Map<string, DayTotals> {
  const byDay = new Map<string, DayTotals>();
  for (const item of items) {
    const day = dayOf(item.date);
    if (!day) continue;
    const existing = byDay.get(day) ?? { count: 0, amount: 0 };
    existing.count += 1;
    existing.amount += item.amount ?? 0;
    byDay.set(day, existing);
  }
  return byDay;
}
