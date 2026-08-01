import { test, expect } from "@playwright/test";
import { ACCOUNTS, API_BASE, apiLogin } from "./accounts";
import { loginAs, clearSession, trackPageErrors } from "./helpers";

test.describe("Admin finance section", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, "admin");
  });

  test("Finance section renders the money cards", async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.getByRole("button", { name: "Finance", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Sales —/ })).toBeVisible({ timeout: 15_000 });

    for (const label of [
      "Revenue",
      "Cost of goods sold",
      "Gross profit",
      "Gross margin",
      "Orders",
      "Units sold",
      "Average order value",
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    await expect(page.getByRole("heading", { name: "Inventory on hand" })).toBeVisible();
    await expect(page.getByText("Value at cost", { exact: true })).toBeVisible();
    await expect(page.getByText("Value at retail", { exact: true })).toBeVisible();
    await expect(page.getByText("Potential profit", { exact: true })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Top medicines by revenue" })).toBeVisible();

    expect(errors, `page errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("period selector reloads the figures", async ({ page }) => {
    await page.getByRole("button", { name: "Finance", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Sales — last 30 days$/ })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "7 days", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Sales — last 7 days$/ })).toBeVisible();

    await page.getByRole("button", { name: "1 year", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Sales — last 365 days$/ })).toBeVisible();
  });

  test("finance figures are not reachable by other roles", async ({ request }) => {
    for (const role of ["pharmacist", "storage"] as const) {
      const token = await apiLogin(ACCOUNTS[role].username, ACCOUNTS[role].password);
      const res = await request.get(`${API_BASE}/api/Stats/financial`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status(), `${role} reading financial stats`).toBe(403);
    }
  });

  test("purchase cost is never sent to a pharmacist", async ({ request }) => {
    const pharmToken = await apiLogin(ACCOUNTS.pharmacist.username, ACCOUNTS.pharmacist.password);
    const res = await request.get(`${API_BASE}/api/Medicine`, {
      headers: { Authorization: `Bearer ${pharmToken}` },
    });
    const medicines: Array<{ costPrice: number | null }> = await res.json();
    expect(medicines.length).toBeGreaterThan(0);
    expect(medicines.every((m) => m.costPrice === null || m.costPrice === undefined)).toBe(true);
  });

  test("price suggestion follows the regressive tiers", async ({ request }) => {
    const adminToken = await apiLogin(ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    const auth = { Authorization: `Bearer ${adminToken}` };

    for (const [cost, markup] of [[4, 40], [25, 25], [80, 15], [500, 10]] as const) {
      const res = await request.get(`${API_BASE}/api/Stats/suggest-price?cost=${cost}`, { headers: auth });
      const body = await res.json();
      expect(body.markupPercent, `markup for cost ${cost}`).toBe(markup);
      expect(body.suggestedPrice).toBeCloseTo(cost * (1 + markup / 100), 2);
    }
  });
});
