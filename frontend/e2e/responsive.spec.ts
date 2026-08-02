import { test, expect, Page } from "@playwright/test";
import { loginAs, clearSession, trackPageErrors } from "./helpers";
import { RoleKey } from "./accounts";

/**
 * Layout checks across the sizes the app actually gets used at.
 *
 * The recurring failure mode is a fixed width (w-64 sidebar, w-2/3 pane, a wide
 * table) forcing the whole page to scroll sideways on a phone. Wide content is
 * allowed - it just has to scroll inside its own container, not drag the body
 * with it.
 */

const VIEWPORTS = [
  { name: "phone", width: 375, height: 667 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1440, height: 900 },
] as const;

const ROLES: RoleKey[] = ["admin", "pharmacist", "storage"];

/** How far the document scrolls sideways. Anything over a rounding pixel is a bug. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - doc.clientWidth);
  });
}

/** Elements poking past the right edge of the viewport, ignoring ones in their own scroller. */
async function offscreenElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const limit = window.innerWidth + 1;
    const offenders: string[] = [];

    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right <= limit) continue;

      // Fine if some ancestor scrolls horizontally on purpose.
      let parent = el.parentElement;
      let contained = false;
      while (parent && parent !== document.body) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden") {
          contained = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (contained) continue;

      // Off-canvas drawers sit at negative x by design.
      if (rect.left < 0) continue;

      offenders.push(
        `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ").slice(0, 3).join(".")} (right=${Math.round(rect.right)})`
      );
      if (offenders.length >= 5) break;
    }
    return offenders;
  });
}

test.describe("Public pages fit every screen", () => {
  for (const vp of VIEWPORTS) {
    for (const path of ["/", "/login", "/contact"]) {
      test(`${path} has no sideways scroll at ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const errors = trackPageErrors(page);

        await page.goto(path);
        await page.waitForLoadState("networkidle");

        expect(await horizontalOverflow(page), `${path} overflows at ${vp.name}`).toBeLessThanOrEqual(1);
        expect(await offscreenElements(page)).toEqual([]);
        expect(errors, `page errors: ${errors.join("; ")}`).toEqual([]);
      });
    }
  }
});

test.describe("Dashboards fit every screen", () => {
  for (const role of ROLES) {
    for (const vp of VIEWPORTS) {
      test(`${role} dashboard has no sideways scroll at ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await clearSession(page);
        await loginAs(page, role);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(800);

        expect(
          await horizontalOverflow(page),
          `${role} overflows at ${vp.name}`
        ).toBeLessThanOrEqual(1);
        expect(await offscreenElements(page)).toEqual([]);
      });
    }
  }
});

test.describe("Admin sections fit a phone", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await clearSession(page);
    await loginAs(page, "admin");
  });

  test("the sidebar is a drawer, not a fixed column stealing the screen", async ({ page }) => {
    // Closed by default on a phone, so content gets the full width.
    const sidebar = page.getByLabel("Dashboard navigation");
    await expect(sidebar).toHaveClass(/-translate-x-full/);

    await page.getByRole("button", { name: /open navigation|menu/i }).first().click();
    await expect(sidebar).toHaveClass(/translate-x-0/);

    // Choosing a destination closes it again.
    await page.getByRole("button", { name: "Orders", exact: true }).click();
    await expect(sidebar).toHaveClass(/-translate-x-full/);
  });

  test("Escape closes the navigation drawer", async ({ page }) => {
    await page.getByRole("button", { name: /open navigation|menu/i }).first().click();
    await expect(page.getByLabel("Dashboard navigation")).toHaveClass(/translate-x-0/);

    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Dashboard navigation")).toHaveClass(/-translate-x-full/);
  });

  for (const section of ["Products", "Orders", "Stocks", "Users", "Statistics"]) {
    test(`${section} section fits a phone`, async ({ page }) => {
      await page.getByRole("button", { name: /open navigation|menu/i }).first().click();
      await page.getByRole("button", { name: section, exact: true }).click();
      await page.waitForTimeout(1200);

      expect(await horizontalOverflow(page), `${section} overflows on a phone`).toBeLessThanOrEqual(1);
      expect(await offscreenElements(page)).toEqual([]);
    });
  }

  test("the order calendar stays inside a phone screen and remains usable", async ({ page }) => {
    await page.getByRole("button", { name: /open navigation|menu/i }).first().click();
    await page.getByRole("button", { name: "Orders", exact: true }).click();

    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible({ timeout: 15_000 });

    const box = await grid.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(375);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    // Days are still large enough to tap. 32px is below the 44px ideal but is the
    // practical floor for a seven-column month grid at this width.
    const cell = grid.getByRole("button").nth(10);
    const cellBox = await cell.boundingBox();
    expect(cellBox!.width).toBeGreaterThanOrEqual(32);
    expect(cellBox!.height).toBeGreaterThanOrEqual(32);

    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.locator('[aria-current="date"]')).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("Pharmacist point of sale fits a phone", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await clearSession(page);
    await loginAs(page, "pharmacist");
  });

  test("product grid and cart stack instead of overflowing", async ({ page }) => {
    await page.waitForTimeout(1200);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    expect(await offscreenElements(page)).toEqual([]);
  });

  test("the orders modal scrolls vertically rather than spilling sideways", async ({ page }) => {
    await page.getByRole("button", { name: /orders/i }).first().click();
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    // The invoice pane used to be pinned at w-2/3 on every screen.
    const modal = page.locator(".max-h-\\[90vh\\]").first();
    const box = await modal.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(375);
  });
});

test.describe("Storage manager fits a phone", () => {
  test("supply order list does not force sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await clearSession(page);
    await loginAs(page, "storage");
    await page.waitForTimeout(1200);

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    expect(await offscreenElements(page)).toEqual([]);
  });
});
