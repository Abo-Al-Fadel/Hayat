import { test, expect } from "@playwright/test";
import { loginAs, clearSession, trackPageErrors } from "./helpers";

test.describe("Admin dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, "admin");
  });

  test("lands on the admin panel with all sections reachable", async ({ page }) => {
    const errors = trackPageErrors(page);
    await expect(page.getByRole("heading", { name: "Admin Panel" })).toBeVisible();

    for (const section of ["Products", "Orders", "Stocks", "Users"]) {
      await page.getByRole("button", { name: section, exact: true }).click();
      // Each section swaps the header title; just assert the app stays alive and routed.
      await expect(page).toHaveURL(/\/admin$/);
      await page.waitForTimeout(400);
    }

    expect(errors, `page errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("product search filters the catalogue", async ({ page }) => {
    await page.getByRole("button", { name: "Products", exact: true }).click();
    const search = page.getByPlaceholder("Search medicines...");
    await expect(search).toBeVisible();

    await search.fill("E2E Painkiller");
    await page.waitForTimeout(600);
    await expect(page.getByText("E2E Painkiller").first()).toBeVisible();

    await search.fill("zzz-no-such-medicine-zzz");
    await page.waitForTimeout(600);
    await expect(page.getByText("E2E Painkiller")).toHaveCount(0);
  });

  test("users section lists the seeded accounts", async ({ page }) => {
    await page.getByRole("button", { name: "Users", exact: true }).click();
    await expect(page.getByText("e2epharm").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("e2estore").first()).toBeVisible();
  });

  test("dark mode toggle persists across a reload", async ({ page }) => {
    const isDark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
    const before = await isDark();

    await page.getByRole("button", { name: /switch to (light|dark) mode/i }).click();
    await expect.poll(isDark, { timeout: 5_000 }).toBe(!before);

    await page.reload();
    await expect.poll(isDark, { timeout: 10_000 }).toBe(!before);

    // Restore, so the setting does not leak into later tests.
    await page.getByRole("button", { name: /switch to (light|dark) mode/i }).click();
    await expect.poll(isDark, { timeout: 5_000 }).toBe(before);
  });

  test("navigating to an unknown route does not leave a blank page", async ({ page }) => {
    await page.goto("/definitely-not-a-route");
    await page.waitForTimeout(800);
    const bodyText = (await page.locator("body").innerText()).trim();
    expect(bodyText.length, "unknown route rendered an empty document").toBeGreaterThan(0);
  });
});
