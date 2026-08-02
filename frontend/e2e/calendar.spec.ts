import { test, expect, Page } from "@playwright/test";
import { loginAs, clearSession, trackPageErrors } from "./helpers";
import { ACCOUNTS, API_BASE, apiLogin } from "./accounts";

/**
 * The order/invoice calendar. These run against real orders, so a sale is placed
 * first to guarantee today has at least one.
 */

/** Local yyyy-mm-dd, matching what the app compares against. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

function monthLabel(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Places a sale through the API so the calendar has something to mark. */
async function placeSale(request: import("@playwright/test").APIRequestContext) {
  const token = await apiLogin(ACCOUNTS.pharmacist.username, ACCOUNTS.pharmacist.password);
  const meds = await request.get(`${API_BASE}/api/Medicine`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const list: Array<{ id: number; name: string; quantity: number }> = await meds.json();
  const medicine = list.find((m) => m.name === "E2E Painkiller" && m.quantity > 1) ?? list[0];

  const res = await request.post(`${API_BASE}/api/Order`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { items: [{ medicineId: medicine.id, quantity: 1 }] },
  });
  expect(res.ok(), `seeding a sale for the calendar: ${res.status()}`).toBeTruthy();
}

/**
 * The grid cell for a given day of the month on screen. Matches the day number
 * followed by a year in the aria-label ("Friday, July 10, 2026"), so it keeps
 * working across a year boundary. Padding days from adjacent months never
 * duplicate a day number within one view.
 */
function dayCell(page: Page, day: number) {
  return page
    .getByRole("grid")
    .getByRole("button", { name: new RegExp(`\\b${day}\\b,?\\s+\\d{4}`) })
    .first();
}

