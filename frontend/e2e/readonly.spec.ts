import { test, expect, APIRequestContext } from "@playwright/test";
import { ACCOUNTS, API_BASE, DEMO_ACCOUNT, apiLogin } from "./accounts";
import { loginAs, clearSession, trackPageErrors } from "./helpers";

/**
 * The HR role: sees every page, changes nothing.
 *
 * The UI hides the controls, but that is courtesy. What makes the role safe is the
 * server refusing every write, so most of this file talks to the API directly and
 * ignores the interface entirely - a hidden button proves nothing about a caller
 * holding a valid HR token and a copy of curl.
 */

const tokenCache = new Map<string, Promise<string>>();

function tokenFor(role: keyof typeof ACCOUNTS): Promise<string> {
  if (!tokenCache.has(role)) {
    tokenCache.set(role, apiLogin(ACCOUNTS[role].username, ACCOUNTS[role].password));
  }
  return tokenCache.get(role)!;
}

async function auth(role: keyof typeof ACCOUNTS) {
  return { Authorization: `Bearer ${await tokenFor(role)}` };
}

/** Something that exists, so a rejection is about permission and not a missing row. */
async function firstMedicineId(request: APIRequestContext): Promise<number> {
  const res = await request.get(`${API_BASE}/api/Medicine`, { headers: await auth("admin") });
  return (await res.json())[0].id;
}

test.describe("HR can read every page", () => {
  const READABLE = [
    "/api/Medicine",
    "/api/Categories",
    "/api/Order",
    "/api/Stock",
    "/api/Stock/low-stock",
    "/api/Supplier",
    "/api/SupplyOrder",
    "/api/SupplyOrder/active",
    // Was guarded by a write policy, so HR (and Admin) got a 403 on a pure read.
    "/api/SupplyOrder/storage-manager",
    "/api/Users",
    "/api/Notifications",
    "/api/Stats/financial",
    "/api/Stats/suggest-price?cost=10",
    "/api/Stats/suggest-purchase-price?sellPrice=50&quantity=100",
  ];

  for (const path of READABLE) {
    test(`GET ${path} is allowed`, async ({ request }) => {
      const res = await request.get(`${API_BASE}${path}`, { headers: await auth("hr") });
      expect(res.status(), `${path} should be readable by HR`).toBe(200);
    });
  }
});

