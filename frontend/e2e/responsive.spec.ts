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

/** The sizes the phone pass targets, plus the small tablet. */
const SMALL_SIZES = [
  { name: "360", width: 360, height: 640 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
] as const;

const THEMES = ["light", "dark"] as const;

/**
 * Forces a theme before the dashboard mounts.
 *
 * Two keys because the pharmacist page kept its own: useDarkMode writes "darkMode",
 * PharmacistDashboard writes "pharmacistThemeMode". Seeding both means one helper
 * works for every role without hunting for a toggle button whose label differs per
 * page.
 */
async function useTheme(page: Page, theme: (typeof THEMES)[number]) {
  const dark = theme === "dark";
  await page.evaluate((isDark) => {
    localStorage.setItem("darkMode", String(isDark));
    localStorage.setItem("pharmacistThemeMode", isDark ? "dark" : "light");
  }, dark);
}

/**
 * Content that an overflow-hidden ancestor has amputated.
 *
 * This is the gap offscreenElements() above cannot see. That helper treats any
 * scrolling *or hidden* ancestor as "contained, therefore fine" - which is true for
 * overflow-x-auto, where the user can scroll to the rest, and false for
 * overflow-hidden, where the remainder simply does not exist as far as the user is
 * concerned. A six-column table clipped to three passes that check while being
 * unusable, which is exactly how the storage dashboard shipped.
 *
 * Elements that truncate text on purpose are excluded: text-overflow: ellipsis is a
 * deliberate, visible affordance, not silent amputation.
 */
async function clippedContent(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = [];

    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const style = getComputedStyle(el);
      if (style.overflowX !== "hidden") continue;
      // Deliberate single-line truncation announces itself with an ellipsis.
      if (style.textOverflow === "ellipsis") continue;

      // 3px of slack for sub-pixel layout rounding.
      const lost = el.scrollWidth - el.clientWidth;
      if (lost <= 3) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      offenders.push(
        `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ").slice(0, 3).join(".")} ` +
          `hides ${lost}px of ${el.scrollWidth}px`
      );
      if (offenders.length >= 5) break;
    }

    return offenders;
  });
}

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

  test("the header keeps notifications, theme and sign out on screen", async ({ page }) => {
    // The nav is one flex row and the search box was a fixed w-72. At 360px the logo
    // plus that input already exceeded the row, so the entire right-hand cluster was
    // laid out from x=477 to x=617 - past the edge, and hidden rather than scrollable
    // because #root sets overflow-x: hidden globally. Nothing here reported an error;
    // the controls simply were not there.
    await page.setViewportSize({ width: 360, height: 640 });
    await clearSession(page);
    await loginAs(page, "pharmacist");
    await page.waitForTimeout(1200);

    for (const label of ["Open orders", "Toggle theme", "Notifications", "Sign out"]) {
      const control = page.getByRole("button", { name: label, exact: true }).first();
      await expect(control, `${label} is missing`).toBeVisible();

      const box = await control.boundingBox();
      expect(box, `${label} has no box`).not.toBeNull();
      expect(box!.x, `${label} starts off the left edge`).toBeGreaterThanOrEqual(0);
      expect(
        box!.x + box!.width,
        `${label} runs past the right edge of a 360px screen`
      ).toBeLessThanOrEqual(361);

      // Comfortable to hit with a thumb.
      expect(box!.height, `${label} is only ${box!.height}px tall`).toBeGreaterThanOrEqual(40);
    }
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

  test("the supply order table can be scrolled to its last column", async ({ page }) => {
    // The table needs ~640px for six columns and the phone gives it ~330. That is
    // fine - as long as the remainder is reachable. It used to sit in an
    // overflow-hidden box, so Status and Actions were cut off entirely, and the
    // status dropdown is the only control on this page.
    await page.setViewportSize({ width: 360, height: 640 });
    await clearSession(page);
    await loginAs(page, "storage");
    await page.waitForTimeout(1500);

    const table = page.locator("table").first();
    await expect(table).toBeVisible({ timeout: 15_000 });

    const scroller = page.locator("div:has(> table)").last();
    const before = await scroller.evaluate((el) => ({
      overflowX: getComputedStyle(el).overflowX,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));

    // Wider than its box - so it must be a scroller, not a clipper.
    expect(before.scrollWidth).toBeGreaterThan(before.clientWidth);
    expect(["auto", "scroll"], "the table's box must scroll, not clip").toContain(before.overflowX);

    // And scrolling actually reaches the end.
    await scroller.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    const scrolledTo = await scroller.evaluate((el) => el.scrollLeft);
    expect(scrolledTo).toBeGreaterThan(0);

    // The header cell of the last column is now inside the viewport.
    const lastHeader = page.locator("table thead th").last();
    const box = await lastHeader.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360 + 1);
  });
});

