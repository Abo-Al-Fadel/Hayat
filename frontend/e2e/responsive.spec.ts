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

  test("below sm the orders become cards, with every column's data kept", async ({ page }) => {
    // Six columns need ~640px and a phone gives ~330. The table now stops at sm and a
    // card list takes over, so the status control - the only control on this page - is
    // reachable without a sideways swipe. Before the card list it was a table in an
    // overflow-hidden box, and Status and Actions were simply cut off.
    await page.setViewportSize({ width: 360, height: 640 });
    await clearSession(page);
    await loginAs(page, "storage");
    await page.waitForTimeout(1500);

    // No table at this width.
    await expect(page.locator("table")).toBeHidden();

    // Everything the table columns carried is still on screen: order number,
    // supplier, item count, date, status, and the control to advance it.
    // Attribute-contains rather than a class selector: "sm:hidden" needs escaping as
    // a CSS class and the escape is easy to lose.
    const firstCard = page.locator('[class*="sm:hidden"] > div').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await expect(firstCard).toContainText(/#\d+/);
    await expect(firstCard).toContainText("Order Date");
    await expect(firstCard.getByRole("button", { name: /item\(s\)/ })).toBeVisible();

    const statusControl = firstCard.locator("select");
    await expect(statusControl).toBeVisible();

    // The control sits fully inside the screen - the whole point of the change.
    const box = await statusControl.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, "status control runs off a 360px screen").toBeLessThanOrEqual(361);

    // No sideways scrolling anywhere, and nothing amputated.
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    expect(await clippedContent(page)).toEqual([]);

    // Expanding an order still works, and still fits.
    await firstCard.getByRole("button", { name: /item\(s\)/ }).click();
    await expect(firstCard).toContainText("Order Items:");
    await expect(firstCard).toContainText("Status Timeline:");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("the table is still the layout from sm up, and scrolls rather than clips", async ({ page }) => {
    // The card list is a phone affordance, not a replacement. At tablet width and
    // above the table comes back, and its box must scroll - it was overflow-hidden,
    // which is what cut the last two columns off in the first place.
    await page.setViewportSize({ width: 768, height: 1024 });
    await clearSession(page);
    await loginAs(page, "storage");
    await page.waitForTimeout(1500);

    const table = page.locator("table").first();
    await expect(table).toBeVisible({ timeout: 15_000 });

    const scroller = page.locator("div:has(> table)").last();
    const overflowX = await scroller.evaluate((el) => getComputedStyle(el).overflowX);
    expect(["auto", "scroll"], "the table's box must scroll, not clip").toContain(overflowX);

    // Last column header is reachable at this width.
    const lastHeader = page.locator("table thead th").last();
    const box = await lastHeader.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(769);
  });

  test("the card layout offers the read-only observer no control", async ({ page }) => {
    // A new layout is a new place to leak a write control. HR reaches no write
    // endpoint server-side either way, but a control that only ever 403s is a broken
    // button, and the existing readonly sweep checks the table's Actions column -
    // which does not exist at this width.
    await page.setViewportSize({ width: 360, height: 640 });
    await clearSession(page);
    await loginAs(page, "hr");

    await page.goto("/storage");
    await expect(page).toHaveURL(/\/storage$/);
    await expect(page.getByText(/view-only access/i)).toBeVisible();
    await page.waitForTimeout(1500);

    const cards = page.locator('[class*="sm:hidden"] > div');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });

    // The status badge is still shown - HR can see where each order stands.
    await expect(cards.first()).toContainText(/#\d+/);

    // But nothing to change it with.
    await expect(cards.locator("select")).toHaveCount(0);
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

test.describe("Homepage hero", () => {
  for (const size of SMALL_SIZES) {
    test(`the headline and the product image do not collide @${size.name}`, async ({ page }) => {
      // At exactly 768 the md: two-column grid put 72px type in a 288px column. The
      // headline overflowed its own column and the bottle in the next one was painted
      // straight over it - "Pharmacy Stock Management." was unreadable. Nothing failed;
      // it just looked broken, which is the worst kind of bug on a landing page.
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);

      // Measured as text overflowing its own column, not as two rectangles
      // intersecting. The headline's layout box stayed inside its grid column - it was
      // the painted glyphs that spilled out of it and under the image, because
      // sm:whitespace-nowrap forbids wrapping and the type was far too large for the
      // column the md grid had given it. Comparing bounding boxes sees nothing wrong.
      const headline = await page.evaluate(() => {
        const h1 = document.querySelector<HTMLElement>("h1")!;
        return { scrollWidth: h1.scrollWidth, clientWidth: h1.clientWidth };
      });

      expect(
        headline.scrollWidth,
        `the headline needs ${headline.scrollWidth}px but its column is ${headline.clientWidth}px, ` +
          `so it spills over whatever is beside it`
      ).toBeLessThanOrEqual(headline.clientWidth + 1);
    });
  }

  /**
   * How far each painted quote glyph sits from the sentence it belongs to.
   *
   * Measured against the text's own line boxes, via a Range, rather than against the
   * paragraph element. That distinction is the whole point: the paragraph is capped at
   * max-w-lg and the sentence is centred inside it, so a mark pinned to the paragraph's
   * edge can be 90px from the nearest word while still being flush with its container.
   * Comparing against the element sees nothing wrong, which is why the earlier version
   * of this check passed on the broken layout.
   */
  async function quoteMarkGaps(page: Page): Promise<number[]> {
    return page.evaluate(() => {
      const marks = Array.from(document.querySelectorAll<HTMLElement>("span")).filter((s) =>
        /^[“”]$/.test((s.textContent || "").trim())
      );

      return marks
        .filter((m) => m.getBoundingClientRect().width > 0)
        .map((m) => {
          const para = m.closest("p")!;
          const textNode = Array.from(para.childNodes).find(
            (n) => n.nodeType === Node.TEXT_NODE && (n.textContent || "").trim().length > 5
          )!;
          const range = document.createRange();
          range.selectNodeContents(textNode);

          const mark = m.getBoundingClientRect();
          // One rect per line box, so a wrapped sentence is measured against the line
          // the mark actually sits on rather than the full block.
          return Math.min(
            ...Array.from(range.getClientRects()).map((r) => {
              const dx = Math.max(r.left - mark.right, mark.left - r.right, 0);
              const dy = Math.max(r.top - mark.bottom, mark.top - r.bottom, 0);
              return Math.round(Math.hypot(dx, dy));
            })
          );
        });
    });
  }

  for (const size of [
    { name: "360", width: 360, height: 640 },
    { name: "390", width: 390, height: 844 },
    // The width the owner reported from: just above sm, so the absolutely positioned
    // pair was painted and floating ~90px clear of the words on either side.
    { name: "655", width: 655, height: 1080 },
  ]) {
    test(`the quote marks sit against the words, not the container @${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);

      const gaps = await quoteMarkGaps(page);

      expect(gaps.length, "no quote glyph is painted at all at this width").toBeGreaterThan(0);
      for (const gap of gaps) {
        expect(gap, `a quote glyph sits ${gap}px from the nearest word - it reads as stray punctuation`).toBeLessThanOrEqual(12);
      }
    });
  }

  test("the decorative pair is still the one used from md up", async ({ page }) => {
    // The phone fix swaps in inline marks below md. This is the other half of it: the
    // large offset pair the desktop design is built around must still be painted at
    // 768 and above, and only that pair.
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    const painted = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("span"))
        .filter((s) => /^[“”]$/.test((s.textContent || "").trim()))
        .filter((s) => s.getBoundingClientRect().width > 0)
        .map((s) => getComputedStyle(s).position)
    );

    expect(painted, "expected exactly the two absolutely positioned marks").toEqual(["absolute", "absolute"]);
  });
});

test.describe("Public header on a phone", () => {
  // 320 included deliberately: at the md button sizing the four controls need ~313px of
  // it, so this is the width that decides whether the row holds or wraps.
  for (const width of [320, 360, 390, 655]) {
    test(`the logo, both nav entries and the profile control share one row @${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);

      const rows = await page.evaluate(() => {
        const header = document.querySelector("header")!;
        const items = [
          header.querySelector<HTMLElement>('button[aria-label="Hayat home"]')!,
          ...Array.from(header.querySelectorAll<HTMLElement>("nav button")),
          header.querySelector<HTMLElement>("div button")!,
        ];
        // Vertical centres, not tops: the controls are deliberately different heights.
        return items.map((el) => {
          const b = el.getBoundingClientRect();
          return Math.round(b.top + b.height / 2);
        });
      });

      expect(rows).toHaveLength(4);
      const spread = Math.max(...rows) - Math.min(...rows);
      expect(
        spread,
        `the four header controls span ${spread}px vertically, so at least one has wrapped to its own row`
      ).toBeLessThanOrEqual(8);

      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    });
  }
});

test.describe("Tap targets on a phone", () => {
  test("the category chip controls are big enough to hit", async ({ page }) => {
    // Edit and delete sat side by side at 22px square - under WCAG 2.2 SC 2.5.8's
    // 24x24 floor, and next to each other with one of them destructive.
    await page.setViewportSize({ width: 360, height: 640 });
    await clearSession(page);
    await loginAs(page, "admin");
    await page.waitForTimeout(1500);

    const edit = page.getByRole("button", { name: "Edit category" }).first();
    await expect(edit).toBeVisible({ timeout: 15_000 });

    for (const control of [edit, page.locator('button[title^="Delete category"], button[title^="Cannot delete"]').first()]) {
      if ((await control.count()) === 0) continue;
      const box = await control.boundingBox();
      expect(box!.width, `target is only ${box!.width}px wide`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `target is only ${box!.height}px tall`).toBeGreaterThanOrEqual(44);
    }

    // Widening them must not push the category row off the screen.
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    expect(await clippedContent(page)).toEqual([]);
  });
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
      //
      // ":visible" matters: below sm the table is still in the DOM behind a
      // `hidden sm:block`, so a plain .first() picks that layout's select - present,
      // but display:none and unclickable.
      const statusSelect = page.locator("select:visible").first();
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
