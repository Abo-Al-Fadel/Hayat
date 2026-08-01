import { test, expect } from "@playwright/test";
import { loginAs, clearSession } from "./helpers";

/**
 * Regression tests for the "logged in but nothing loads" defect.
 *
 * ProtectedRoute used to treat "a token string exists in localStorage" as signed in.
 * Once the token aged out, the dashboard still mounted, every API call returned 401,
 * and the axios interceptor deliberately did nothing - so the page rendered but never
 * loaded data, and the only way out was a manual sign-out.
 */

/** A well-formed JWT whose exp is in the past. */
function expiredToken(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return [
    b64({ alg: "HS256", typ: "JWT" }),
    b64({ sub: "stale", exp: Math.floor(Date.now() / 1000) - 60 }),
    "notarealsignature",
  ].join(".");
}

/** Not expired, but the signature will not verify, so the server answers 401. */
function badSignatureToken(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return [
    b64({ alg: "HS256", typ: "JWT" }),
    b64({ sub: "x", exp: Math.floor(Date.now() / 1000) + 3600 }),
    "bad",
  ].join(".");
}

test.describe("Session expiry", () => {
  test("an expired token sends the user to login instead of an empty dashboard", async ({ page }) => {
    await clearSession(page);
    await loginAs(page, "admin");

    // Simulate the token ageing out while the tab sat idle.
    await page.evaluate((t) => localStorage.setItem("token", t), expiredToken());
    await page.goto("/admin");

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
  });

  test("a token the server rejects ends the session and explains why", async ({ page }) => {
    await clearSession(page);
    await loginAs(page, "admin");

    await page.evaluate((t) => localStorage.setItem("token", t), badSignatureToken());
    await page.goto("/admin");

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
    await expect(page.getByText(/session expired/i).first()).toBeVisible();
  });

  test("a healthy session still loads its data", async ({ page }) => {
    await clearSession(page);
    await loginAs(page, "admin");

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Admin Panel" })).toBeVisible({ timeout: 15_000 });
  });

  test("login offers a way back to the homepage", async ({ page }) => {
    await clearSession(page);
    await page.goto("/login");

    await page.getByRole("link", { name: /back to home/i }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
