// src/Components/ui/DateRangeFilter.tsx
import React, { useMemo } from "react";
import { Calendar, X } from "lucide-react";

export interface DateRange {
  /** Inclusive start (yyyy-mm-dd), or "" for no lower bound. */
  from: string;
  /** Inclusive end (yyyy-mm-dd), or "" for no upper bound. */
  to: string;
}

export const EMPTY_RANGE: DateRange = { from: "", to: "" };

/** Local yyyy-mm-dd for a date offset by `daysAgo`. Local, not UTC, so "today" matches the user's day. */
function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return toIso(d);
}

function toIso(d: Date): string {
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

const PRESETS: { label: string; build: () => DateRange }[] = [
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

/**
 * True when `iso` (a yyyy-mm-dd or ISO timestamp) falls inside the range.
 * Both bounds are inclusive; an empty bound means unbounded.
 */
export function isWithinRange(value: string | Date | undefined | null, range: DateRange): boolean {
  if (!range.from && !range.to) return true;
  if (!value) return false;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const day = toIso(date);
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

export const isRangeActive = (range: DateRange): boolean => Boolean(range.from || range.to);

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Shown next to the controls, e.g. "12 of 40 orders". */
  summary?: string;
  darkMode?: boolean;
}

/**
 * Date-range picker for order and invoice lists: quick presets plus explicit
 * from/to day inputs, using the browser's native date picker.
 */
export function DateRangeFilter({ value, onChange, summary, darkMode }: DateRangeFilterProps) {
  const active = isRangeActive(value);

  const inputClass = `px-2 py-1.5 rounded-lg border text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none ${
    darkMode
      ? "bg-gray-800 border-gray-600 text-gray-100"
      : "bg-white border-gray-300 text-gray-700"
  }`;

  const activePreset = useMemo(
    () => PRESETS.find((p) => {
      const r = p.build();
      return r.from === value.from && r.to === value.to;
    })?.label,
    [value]
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar className="h-4 w-4 text-gray-400 shrink-0" aria-hidden="true" />

      {PRESETS.map((preset) => (
        <button
          key={preset.label}
          type="button"
          onClick={() => onChange(preset.build())}
          aria-pressed={activePreset === preset.label}
          className={`px-3 py-1.5 rounded-full text-xs transition ${
            activePreset === preset.label
              ? "bg-purple-600 text-white"
              : darkMode
              ? "bg-gray-700 text-gray-200 hover:bg-gray-600"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {preset.label}
        </button>
      ))}

      <label className="sr-only" htmlFor="range-from">From date</label>
      <input
        id="range-from"
        type="date"
        value={value.from}
        max={value.to || undefined}
        onChange={(e) => onChange({ ...value, from: e.target.value })}
        className={inputClass}
      />
      <span className="text-xs text-gray-400">to</span>
      <label className="sr-only" htmlFor="range-to">To date</label>
      <input
        id="range-to"
        type="date"
        value={value.to}
        min={value.from || undefined}
        onChange={(e) => onChange({ ...value, to: e.target.value })}
        className={inputClass}
      />

      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_RANGE)}
          title="Clear date filter"
          aria-label="Clear date filter"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {summary && <span className="text-xs text-gray-400 ml-auto">{summary}</span>}
    </div>
  );
}
