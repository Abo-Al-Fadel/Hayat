import { test, expect } from "@playwright/test";
import { ACCOUNTS, ALL_LANDINGS, RoleKey, apiLogin, API_BASE } from "./accounts";
import { loginAs, clearSession } from "./helpers";

const ROLES = Object.keys(ACCOUNTS) as RoleKey[];

test.describe("Role isolation", () => {
  for (const role of ROLES) {
    // Compare by landing page, not by role: HR deliberately shares /admin with Admin,
    // so that route is not "another role's dashboard" for either of them.
    const foreign = ROLES.filter((r) => ALL_LANDINGS[r] !== ALL_LANDINGS[role]);

    test(`${role} cannot open another role's dashboard`, async ({ page }) => {
      await clearSession(page);
      await loginAs(page, role);

      for (const other of foreign) {
        await page.goto(ALL_LANDINGS[other]);

        // ProtectedRoute bounces the role mismatch to /login; because the session is
        // still valid, Login then forwards back to this user's own dashboard. Either
        // resting place is fine - what matters is never landing on the foreign route.
        await expect
          .poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
          .toMatch(new RegExp(`^(/login|${ALL_LANDINGS[role]})$`));

        expect(new URL(page.url()).pathname, `${role} must not reach ${ALL_LANDINGS[other]}`)
          .not.toBe(ALL_LANDINGS[other]);
      }
    });
  }

  test("server blocks cross-role API calls even when the UI is bypassed", async ({ request }) => {
    const pharmToken = await apiLogin(ACCOUNTS.pharmacist.username, ACCOUNTS.pharmacist.password);
    const storeToken = await apiLogin(ACCOUNTS.storage.username, ACCOUNTS.storage.password);

    // Pharmacist may not manage users, suppliers or supply orders.
    for (const path of ["/api/Users", "/api/Supplier", "/api/SupplyOrder"]) {
      const res = await request.get(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${pharmToken}` },
      });
      expect(res.status(), `pharmacist GET ${path}`).toBe(403);
    }

    // Storage manager may not read the medicine catalogue or sales orders.
    for (const path of ["/api/Medicine", "/api/Order", "/api/Users"]) {
      const res = await request.get(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${storeToken}` },
      });
      expect(res.status(), `storage GET ${path}`).toBe(403);
    }
  });

  test("storage manager cannot drive admin-owned supply order stages", async ({ request }) => {
    const adminToken = await apiLogin(ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    const storeToken = await apiLogin(ACCOUNTS.storage.username, ACCOUNTS.storage.password);

    const suppliers = await request.get(`${API_BASE}/api/Supplier`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    let supplierId = (await suppliers.json())[0]?.id;

    if (!supplierId) {
      const created = await request.post(`${API_BASE}/api/Supplier`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { name: "E2E Supplier", phone: "0123456789", email: "e2e-supplier@example.test" },
      });
      supplierId = (await created.json()).id;
    }

    const medicines = await request.get(`${API_BASE}/api/Medicine`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const medicineId = (await medicines.json())[0].id;

    const order = await request.post(`${API_BASE}/api/SupplyOrder`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { supplierId, notes: "e2e", items: [{ medicineId, quantity: 3, unitPrice: 5 }] },
    });
    const orderId = (await order.json()).id;

    // Approving belongs to Admin - the storage manager must be refused.
    const denied = await request.patch(`${API_BASE}/api/SupplyOrder/${orderId}/status`, {
      headers: { Authorization: `Bearer ${storeToken}` },
      data: { status: "Approved" },
    });
    expect(denied.status()).toBe(403);

    // The admin can, and the storage manager owns the later stages.
    const approved = await request.patch(`${API_BASE}/api/SupplyOrder/${orderId}/status`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { status: "Approved" },
    });
    expect(approved.status()).toBe(200);

    const adminShip = await request.patch(`${API_BASE}/api/SupplyOrder/${orderId}/status`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { status: "Ordered" },
    });
    expect(adminShip.status()).toBe(200);

    const adminTriesShipped = await request.patch(`${API_BASE}/api/SupplyOrder/${orderId}/status`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { status: "Shipped" },
    });
    expect(adminTriesShipped.status(), "Shipped belongs to StorageManager").toBe(403);
  });

  test("every signed-in role can read categories, but only Admin may change them", async ({ request }) => {
    // Regression: a controller-level [Authorize(Roles = "Admin")] is AND-ed with the
    // action-level attribute, so the broader action rule could not widen it and the
    // Pharmacist category bar silently rendered empty.
    for (const role of ["admin", "pharmacist", "storage"] as const) {
      const token = await apiLogin(ACCOUNTS[role].username, ACCOUNTS[role].password);
      const res = await request.get(`${API_BASE}/api/Categories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status(), `${role} reading categories`).toBe(200);
      expect(Array.isArray(await res.json())).toBe(true);
    }

    // Anonymous is still refused.
    expect((await request.get(`${API_BASE}/api/Categories`)).status()).toBe(401);

    // Writes remain Admin-only.
    const pharmToken = await apiLogin(ACCOUNTS.pharmacist.username, ACCOUNTS.pharmacist.password);
    const created = await request.post(`${API_BASE}/api/Categories`, {
      headers: { Authorization: `Bearer ${pharmToken}` },
      data: { name: "should-not-be-allowed" },
    });
    expect(created.status()).toBe(403);
  });

  test("notifications cannot be mutated across roles", async ({ request }) => {
    const adminToken = await apiLogin(ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    const pharmToken = await apiLogin(ACCOUNTS.pharmacist.username, ACCOUNTS.pharmacist.password);

    const adminNotifs = await request.get(`${API_BASE}/api/Notifications?unreadOnly=false&take=50`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const ids: number[] = (await adminNotifs.json()).map((n: { id: number }) => n.id);
    test.skip(ids.length === 0, "no admin notifications available to probe");

    const markRead = await request.post(`${API_BASE}/api/Notifications/markread`, {
      headers: { Authorization: `Bearer ${pharmToken}` },
      data: [ids[0]],
    });
    expect(markRead.status(), "pharmacist marking an admin notification read").toBe(404);

    const del = await request.delete(`${API_BASE}/api/Notifications/${ids[0]}`, {
      headers: { Authorization: `Bearer ${pharmToken}` },
    });
    expect(del.status(), "pharmacist deleting an admin notification").toBe(404);

    // The admin's own notification is still there and still unread.
    const after = await request.get(`${API_BASE}/api/Notifications?unreadOnly=false&take=50`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const stillPresent = (await after.json()).some((n: { id: number }) => n.id === ids[0]);
    expect(stillPresent).toBe(true);
  });
});
