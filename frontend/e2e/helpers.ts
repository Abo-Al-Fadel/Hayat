import { Page, expect } from "@playwright/test";
import { ACCOUNTS, RoleKey } from "./accounts";

/** Signs in through the real login form and waits for the role's landing page. */
export async function loginAs(page: Page, role: RoleKey) {
  const account = ACCOUNTS[role];

  await page.goto("/login");
  await page.getByPlaceholder("Enter your username").fill(account.username);
  await page.locator('input[type="password"]').fill(account.password);
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page).toHaveURL(new RegExp(`${account.landing}$`), { timeout: 20_000 });
}

/** Clears the shared-session storage keys the app uses. */
export async function clearSession(page: Page) {
  await page.goto("/login");
  await page.evaluate(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  });
}

/** Collects uncaught page errors so tests can assert the UI did not blow up. */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}
