import { test, expect } from "@playwright/test";
import { ACCOUNTS, API_BASE, apiLogin } from "./accounts";
import { loginAs, clearSession, trackPageErrors } from "./helpers";

const MEDICINE = "E2E Painkiller";

async function stockOf(request: any, name: string): Promise<number> {
  const token = await apiLogin(ACCOUNTS.admin.username, ACCOUNTS.admin.password);
  const res = await request.get(`${API_BASE}/api/Medicine`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const med = (await res.json()).find((m: { name: string }) => m.name === name);
  return med?.quantity ?? -1;
}

test.describe("Pharmacist dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, "pharmacist");
  });

  test("point of sale loads with the product grid and cart", async ({ page }) => {
    const errors = trackPageErrors(page);
    await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
    await expect(page.getByText(MEDICINE).first()).toBeVisible({ timeout: 15_000 });
    expect(errors, `page errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("checkout completes and decrements real stock", async ({ page, request }) => {
    const before = await stockOf(request, MEDICINE);
    expect(before).toBeGreaterThan(0);

    // Add one unit of the seeded medicine to the cart.
    const addButton = page.getByRole("button", { name: `Add ${MEDICINE} to cart` });
    await expect(addButton).toBeVisible({ timeout: 15_000 });
    await addButton.click();

    await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();

    const checkout = page.getByRole("button", { name: /^checkout$/i });
    await expect(checkout).toBeEnabled();
    await checkout.click();

    // Invoice modal confirms the sale went through.
    await expect(page.getByText(/invoice/i).first()).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(() => stockOf(request, MEDICINE), { timeout: 15_000 })
      .toBeLessThan(before);
  });

  test("checkout is refused when the cart is empty", async ({ page }) => {
    const checkout = page.getByRole("button", { name: /^checkout$/i });
    await checkout.click();
    // Either the button is disabled or the app shows an error toast - never a sale.
    await expect(page.getByText(/cart is empty/i).first()).toBeVisible({ timeout: 5_000 }).catch(async () => {
      await expect(checkout).toBeDisabled();
    });
  });

  test("search narrows the product grid and recovers", async ({ page }) => {
    const search = page.getByPlaceholder(/search/i).first();
    await expect(search).toBeVisible();

    await search.fill("zzz-nothing-matches-zzz");
    await page.waitForTimeout(600);
    await expect(page.getByText(/no products match your search/i)).toBeVisible();

    await search.fill("");
    await page.waitForTimeout(600);
    await expect(page.getByText(MEDICINE).first()).toBeVisible();
  });

  test("cannot reach admin-only data from this session", async ({ page }) => {
    const token = await page.evaluate(() => localStorage.getItem("token"));
    const res = await page.request.get(`${API_BASE}/api/Users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(403);
  });
});