/**
 * The check the older assertions above cannot make.
 *
 * Explicit coverage at 360, 390 and 768 in both themes: dark mode is a different set
 * of border and padding utilities on several of these panels, so a layout that fits
 * in one theme is not proof of the other.
 */
test.describe("Nothing is clipped out of reach", () => {
  for (const role of ROLES) {
    for (const size of SMALL_SIZES) {
      for (const theme of THEMES) {
        test(`${role} @${size.name} ${theme}`, async ({ page }) => {
          await page.setViewportSize({ width: size.width, height: size.height });
          await clearSession(page);
          await useTheme(page, theme);
          await loginAs(page, role);
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(1000);

          expect(
            await clippedContent(page),
            `${role} @${size.name} ${theme} amputates content`
          ).toEqual([]);
        });
      }
    }
  }
});

test.describe("Confirmation dialogs are usable on a phone", () => {
  for (const theme of THEMES) {
    test(`the status confirmation closes on Escape and has a thumb-sized close (${theme})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 640 });
      await clearSession(page);
      await useTheme(page, theme);
      await loginAs(page, "storage");
      await page.waitForTimeout(1500);

      // Advancing a supply order raises the shared ConfirmModal. Nothing is written:
      // the dialog is dismissed, never confirmed.
      const statusSelect = page.locator("select").first();
      await expect(statusSelect).toBeVisible({ timeout: 15_000 });
      const options = (await statusSelect.locator("option").allTextContents())
        .map((o) => o.trim())
        .filter((o) => /shipped|received|stored/i.test(o));
      test.skip(options.length === 0, "no advanceable supply order in this database");

      await statusSelect.selectOption({ label: options[0] });

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      // It fits on the screen, and its close button is reachable by thumb.
      const close = dialog.getByRole("button", { name: "Close", exact: true });
      const closeBox = await close.boundingBox();
      expect(closeBox!.width, "close button is too small to tap").toBeGreaterThanOrEqual(44);
      expect(closeBox!.height, "close button is too small to tap").toBeGreaterThanOrEqual(44);
      expect(closeBox!.x + closeBox!.width).toBeLessThanOrEqual(361);
      expect(closeBox!.y).toBeGreaterThanOrEqual(0);

      // Escape dismisses it. The nav drawer has always done this; the dialog did not,
      // so the two disagreed about the same key.
      await page.keyboard.press("Escape");
      await expect(dialog, "Escape must close the confirmation").toBeHidden({ timeout: 5_000 });
    });
  }
});

test.describe("Admin sections are not clipped on a phone", () => {
  for (const theme of THEMES) {
    test(`Users section keeps its row controls reachable (${theme})`, async ({ page }) => {
      // Each row is a justify-between flex: identity on the left, role dropdown and
      // the edit/delete buttons on the right. Inside an overflow-hidden panel at
      // 360px the right-hand cluster was cut off, so an admin on a phone could not
      // change a role or remove an account at all.
      await page.setViewportSize({ width: 360, height: 640 });
      await clearSession(page);
      await useTheme(page, theme);
      await loginAs(page, "admin");

      await page.getByRole("button", { name: /open navigation|menu/i }).first().click();
      await page.getByRole("button", { name: "Users", exact: true }).click();
      await page.waitForTimeout(1500);

      expect(await clippedContent(page), `Users @360 ${theme}`).toEqual([]);

      // The role dropdown is fully on screen, not half past the right edge.
      const roleSelect = page.locator("select").first();
      await expect(roleSelect).toBeVisible();
      const box = await roleSelect.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, "role dropdown runs off the screen").toBeLessThanOrEqual(361);
    });
  }
});