test.describe("Order calendar - admin", () => {
  test.beforeEach(async ({ page, request }) => {
    await placeSale(request);
    await clearSession(page);
    await loginAs(page, "admin");
    await page.getByRole("button", { name: "Orders", exact: true }).click();
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });
  });

  test("opens on the current month and marks today from the real clock", async ({ page }) => {
    await expect(page.getByText(monthLabel())).toBeVisible();

    const today = page.locator('[aria-current="date"]');
    await expect(today).toHaveCount(1);
    await expect(today).toContainText(String(new Date().getDate()));
  });

  test("today carries an order marker once a sale exists", async ({ page }) => {
    // The label is generated from real data, so this fails if the markers go stale.
    await expect(page.locator('[aria-current="date"]')).toHaveAttribute(
      "aria-label",
      /\d+ orders?$/
    );
  });

  test("selecting today narrows the list and the summary agrees with it", async ({ page }) => {
    await page.getByRole("button", { name: "Today", exact: true }).click();

    const cell = page.locator('[aria-current="date"]');
    await expect(cell).toHaveAttribute("aria-pressed", "true");

    // "N of M orders" - N must match the invoices actually rendered.
    const summary = await page.getByText(/\d+ of \d+ orders/).innerText();
    const shown = Number(summary.match(/^(\d+) of/)![1]);
    await expect(page.getByText(/^Invoice #/)).toHaveCount(shown);
    expect(shown).toBeGreaterThan(0);
  });

  test("clearing the filter restores every order", async ({ page }) => {
    const total = Number((await page.getByText(/\d+ of \d+ orders/).innerText()).match(/of (\d+)/)![1]);

    await page.getByRole("button", { name: "Today", exact: true }).click();
    await page.getByLabel("Clear date filter").click();

    // Shown twice on purpose: the Period stat card and the calendar footer must agree.
    await expect(page.getByText("All time")).toHaveCount(2);
    await expect(page.getByText(/^Invoice #/)).toHaveCount(total);
  });

  test("clicking two days selects the span between them", async ({ page }) => {
    // Page back a month so the test works on the 1st as well as the 28th, and so
    // every day involved is in the past and therefore selectable.
    await page.getByLabel("Previous month").click();

    await dayCell(page, 10).click();
    await dayCell(page, 12).click();

    await expect(dayCell(page, 10)).toHaveAttribute("aria-pressed", "true");
    await expect(dayCell(page, 11)).toHaveAttribute("aria-pressed", "true");
    await expect(dayCell(page, 12)).toHaveAttribute("aria-pressed", "true");
    await expect(dayCell(page, 13)).toHaveAttribute("aria-pressed", "false");
  });

  test("clicking the selected day again clears the selection", async ({ page }) => {
    await page.getByLabel("Previous month").click();

    await dayCell(page, 10).click();
    await expect(dayCell(page, 10)).toHaveAttribute("aria-pressed", "true");

    await dayCell(page, 10).click();
    await expect(dayCell(page, 10)).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("All time")).toHaveCount(2);
  });

  test("days after today are not selectable when they hold no orders", async ({ page }) => {
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const future = new Date().getDate() + 1;
    test.skip(future > daysInMonth, "today is the last day of the month");

    await expect(dayCell(page, future)).toBeDisabled();
  });

  test("paging months does not disturb the selection", async ({ page }) => {
    await page.getByRole("button", { name: "Today", exact: true }).click();
    const before = await page.getByText(/\d+ of \d+ orders/).innerText();

    await page.getByLabel("Previous month").click();
    await expect(page.getByText(monthLabel())).toHaveCount(0);
    await page.getByLabel("Next month").click();

    await expect(page.getByText(monthLabel())).toBeVisible();
    await expect(page.getByText(/\d+ of \d+ orders/)).toHaveText(before);
  });

  test("the header reports each figure once", async ({ page }) => {
    // "Total Orders" used to sit beside "Shown" showing the same number.
    await expect(page.getByText("Total orders", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Shown", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Value shown", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Period", { exact: true })).toHaveCount(1);
  });

  test("the value shown tracks the selection", async ({ page }) => {
    const readValue = async () =>
      Number((await page.getByText(/^\$[\d,]+\.\d{2}$/).first().innerText()).replace(/[$,]/g, ""));

    const allTime = await readValue();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await page.waitForTimeout(300);
    const todayOnly = await readValue();

    expect(todayOnly).toBeGreaterThan(0);
    expect(todayOnly).toBeLessThanOrEqual(allTime);
  });

  test("renders without console errors", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.getByRole("button", { name: "7 days", exact: true }).click();
    await page.getByLabel("Previous month").click();
    await page.getByLabel("Next month").click();
    await page.waitForTimeout(500);
    expect(errors, `page errors: ${errors.join("; ")}`).toEqual([]);
  });
});

test.describe("Order calendar - pharmacist", () => {
  test.beforeEach(async ({ page, request }) => {
    await placeSale(request);
    await clearSession(page);
    await loginAs(page, "pharmacist");
  });

  test("the invoices modal opens on a calendar that marks today", async ({ page }) => {
    await page.getByRole("button", { name: /orders/i }).first().click();

    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(monthLabel())).toBeVisible();
    await expect(page.locator('[aria-current="date"]')).toHaveCount(1);
  });

  test("picking today narrows the invoice list", async ({ page }) => {
    await page.getByRole("button", { name: /orders/i }).first().click();
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByText(/\d+ of \d+ orders/)).toBeVisible();
    await expect(page.locator('[aria-current="date"]')).toHaveAttribute("aria-pressed", "true");
  });

  test("a range with no sales shows an empty state, not a blank panel", async ({ page }) => {
    await page.getByRole("button", { name: /orders/i }).first().click();
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });

    // Walk back a year; no E2E sales exist that far back.
    for (let i = 0; i < 12; i++) await page.getByLabel("Previous month").click();
    await page.getByRole("grid").getByRole("button").nth(20).click();

    await expect(page.getByText(/No orders in this date range/i)).toBeVisible();
  });
});

test.describe("Order calendar - date handling", () => {
  // Winding the browser clock forward to prove the ring follows it is not testable
  // here: the session guard reads the token's exp against that same clock and signs
  // the user out first (which is correct, and session.spec.ts covers it). The ring
  // tracking the real clock is asserted above against `new Date()` at run time, and
  // against fake timers in the unit tests.

  test("an order placed today lands on today's cell, not yesterday's", async ({ page, request }) => {
    await placeSale(request);
    await clearSession(page);
    await loginAs(page, "admin");
    await page.getByRole("button", { name: "Orders", exact: true }).click();
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });

    // Orders carry UTC timestamps; bucketing them in UTC would move late-evening
    // sales to the wrong day for anyone east of Greenwich.
    const today = page.locator('[aria-current="date"]');
    await expect(today).toHaveAttribute("aria-label", /\d+ orders?$/);

    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByText(/^[1-9]\d* of \d+ orders/)).toBeVisible();
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
