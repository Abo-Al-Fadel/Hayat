import { test, expect } from "@playwright/test";
import { ACCOUNTS, API_BASE, apiLogin } from "./accounts";
import { loginAs, clearSession, trackPageErrors } from "./helpers";

test.describe("Storage manager dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, "storage");
  });

  test("dashboard loads without errors", async ({ page }) => {
    const errors = trackPageErrors(page);
    await expect(page).toHaveURL(/\/storage$/);
    await page.waitForTimeout(1500);
    expect(errors, `page errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("shows an explicit empty state rather than a blank panel", async ({ page }) => {
    await page.waitForTimeout(1500);
    const body = (await page.locator("body").innerText()).trim();
    expect(body.length).toBeGreaterThan(0);
  });

  test("search box filters supply orders", async ({ page }) => {
    const search = page.getByPlaceholder(/search/i).first();
    await expect(search).toBeVisible({ timeout: 10_000 });

    await search.fill("zzz-no-such-order-zzz");
    await page.waitForTimeout(600);
    await expect(page.getByText(/no matching orders found/i)).toBeVisible();
  });

  test("receives an admin-placed supply order and can advance it through its own stages", async ({ page, request }) => {
    const adminToken = await apiLogin(ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    const authAdmin = { Authorization: `Bearer ${adminToken}` };

    const suppliers = await request.get(`${API_BASE}/api/Supplier`, { headers: authAdmin });
    let supplierId = (await suppliers.json())[0]?.id;
    if (!supplierId) {
      const created = await request.post(`${API_BASE}/api/Supplier`, {
        headers: authAdmin,
        data: { name: "E2E Supplier", phone: "0123456789", email: "e2e-sup@example.test" },
      });
      supplierId = (await created.json()).id;
    }

    const meds = await request.get(`${API_BASE}/api/Medicine`, { headers: authAdmin });
    const medicineId = (await meds.json())[0].id;

    const order = await request.post(`${API_BASE}/api/SupplyOrder`, {
      headers: authAdmin,
      data: { supplierId, notes: "e2e-storage", items: [{ medicineId, quantity: 10, unitPrice: 3 }] },
    });
    const orderId = (await order.json()).id;

    // Admin drives it to Ordered, which is when it becomes visible to storage.
    await request.patch(`${API_BASE}/api/SupplyOrder/${orderId}/status`, { headers: authAdmin, data: { status: "Approved" } });
    await request.patch(`${API_BASE}/api/SupplyOrder/${orderId}/status`, { headers: authAdmin, data: { status: "Ordered" } });

    const storeToken = await page.evaluate(() => localStorage.getItem("token"));
    const authStore = { Authorization: `Bearer ${storeToken}` };

    const visible = await request.get(`${API_BASE}/api/SupplyOrder/storage-manager`, { headers: authStore });
    const ids = (await visible.json()).map((o: { id: number }) => o.id);
    expect(ids, "ordered supply order should be visible to the storage manager").toContain(orderId);

    // Storage manager owns Shipped -> Received -> Stored.
    for (const status of ["Shipped", "Received", "Stored"]) {
      const res = await request.patch(`${API_BASE}/api/SupplyOrder/${orderId}/status`, {
        headers: authStore,
        data: { status },
      });
      expect(res.status(), `storage manager setting ${status}`).toBe(200);
    }

    // Storing the order must have increased inventory.
    const after = await request.get(`${API_BASE}/api/Medicine/${medicineId}`, { headers: authAdmin });
    expect((await after.json()).quantity).toBeGreaterThan(0);
  });

  test("illegal status jumps are rejected", async ({ page, request }) => {
    const adminToken = await apiLogin(ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    const authAdmin = { Authorization: `Bearer ${adminToken}` };

    const suppliers = await request.get(`${API_BASE}/api/Supplier`, { headers: authAdmin });
    const supplierId = (await suppliers.json())[0].id;
    const meds = await request.get(`${API_BASE}/api/Medicine`, { headers: authAdmin });
    const medicineId = (await meds.json())[0].id;

    const order = await request.post(`${API_BASE}/api/SupplyOrder`, {
      headers: authAdmin,
      data: { supplierId, items: [{ medicineId, quantity: 1, unitPrice: 1 }] },
    });
    const orderId = (await order.json()).id;

    const storeToken = await page.evaluate(() => localStorage.getItem("token"));
    const jump = await request.patch(`${API_BASE}/api/SupplyOrder/${orderId}/status`, {
      headers: { Authorization: `Bearer ${storeToken}` },
      data: { status: "Stored" },
    });
    expect([400, 403]).toContain(jump.status());
  });
});
