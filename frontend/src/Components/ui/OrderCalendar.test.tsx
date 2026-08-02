import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderCalendar } from "./OrderCalendar";
import { EMPTY_RANGE, type DateRange } from "../../utils/dateRange";

const TODAY = new Date(2026, 7, 2, 12, 0); // Sunday 2 August 2026

const items = [
  { date: new Date(2026, 7, 2, 9), amount: 20 },
  { date: new Date(2026, 7, 2, 15), amount: 30 },
  { date: new Date(2026, 7, 5, 11), amount: 12.5 },
  { date: new Date(2026, 6, 20, 11), amount: 8 }, // previous month
];

/** The calendar grid is a set of buttons; find the one for a given day-of-month. */
function dayButton(day: number) {
  const grid = screen.getByRole("grid");
  return within(grid)
    .getAllByRole("button")
    .find((b) => b.textContent?.trim().startsWith(String(day)) && b.getAttribute("aria-label")?.includes("August"))!;
}

function setup(value: DateRange = EMPTY_RANGE) {
  const onChange = vi.fn();
  const utils = render(
    <OrderCalendar items={items} value={value} onChange={onChange} selectedCount={items.length} />
  );
  return { onChange, ...utils };
}

describe("OrderCalendar", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(TODAY);
  });
  afterEach(() => vi.useRealTimers());

  it("opens on the current month", () => {
    setup();
    expect(screen.getByText("August 2026")).toBeInTheDocument();
  });

  it("marks today, and only today", () => {
    setup();
    const marked = screen.getAllByRole("button").filter((b) => b.getAttribute("aria-current") === "date");
    expect(marked).toHaveLength(1);
    // Day order inside the label is locale-dependent; the parts are not.
    expect(marked[0].getAttribute("aria-label")).toMatch(/August.*2026.*\(today\)/);
  });

  it("announces the order count on days that have orders, singular at one", () => {
    setup();
    expect(dayButton(2).getAttribute("aria-label")).toContain("2 orders");
    expect(dayButton(5).getAttribute("aria-label")).toMatch(/, 1 order$/);
    expect(dayButton(4).getAttribute("aria-label")).toContain("no orders");
  });

  it("disables future days that hold no orders, so empty selections are unreachable", () => {
    setup();
    expect(dayButton(10)).toBeDisabled();
    expect(dayButton(1)).toBeEnabled();
    expect(dayButton(2)).toBeEnabled();
  });

  it("keeps a future day clickable when it somehow has orders", () => {
    // Clock skew between the browser and the server can date an order 'tomorrow'.
    const onChange = vi.fn();
    render(
      <OrderCalendar
        items={[{ date: new Date(2026, 7, 20), amount: 5 }]}
        value={EMPTY_RANGE}
        onChange={onChange}
      />
    );
    expect(dayButton(20)).toBeEnabled();
  });

  it("selects a single day on first click", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(dayButton(2));
    expect(onChange).toHaveBeenCalledWith({ from: "2026-08-02", to: "2026-08-02" });
  });

  it("extends to a range on the second click", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ from: "2026-08-02", to: "2026-08-02" });
    await user.click(dayButton(5));
    expect(onChange).toHaveBeenCalledWith({ from: "2026-08-02", to: "2026-08-05" });
  });

  it("orders the range when the later day was clicked first", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ from: "2026-08-05", to: "2026-08-05" });
    await user.click(dayButton(2));
    expect(onChange).toHaveBeenCalledWith({ from: "2026-08-02", to: "2026-08-05" });
  });

  it("clears when the single selected day is clicked again", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ from: "2026-08-02", to: "2026-08-02" });
    await user.click(dayButton(2));
    expect(onChange).toHaveBeenCalledWith(EMPTY_RANGE);
  });

  it("starts a fresh single-day selection when a span is already selected", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ from: "2026-08-01", to: "2026-08-05" });
    await user.click(dayButton(2));
    expect(onChange).toHaveBeenCalledWith({ from: "2026-08-02", to: "2026-08-02" });
  });

  it("marks every day of the selected span as pressed", () => {
    setup({ from: "2026-08-01", to: "2026-08-03" });
    expect(dayButton(1)).toHaveAttribute("aria-pressed", "true");
    expect(dayButton(2)).toHaveAttribute("aria-pressed", "true");
    expect(dayButton(3)).toHaveAttribute("aria-pressed", "true");
    expect(dayButton(4)).toHaveAttribute("aria-pressed", "false");
  });

  it("pages between months without changing the selection", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByLabelText("Previous month"));
    expect(screen.getByText("July 2026")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Next month"));
    await user.click(screen.getByLabelText("Next month"));
    expect(screen.getByText("September 2026")).toBeInTheDocument();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies a preset and jumps the view to it", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenCalledWith({ from: "2026-08-02", to: "2026-08-02" });
  });

  it("highlights the preset that matches the current range", () => {
    setup({ from: "2026-08-02", to: "2026-08-02" });
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "false");
  });

  it("only offers Clear once a range is active", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <OrderCalendar items={items} value={EMPTY_RANGE} onChange={vi.fn()} />
    );
    expect(screen.queryByLabelText("Clear date filter")).not.toBeInTheDocument();

    const onChange = vi.fn();
    rerender(
      <OrderCalendar items={items} value={{ from: "2026-08-01", to: "2026-08-03" }} onChange={onChange} />
    );
    await user.click(screen.getByLabelText("Clear date filter"));
    expect(onChange).toHaveBeenCalledWith(EMPTY_RANGE);
  });

  it("summarises the selection and the counts", () => {
    setup({ from: "2026-08-02", to: "2026-08-02" });
    // "Today" is both a preset button and the summary label; only the latter is a span.
    expect(screen.getByText("Today", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("4 of 4 orders")).toBeInTheDocument();
  });

  it("opens on the month of an existing selection rather than today", () => {
    render(<OrderCalendar items={items} value={{ from: "2026-03-01", to: "2026-03-31" }} onChange={vi.fn()} />);
    expect(screen.getByText("March 2026")).toBeInTheDocument();
  });

  it("renders without crashing when there are no orders at all", () => {
    render(<OrderCalendar items={[]} value={EMPTY_RANGE} onChange={vi.fn()} selectedCount={0} />);
    expect(screen.getByText("August 2026")).toBeInTheDocument();
    expect(screen.getByText("0 of 0 orders")).toBeInTheDocument();
  });
});
