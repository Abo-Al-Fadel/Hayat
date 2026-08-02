import { test, expect, APIRequestContext } from "@playwright/test";
import { ACCOUNTS, API_BASE, apiLogin } from "./accounts";
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

  test("cannot reach another role's dashboard", async ({ page }) => {
    for (const path of ["/pharmacist", "/storage"]) {
      await page.goto(path);
      await expect
        .poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
        .toMatch(/^(\/login|\/admin)$/);
    }
  });
});
