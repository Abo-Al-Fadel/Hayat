// src/Components/ui/OrderCalendar.tsx
import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  buildMonthGrid,
  describeRange,
  EMPTY_RANGE,
  fromIso,
  isRangeActive,
  matchingPresetLabel,
  orderRange,
  RANGE_PRESETS,
  summariseByDay,
  todayIso,
  WEEKDAYS,
  type DateRange,
} from "../../utils/dateRange";

export interface CalendarItem {
  date: string | Date | undefined | null;
  amount?: number;
}

interface OrderCalendarProps {
  /** Every order/invoice in the list, unfiltered - the markers show where the data is. */
  items: CalendarItem[];
  value: DateRange;
  onChange: (range: DateRange) => void;
  darkMode?: boolean;
  /** Plural noun for the summary line, e.g. "orders" or "invoices". */
  noun?: string;
  /** Total in the current selection, rendered under the grid. */
  selectedCount?: number;
}

const MONTH_LABEL: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" };
const FULL_DAY: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" };

/**
 * Month-grid calendar for order/invoice history.
 *
 * Reads as a real calendar rather than a pair of date inputs: today is ringed,
 * every day that has orders carries a count badge, and clicking days selects a
 * single day or a span. Selection rules, so a click is never ambiguous:
 *   - nothing selected      -> that day
 *   - one day selected      -> span between the two days
 *   - a span selected       -> start over from that day
 */
export function OrderCalendar({
  items,
  value,
  onChange,
  darkMode,
  noun = "orders",
  selectedCount,
}: OrderCalendarProps) {
  const today = todayIso();

  // Open on the month the selection is in, so a preset like "30 days" isn't off-screen.
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const anchor = value.to || value.from || today;
    const d = fromIso(anchor);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const byDay = useMemo(() => summariseByDay(items), [items]);
  const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const activePreset = matchingPresetLabel(value);
  const active = isRangeActive(value);
  const busiestDay = useMemo(
    () => Math.max(1, ...Array.from(byDay.values(), (d) => d.count)),
    [byDay]
  );

  /** "1 order" / "3 orders" - a bare `${n} ${noun}` reads wrong at one. */
  const countLabel = (count: number) =>
    `${count} ${count === 1 ? noun.replace(/s$/, "") : noun}`;

  const shiftMonth = (delta: number) =>
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  const jumpTo = (range: DateRange) => {
    onChange(range);
    const anchor = fromIso(range.to || range.from || today);
    setViewMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  };

  const handleDayClick = (iso: string) => {
    const isSingleDay = Boolean(value.from) && value.from === value.to;
    if (isSingleDay && value.from !== iso) {
      onChange(orderRange(value.from, iso));
    } else if (isSingleDay) {
      onChange(EMPTY_RANGE); // clicking the selected day again clears it
    } else {
      onChange({ from: iso, to: iso });
    }
  };

  const surface = darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200";
  const muted = darkMode ? "text-gray-500" : "text-gray-400";

  return (
    <div className={`rounded-xl border shadow-sm ${surface}`}>
      {/* Month navigation + presets */}
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-inherit">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className={`p-1.5 rounded-lg transition ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h4 className="text-sm font-semibold min-w-[9.5rem] text-center" aria-live="polite">
            {viewMonth.toLocaleDateString(undefined, MONTH_LABEL)}
          </h4>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className={`p-1.5 rounded-lg transition ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
          {RANGE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => jumpTo(preset.build())}
              aria-pressed={activePreset === preset.label}
              className={`px-2.5 py-1 rounded-full text-xs transition ${
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
          {active && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_RANGE)}
              aria-label="Clear date filter"
              title="Clear date filter"
              className={`p-1.5 rounded-lg transition ${muted} ${darkMode ? "hover:bg-gray-700 hover:text-gray-200" : "hover:bg-gray-100 hover:text-gray-700"}`}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="p-2 sm:p-3">
        <div className={`grid grid-cols-7 gap-1 mb-1 text-[10px] sm:text-xs font-medium ${muted}`}>
          {WEEKDAYS.map((day) => (
            <div key={day} className="text-center py-1" aria-hidden="true">
              {/* One letter on phones, three on anything wider. */}
              <span className="sm:hidden">{day[0]}</span>
              <span className="hidden sm:inline">{day}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${noun} by day`}>
          {cells.map((cell) => {
            const totals = byDay.get(cell.iso);
            const selected =
              Boolean(value.from) &&
              cell.iso >= (value.from || cell.iso) &&
              cell.iso <= (value.to || value.from);
            const isEdge = cell.iso === value.from || cell.iso === value.to;

            // A day past today can only hold orders if the clock/timezone disagrees with
            // the server - so it stays clickable when it actually has data.
            const disabled = cell.isFuture && !totals;

            return (
              <button
                key={cell.iso}
                type="button"
                disabled={disabled}
                onClick={() => handleDayClick(cell.iso)}
                aria-pressed={selected}
                aria-current={cell.isToday ? "date" : undefined}
                title={totals ? `${countLabel(totals.count)} · $${totals.amount.toFixed(2)}` : undefined}
                aria-label={`${fromIso(cell.iso).toLocaleDateString(undefined, FULL_DAY)}${
                  cell.isToday ? " (today)" : ""
                }, ${totals ? countLabel(totals.count) : `no ${noun}`}`}
                className={[
                  "relative flex flex-col items-center justify-center rounded-lg transition",
                  "aspect-square text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500",
                  selected
                    ? isEdge
                      ? "bg-purple-600 text-white font-semibold"
                      : "bg-purple-500/25 text-purple-900 dark:text-purple-100"
                    : darkMode
                    ? "hover:bg-gray-700"
                    : "hover:bg-gray-100",
                  !cell.inMonth && !selected ? muted : "",
                  cell.isToday && !selected ? "ring-2 ring-purple-500 font-bold" : "",
                  disabled ? "opacity-30 cursor-not-allowed" : "",
                ].join(" ")}
              >
                <span>{cell.day}</span>

                {/* Activity marker: bar height scales with the day's share of the busiest day. */}
                {totals ? (
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 rounded-full ${selected ? "bg-white/80" : "bg-purple-500"}`}
                    style={{
                      width: "60%",
                      height: `${2 + Math.round((totals.count / busiestDay) * 4)}px`,
                    }}
                  />
                ) : (
                  <span aria-hidden="true" className="mt-0.5 h-[2px]" />
                )}

                {totals && totals.count > 1 && (
                  <span
                    aria-hidden="true"
                    className={`absolute top-0.5 right-0.5 text-[9px] leading-none px-1 py-0.5 rounded-full ${
                      selected ? "bg-white/25 text-white" : "bg-purple-500/15 text-purple-600 dark:text-purple-300"
                    }`}
                  >
                    {totals.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selection summary */}
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 border-t border-inherit text-xs ${
          darkMode ? "text-gray-400" : "text-gray-500"
        }`}
      >
        <span className="font-medium">{describeRange(value)}</span>
        {selectedCount !== undefined && (
          <span>
            {selectedCount} of {items.length} {noun}
          </span>
        )}
        {!active && <span className="ml-auto hidden sm:inline">Click a day, then another, to pick a range</span>}
      </div>
    </div>
  );
}