test.describe("HR cannot change anything", () => {
  test("cannot create, edit, hide, rename or delete a medicine", async ({ request }) => {
    const headers = await auth("hr");
    const id = await firstMedicineId(request);

    const attempts = [
      request.post(`${API_BASE}/api/Medicine`, {
        headers,
        multipart: { Name: "hr-created", Price: "1", Quantity: "1" },
      }),
      request.put(`${API_BASE}/api/Medicine/${id}`, {
        headers,
        multipart: { Name: "hr-renamed", Price: "0.01", Quantity: "1" },
      }),
      request.patch(`${API_BASE}/api/Medicine/${id}/visibility`, { headers, data: { isHidden: true } }),
      request.patch(`${API_BASE}/api/Medicine/${id}/name`, { headers, data: { name: "hr-renamed" } }),
      request.delete(`${API_BASE}/api/Medicine/${id}`, { headers }),
    ];

    for (const res of await Promise.all(attempts)) {
      expect(res.status(), `${res.url()} should be forbidden`).toBe(403);
    }
  });

  test("cannot create, edit or delete a category", async ({ request }) => {
    const headers = await auth("hr");
    const cats = await request.get(`${API_BASE}/api/Categories`, { headers });
    const id = (await cats.json())[0]?.id ?? 1;

    for (const res of await Promise.all([
      request.post(`${API_BASE}/api/Categories`, { headers, data: { name: "hr-category" } }),
      request.put(`${API_BASE}/api/Categories/${id}`, { headers, data: { name: "hr-renamed" } }),
      request.delete(`${API_BASE}/api/Categories/${id}`, { headers }),
    ])) {
      expect(res.status()).toBe(403);
    }
  });

  test("cannot sell, or touch an existing order", async ({ request }) => {
    const headers = await auth("hr");
    const id = await firstMedicineId(request);

    for (const res of await Promise.all([
      request.post(`${API_BASE}/api/Order`, { headers, data: { items: [{ medicineId: id, quantity: 1 }] } }),
      request.delete(`${API_BASE}/api/Order/1`, { headers }),
      request.delete(`${API_BASE}/api/Order/1/item/1`, { headers }),
    ])) {
      expect(res.status()).toBe(403);
    }
  });

  test("cannot adjust stock", async ({ request }) => {
    const headers = { ...(await auth("hr")), "Content-Type": "application/json" };
    const id = await firstMedicineId(request);

    const res = await request.put(`${API_BASE}/api/Stock/${id}/adjust`, { headers, data: "9999" });
    expect(res.status()).toBe(403);
  });

  test("cannot create, edit or delete a supplier", async ({ request }) => {
    const headers = await auth("hr");
    const suppliers = await request.get(`${API_BASE}/api/Supplier`, { headers });
    const id = (await suppliers.json())[0]?.id ?? 1;

    for (const res of await Promise.all([
      request.post(`${API_BASE}/api/Supplier`, { headers, data: { name: "hr-supplier" } }),
      request.put(`${API_BASE}/api/Supplier/${id}`, { headers, data: { name: "hr-renamed" } }),
      request.delete(`${API_BASE}/api/Supplier/${id}`, { headers }),
    ])) {
      expect(res.status()).toBe(403);
    }
  });

  test("cannot place or advance a supply order", async ({ request }) => {
    const headers = await auth("hr");
    const id = await firstMedicineId(request);

    for (const res of await Promise.all([
      request.post(`${API_BASE}/api/SupplyOrder`, {
        headers,
        data: { supplierId: 1, items: [{ medicineId: id, quantity: 1, unitPrice: 1 }] },
      }),
      request.patch(`${API_BASE}/api/SupplyOrder/1/status`, { headers, data: { status: "Approved" } }),
      request.put(`${API_BASE}/api/SupplyOrder/1`, { headers, data: { supplierId: 1, items: [] } }),
      request.delete(`${API_BASE}/api/SupplyOrder/1`, { headers }),
      request.post(`${API_BASE}/api/SupplyOrder/1/mark-received`, { headers }),
    ])) {
      expect(res.status()).toBe(403);
    }
  });

  test("cannot create, edit, delete or re-role a user", async ({ request }) => {
    const headers = await auth("hr");

    for (const res of await Promise.all([
      request.post(`${API_BASE}/api/Users/create`, {
        headers,
        data: { userName: "hrmade", email: "hr@made.test", password: "Aa1!aaaa", role: "Admin" },
      }),
      request.put(`${API_BASE}/api/Users/someone`, { headers, data: { userName: "x" } }),
      request.patch(`${API_BASE}/api/Users/someone/role`, { headers, data: { role: "Admin" } }),
      request.delete(`${API_BASE}/api/Users/someone`, { headers }),
    ])) {
      expect(res.status()).toBe(403);
    }
  });

  test("cannot even mark its own notifications read", async ({ request }) => {
    // "Changes nothing" with no exceptions is easier to reason about, and to test,
    // than a rule with one carve-out nobody remembers.
    const headers = await auth("hr");

    for (const res of await Promise.all([
      request.post(`${API_BASE}/api/Notifications/markread`, { headers, data: [1] }),
      request.post(`${API_BASE}/api/Notifications/markallread`, { headers }),
      request.delete(`${API_BASE}/api/Notifications/1`, { headers }),
    ])) {
      expect(res.status()).toBe(403);
    }
  });

  test("nothing was actually changed by any of the above", async ({ request }) => {
    // The rejections could in principle happen after a partial write. Compare the
    // catalogue either side of a full sweep of attempts.
    const adminHeaders = await auth("admin");
    const before = await (await request.get(`${API_BASE}/api/Medicine`, { headers: adminHeaders })).text();

    const hrHeaders = await auth("hr");
    const id = await firstMedicineId(request);
    await Promise.all([
      request.delete(`${API_BASE}/api/Medicine/${id}`, { headers: hrHeaders }),
      request.patch(`${API_BASE}/api/Medicine/${id}/visibility`, { headers: hrHeaders, data: { isHidden: true } }),
      request.post(`${API_BASE}/api/Medicine`, {
        headers: hrHeaders,
        multipart: { Name: "should-not-exist", Price: "1", Quantity: "1" },
      }),
    ]);

    const after = await (await request.get(`${API_BASE}/api/Medicine`, { headers: adminHeaders })).text();
    expect(after).toBe(before);
    expect(after).not.toContain("should-not-exist");
  });
});

