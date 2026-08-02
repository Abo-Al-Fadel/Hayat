import { test, expect } from "@playwright/test";
import { ACCOUNTS, ALL_LANDINGS, RoleKey, API_BASE } from "./accounts";
import { loginAs, clearSession, trackPageErrors } from "./helpers";

const ROLES = Object.keys(ACCOUNTS) as RoleKey[];

test.describe("Authentication", () => {
  test("each role lands on its own dashboard", async ({ page }) => {
    for (const role of ROLES) {
      await clearSession(page);
      await loginAs(page, role);
      await expect(page).toHaveURL(new RegExp(`${ACCOUNTS[role].landing}$`));
    }
  });

  test("rejects a wrong password without revealing whether the user exists", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Enter your username").fill(ACCOUNTS.admin.username);
    await page.locator('input[type="password"]').fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign In" }).click();

    const error = page.locator("p.text-red-400");
    await expect(error).toBeVisible();
    await expect(error).toContainText(/invalid username or password/i);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("an unknown user produces the same message as a wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Enter your username").fill("no-such-user-at-all");
    await page.locator('input[type="password"]').fill("whatever");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.locator("p.text-red-400")).toContainText(/invalid username or password/i);
  });

  test("protected routes redirect anonymous visitors to login", async ({ page }) => {
    for (const landing of Object.values(ALL_LANDINGS)) {
      await clearSession(page);
      await page.goto(landing);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("signing out clears the session and blocks the back button", async ({ page }) => {
    await clearSession(page);
    await loginAs(page, "admin");

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login$/);

    const token = await page.evaluate(() => localStorage.getItem("token"));
    expect(token).toBeNull();

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a tampered token cannot keep a session alive", async ({ page }) => {
    await clearSession(page);
    await loginAs(page, "admin");

    await page.evaluate(() => localStorage.setItem("token", "tampered.jwt.value"));
    await page.goto("/admin");

    // The UI may still mount from the cached user object, but every API call must fail,
    // so no product data can render.
    const response = await page.request.get(`${API_BASE}/api/Medicine`, {
      headers: { Authorization: "Bearer tampered.jwt.value" },
    });
    expect(response.status()).toBe(401);
  });

  test("login page renders without console errors", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
