import { Page, expect } from "@playwright/test";
import { ACCOUNTS, RoleKey } from "./accounts";

/**
 * Navigates, tolerating the app cancelling it with a redirect of its own.
 *
 * When a request finds no usable token the app hard-redirects to /login?reason=expired
 * via window.location.replace. If that lands while a page.goto is still loading,
 * Playwright reports ERR_ABORTED or "interrupted by another navigation" - for what is
 * correct behaviour. Callers assert on where the page ends up, not on the navigation.
 */
async function gotoTolerant(page: Page, path: string) {
  await page.goto(path).catch(() => {});
}

/** Signs in through the real login form and waits for the role's landing page. */
export async function loginAs(page: Page, role: RoleKey) {
  const account = ACCOUNTS[role];

  await gotoTolerant(page, "/login");
  await page.waitForURL(/\/login/, { timeout: 15_000 });

  await page.getByPlaceholder("Enter your username").fill(account.username);
  await page.locator('input[type="password"]').fill(account.password);
  // Exact: the login page also carries a demo button, and a substring match would
  // find both.
  await page.getByRole("button", { name: "Sign In", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`${account.landing}$`), { timeout: 20_000 });
}

/**
 * Clears the shared-session storage keys the app uses.
 *
 * Ends on a settled /login rather than leaving that to the caller. A dashboard mounted
 * by a previous sign-in keeps polling; the moment this removes the token, its next
 * request triggers the expiry redirect described above, which would otherwise cancel
 * whichever navigation the test performed next.
 */
export async function clearSession(page: Page) {
  await gotoTolerant(page, "/login");
  await page.evaluate(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  });

  await gotoTolerant(page, "/login");
  await page.waitForURL(/\/login/, { timeout: 15_000 });
}

/** Collects uncaught page errors so tests can assert the UI did not blow up. */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}