test.describe("HR in the browser", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, "hr");
    // Sign-in now lands on the view picker; these tests are about the admin view.
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("lands on the dashboard and is told it is view-only", async ({ page }) => {
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText(/view-only access/i)).toBeVisible();
  });

  test("every section opens without errors", async ({ page }) => {
    const errors = trackPageErrors(page);

    for (const section of ["Products", "Orders", "Stocks", "Users", "Statistics"]) {
      await page.getByRole("button", { name: section, exact: true }).click();
      await page.waitForTimeout(700);
      await expect(page).toHaveURL(/\/admin$/);
    }

    expect(errors, `page errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("the products page offers nothing that writes", async ({ page }) => {
    await page.getByRole("button", { name: "Products", exact: true }).click();
    await page.waitForTimeout(1200);

    await expect(page.getByRole("button", { name: /^add (product|medicine)/i })).toHaveCount(0);
    await expect(page.getByTitle("Delete product")).toHaveCount(0);
    await expect(page.getByTitle(/^(Hide|Show) product$/)).toHaveCount(0);
    await expect(page.getByTitle("Edit name")).toHaveCount(0);
  });

  test("no product field can be typed into", async ({ page }) => {
    // Hiding the delete button is not enough: an editable price box or a stock
    // stepper is a control too, and using one only earns a 403 from the server.
    await page.getByRole("button", { name: "Products", exact: true }).click();
    await page.waitForTimeout(1500);

    const main = page.locator("main");
    await expect(main.locator("input[type=number]")).toHaveCount(0);
    await expect(main.locator("input[type=file]")).toHaveCount(0);
    await expect(main.locator("select")).toHaveCount(0);
  });

  test("the prices and stock levels are still shown", async ({ page }) => {
    // Read-only must not mean blank: the figures are the reason to open the page.
    await page.getByRole("button", { name: "Products", exact: true }).click();
    await page.waitForTimeout(1500);

    await expect(page.getByText(/^\$\d+\.\d{2}$/).first()).toBeVisible();
  });

  test("the users page offers nothing that writes", async ({ page }) => {
    await page.getByRole("button", { name: "Users", exact: true }).click();
    await page.waitForTimeout(1200);

    await expect(page.getByRole("button", { name: "Add User" })).toHaveCount(0);
    await expect(page.getByTitle("Edit user")).toHaveCount(0);
    await expect(page.getByTitle(/Delete user/)).toHaveCount(0);
  });

  test("the stocks page offers nothing that writes", async ({ page }) => {
    await page.getByRole("button", { name: "Stocks", exact: true }).click();
    await page.waitForTimeout(1200);

    await expect(page.getByRole("button", { name: "New Order" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /add supplier/i })).toHaveCount(0);
    await expect(page.getByTitle("Edit supply stock")).toHaveCount(0);
    await expect(page.getByTitle("Delete order permanently")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Edit .+/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Delete .+/ })).toHaveCount(0);
  });

  test("but the data itself is all visible", async ({ page }) => {
    await page.getByRole("button", { name: "Statistics", exact: true }).click();
    await page.waitForTimeout(1500);
    await expect(page.getByText(/revenue|profit|margin/i).first()).toBeVisible();

    await page.getByRole("button", { name: "Orders", exact: true }).click();
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });
  });

  /**
   * A sweep rather than another named-button check.
   *
   * The tests above name each control they expect to be gone, so a control nobody
   * thought to name stays invisible to them - which is exactly how "Add Category"
   * survived. This walks every section and fails on any button or link whose own label
   * announces that it changes something.
   *
   * Kept to unambiguous verbs, anchored at the start of the label. "Clear" (a local
   * filter), "Close", "Today" and the pagination controls change nothing on the server
   * and are deliberately not listed.
   */
  const WRITE_VERB = /^(add|create|new|delete|remove|edit|rename|save|update|submit|upload|approve|cancel order|checkout|place order)\b/i;

  for (const section of ["Products", "Orders", "Stocks", "Users", "Statistics"]) {
    test(`the ${section} section offers no control that writes`, async ({ page }) => {
      await page.getByRole("button", { name: section, exact: true }).click();
      await page.waitForTimeout(1500);

      const offenders: string[] = [];
      for (const role of ["button", "link"] as const) {
        for (const name of await page.getByRole(role).allTextContents()) {
          const label = name.trim();
          if (WRITE_VERB.test(label)) offenders.push(`${role}: "${label}"`);
        }
      }

      expect(
        offenders,
        `${section} offers a read-only observer these controls:\n  ${offenders.join("\n  ")}`
      ).toEqual([]);
    });
  }

  test("can reach the other dashboards, and they are read-only too", async ({ page }) => {
    // HR is the one role that is not kept out of these. It is allowed to look at all
    // three - the guarantee is that none of them offers it a control.
    await page.goto("/pharmacist");
    await expect(page).toHaveURL(/\/pharmacist$/);
    await expect(page.getByText(/view-only access/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Checkout" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Add .+ to cart$/ })).toHaveCount(0);

    await page.goto("/storage");
    await expect(page).toHaveURL(/\/storage$/);
    await expect(page.getByText(/view-only access/i)).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Actions" })).toHaveCount(0);
  });
});

test.describe("The HR view picker", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, "hr");
  });

  test("signing in lands on the picker, not a dashboard", async ({ page }) => {
    await expect(page).toHaveURL(/\/hr$/);
    await expect(page.getByRole("heading", { name: /choose a view/i })).toBeVisible();
    await expect(page.getByText(/view-only access/i)).toBeVisible();
  });

  test("each of the three views is reachable from it", async ({ page }) => {
    const views: [string, RegExp][] = [
      ["Admin", /\/admin$/],
      ["Pharmacist", /\/pharmacist$/],
      ["Storage Manager", /\/storage$/],
    ];

    for (const [label, url] of views) {
      await page.goto("/hr");
      await page.getByRole("link", { name: new RegExp(`^${label}`) }).click();
      await expect(page).toHaveURL(url, { timeout: 15_000 });
    }
  });

  test("the Products button in the header reaches the picker", async ({ page }) => {
    // The public header kept its own copy of the role mapping and, like the homepage's,
    // had no case for HR - so this button navigated to "/" and did nothing.
    await page.goto("/");
    await page.getByRole("button", { name: "Products", exact: true }).click();
    await expect(page).toHaveURL(/\/hr$/, { timeout: 15_000 });
  });

  test("Get Started on the homepage reaches the picker", async ({ page }) => {
    // The homepage kept its own copy of the role-to-page mapping and never learned
    // about HR, so this button navigated to "/" - the page already on screen - and
    // looked broken.
    await page.goto("/");
    await page.getByRole("button", { name: /get started/i }).click();
    await expect(page).toHaveURL(/\/hr$/, { timeout: 15_000 });
  });

  test("every dashboard offers a way back to the picker", async ({ page }) => {
    // Without this the only route between views is signing out and back in.
    for (const path of ["/admin", "/pharmacist", "/storage"]) {
      await page.goto(path);
      await page.getByRole("link", { name: /switch view/i }).click();
      await expect(page).toHaveURL(/\/hr$/, { timeout: 15_000 });
    }
  });

  // One test per role rather than a loop over a single page. Signing a second role in
  // on the same page means clearing localStorage while the first role's dashboard is
  // still mounted and polling; its next request then finds no token, calls
  // handleSessionExpired, and the resulting hard redirect interrupts whatever
  // navigation the test was in the middle of. Playwright gives each test its own
  // context, so separate tests start genuinely clean.
  for (const role of ["admin", "pharmacist", "storage"] as const) {
    test(`${role} cannot open the picker`, async ({ page }) => {
      await clearSession(page);
      await loginAs(page, role);
      await page.goto("/hr");
      await expect
        .poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
        .not.toBe("/hr");
    });
  }
});

test.describe("The HR role is offered in the UI", () => {
  test("an admin can pick HR when creating a user", async ({ page }) => {
    // The role existed server-side but was missing from both dropdowns, so there was
    // no way to actually give it to anyone.
    await clearSession(page);
    await loginAs(page, "admin");
    await page.getByRole("button", { name: "Users", exact: true }).click();
    await page.getByRole("button", { name: "Add User" }).click();

    const roleSelect = page.locator("select").first();
    await expect(roleSelect.locator('option[value="HR"]')).toHaveCount(1);
  });

  test("an admin can change an existing user to HR", async ({ page }) => {
    await clearSession(page);
    await loginAs(page, "admin");
    await page.getByRole("button", { name: "Users", exact: true }).click();
    await page.waitForTimeout(1200);

    // Every per-user role dropdown must offer it, not just the creation form.
    const rowSelects = page.locator("select");
    const count = await rowSelects.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(rowSelects.nth(i).locator('option[value="HR"]')).toHaveCount(1);
    }
  });
});

/**
 * The published demo account.
 *
 * Its credentials are printed on the login page so a visitor following a CV link can
 * look around. That is safe only for as long as the account cannot write, so these
 * check both halves: that the advertised login works, and that what it buys you is
 * strictly read-only.
 */
test.describe("The public demo account", () => {
  test("the login page advertises it in plain text", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText(DEMO_ACCOUNT.username, { exact: true })).toBeVisible();
    await expect(page.getByText(DEMO_ACCOUNT.password, { exact: true })).toBeVisible();
    await expect(page.getByText(/view-only account/i)).toBeVisible();
  });

  test("the one-click button signs in and lands on the picker", async ({ page }) => {
    await clearSession(page);
    await page.goto("/login");

    await page.getByRole("button", { name: /read-only demo/i }).click();
    await expect(page).toHaveURL(/\/hr$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /choose a view/i })).toBeVisible();
  });

  test("the advertised credentials also work typed in by hand", async ({ page }) => {
    // A visitor who ignores the button and types what is on screen must get the same
    // result, so the panel can never advertise something that does not work.
    await clearSession(page);
    await page.goto("/login");

    await page.getByPlaceholder("Enter your username").fill(DEMO_ACCOUNT.username);
    await page.locator('input[type="password"]').fill(DEMO_ACCOUNT.password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();

    await expect(page).toHaveURL(/\/hr$/, { timeout: 20_000 });
  });

  test("it holds the read-only role and nothing more", async () => {
    const token = await apiLogin(DEMO_ACCOUNT.username, DEMO_ACCOUNT.password);
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    const roles = [payload.role ?? payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"]].flat();

    expect(roles).toEqual(["HR"]);
  });

  test("it cannot change anything, whatever the UI shows", async ({ request }) => {
    // The published password is only harmless because of this.
    const headers = { Authorization: `Bearer ${await apiLogin(DEMO_ACCOUNT.username, DEMO_ACCOUNT.password)}` };

    const attempts = await Promise.all([
      request.post(`${API_BASE}/api/Categories`, { headers, data: { name: "demo-should-fail" } }),
      request.post(`${API_BASE}/api/Supplier`, { headers, data: { name: "demo-should-fail" } }),
      request.post(`${API_BASE}/api/Users/create`, {
        headers,
        data: { userName: "demoEscalation", email: "x@y.test", password: "Str0ng#Pass1", role: "Admin" },
      }),
      request.post(`${API_BASE}/api/Order`, { headers, data: { items: [] } }),
    ]);

    for (const res of attempts) {
      expect(res.status(), `${res.url()} must be refused`).toBe(403);
    }
  });
});
