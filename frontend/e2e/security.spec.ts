import { test, expect, APIRequestContext } from "@playwright/test";
import { ACCOUNTS, API_BASE, apiLogin } from "./accounts";
import { loginAs, clearSession } from "./helpers";

/**
 * Abuse paths, probed against the running API rather than reasoned about.
 *
 * Role isolation lives in roles.spec.ts; this covers the rest: anonymous access,
 * privilege escalation, tampering with someone else's data, business rules that
 * protect stock and money, and injection through user-supplied strings.
 */

/** Tokens are fetched once per role and reused; a login per assertion is just noise. */
const tokenCache = new Map<string, Promise<string>>();

function tokenFor(role: keyof typeof ACCOUNTS): Promise<string> {
  if (!tokenCache.has(role)) {
    tokenCache.set(role, apiLogin(ACCOUNTS[role].username, ACCOUNTS[role].password));
  }
  return tokenCache.get(role)!;
}

async function auth(role: keyof typeof ACCOUNTS): Promise<{ Authorization: string }> {
  return { Authorization: `Bearer ${await tokenFor(role)}` };
}

test.describe("Anonymous access", () => {
  const PROTECTED = [
    "/api/Medicine",
    "/api/Categories",
    "/api/Order",
    "/api/Stock",
    "/api/Users",
    "/api/Stats/financial",
    "/api/Stats/suggest-price?cost=10",
    "/api/Stats/suggest-purchase-price?sellPrice=50&quantity=100",
    "/api/Supplier",
    "/api/SupplyOrder",
    "/api/Notifications",
  ];

  for (const path of PROTECTED) {
    test(`GET ${path} refuses an anonymous caller`, async ({ request }) => {
      const res = await request.get(`${API_BASE}${path}`);
      expect(res.status(), `${path} should be 401`).toBe(401);
    });
  }

  test("writing without a token is refused everywhere", async ({ request }) => {
    const writes: Array<[string, Record<string, unknown>]> = [
      ["/api/Categories", { name: "anon" }],
      ["/api/Order", { items: [{ medicineId: 1, quantity: 1 }] }],
      ["/api/Users/create", { userName: "anon", email: "a@b.test", password: "Aa1!aaaa", role: "Admin" }],
    ];
    for (const [path, body] of writes) {
      const res = await request.post(`${API_BASE}${path}`, { data: body });
      expect(res.status(), `${path} should be 401`).toBe(401);
    }
  });
});

test.describe("Token integrity", () => {
  test("a token signed with a different key is rejected", async ({ request }) => {
    // Header and payload copied from a real token, re-signed with an attacker key.
    const [header, payload] = (await tokenFor("admin")).split(".");
    const forged = `${header}.${payload}.${"A".repeat(43)}`;

    const res = await request.get(`${API_BASE}/api/Users`, {
      headers: { Authorization: `Bearer ${forged}` },
    });
    expect(res.status()).toBe(401);
  });

  test("the alg=none downgrade is rejected", async ({ request }) => {
    const b64 = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    const payload = JSON.parse(
      Buffer.from((await tokenFor("pharmacist")).split(".")[1], "base64").toString()
    );
    payload.role = "Admin";
    const noneToken = `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.`;

    const res = await request.get(`${API_BASE}/api/Users`, {
      headers: { Authorization: `Bearer ${noneToken}` },
    });
    expect(res.status()).toBe(401);
  });

  test("a pharmacist token with the role claim rewritten does not become admin", async ({ request }) => {
    const [header, payload, signature] = (await tokenFor("pharmacist")).split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
    for (const key of Object.keys(decoded)) {
      if (key.toLowerCase().includes("role")) decoded[key] = "Admin";
    }
    const tampered = `${header}.${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${signature}`;

    const res = await request.get(`${API_BASE}/api/Users`, {
      headers: { Authorization: `Bearer ${tampered}` },
    });
    expect(res.status()).toBe(401);
  });

  test("a garbage Authorization header does not crash the API", async ({ request }) => {
    for (const value of ["Bearer", "Bearer ", "Bearer ....", "Basic YWRtaW46YWRtaW4=", "'; DROP TABLE Users--"]) {
      const res = await request.get(`${API_BASE}/api/Medicine`, {
        headers: { Authorization: value },
      });
      expect([400, 401]).toContain(res.status());
    }
  });
});

test.describe("Privilege escalation", () => {
  test("a pharmacist cannot create an account", async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/Users/create`, {
      headers: await auth("pharmacist"),
      data: { userName: "escalated", email: "e@b.test", password: "Aa1!aaaa", role: "Admin" },
    });
    expect(res.status()).toBe(403);
  });

  test("a storage manager cannot list or change users", async ({ request }) => {
    expect((await request.get(`${API_BASE}/api/Users`, { headers: await auth("storage") })).status()).toBe(403);
    expect(
      (await request.put(`${API_BASE}/api/Users/anything`, {
        headers: await auth("storage"),
        data: { role: "Admin" },
      })).status()
    ).toBe(403);
  });

  test("a pharmacist cannot change prices or delete medicines", async ({ request }) => {
    const meds = await request.get(`${API_BASE}/api/Medicine`, { headers: await auth("pharmacist") });
    const id = (await meds.json())[0].id;

    const form = new URLSearchParams({ Name: "hacked", Price: "0.01" });
    const put = await request.put(`${API_BASE}/api/Medicine/${id}`, {
      headers: { ...await auth("pharmacist"), "Content-Type": "application/x-www-form-urlencoded" },
      data: form.toString(),
    });
    expect(put.status()).toBe(403);

    const del = await request.delete(`${API_BASE}/api/Medicine/${id}`, { headers: await auth("pharmacist") });
    expect(del.status()).toBe(403);
  });

  test("a pharmacist cannot adjust stock levels directly", async ({ request }) => {
    const meds = await request.get(`${API_BASE}/api/Medicine`, { headers: await auth("pharmacist") });
    const id = (await meds.json())[0].id;

    const res = await request.put(`${API_BASE}/api/Stock/${id}/adjust`, {
      headers: await auth("pharmacist"),
      data: { quantity: 99999 },
    });
    expect(res.status()).toBe(403);
  });

  test("money figures stay Admin-only", async ({ request }) => {
    for (const role of ["pharmacist", "storage"] as const) {
      for (const path of ["/api/Stats/financial", "/api/Stats/suggest-purchase-price?sellPrice=50"]) {
        const res = await request.get(`${API_BASE}${path}`, { headers: await auth(role) });
        expect(res.status(), `${role} -> ${path}`).toBe(403);
      }
    }
  });
});

test.describe("Business rules that protect stock and money", () => {
  async function stockOf(request: APIRequestContext, id: number): Promise<number> {
    const res = await request.get(`${API_BASE}/api/Medicine/${id}`, { headers: await auth("admin") });
    return (await res.json()).quantity;
  }

  async function sellableMedicine(request: APIRequestContext) {
    const res = await request.get(`${API_BASE}/api/Medicine`, { headers: await auth("admin") });
    const list: Array<{ id: number; quantity: number; name: string }> = await res.json();
    const found = list.find((m) => m.quantity > 5);
    expect(found, "need a stocked medicine to test against").toBeTruthy();
    return found!;
  }

  test("a zero or negative quantity is refused, and stock is untouched", async ({ request }) => {
    const medicine = await sellableMedicine(request);
    const before = await stockOf(request, medicine.id);

    for (const quantity of [0, -1, -1000]) {
      const res = await request.post(`${API_BASE}/api/Order`, {
        headers: await auth("pharmacist"),
        data: { items: [{ medicineId: medicine.id, quantity }] },
      });
      expect(res.status(), `quantity ${quantity}`).toBeGreaterThanOrEqual(400);
      expect(res.status()).toBeLessThan(500);
    }

    expect(await stockOf(request, medicine.id)).toBe(before);
  });

  test("selling more than exists is refused rather than driving stock negative", async ({ request }) => {
    const medicine = await sellableMedicine(request);
    const before = await stockOf(request, medicine.id);

    const res = await request.post(`${API_BASE}/api/Order`, {
      headers: await auth("pharmacist"),
      data: { items: [{ medicineId: medicine.id, quantity: before + 1_000 }] },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(await stockOf(request, medicine.id)).toBe(before);
  });

  test("concurrent sales cannot oversell the same unit", async ({ request }) => {
    // Drive stock to a known small number, then fire more orders than there is stock.
    const medicine = await sellableMedicine(request);
    // The endpoint sets an absolute level and binds a bare integer, not an object.
    await request.put(`${API_BASE}/api/Stock/${medicine.id}/adjust`, {
      headers: { ...(await auth("admin")), "Content-Type": "application/json" },
      data: "5",
    });
    expect(await stockOf(request, medicine.id), "stock should be set to exactly 5").toBe(5);

    // Header resolved up front so all ten requests genuinely go out together.
    const pharmacistHeaders = await auth("pharmacist");
    const attempts = Array.from({ length: 10 }, () =>
      request.post(`${API_BASE}/api/Order`, {
        headers: pharmacistHeaders,
        data: { items: [{ medicineId: medicine.id, quantity: 1 }] },
      })
    );
    const results = await Promise.all(attempts);
    const succeeded = results.filter((r) => r.ok()).length;

    expect(succeeded, "no more sales than there were units").toBeLessThanOrEqual(5);
    const after = await stockOf(request, medicine.id);
    expect(after, "stock must never go negative").toBeGreaterThanOrEqual(0);
    expect(after).toBe(5 - succeeded);

    // Restore something usable for the rest of the suite.
    await request.put(`${API_BASE}/api/Stock/${medicine.id}/adjust`, {
      headers: { ...(await auth("admin")), "Content-Type": "application/json" },
      data: "500",
    });
  });

  test("an unknown medicine id does not create a phantom order", async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/Order`, {
      headers: await auth("pharmacist"),
      data: { items: [{ medicineId: 999_999_999, quantity: 1 }] },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("an empty basket is refused", async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/Order`, {
      headers: await auth("pharmacist"),
      data: { items: [] },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("the suggested purchase price is never at or above the sell price", async ({ request }) => {
    for (const sellPrice of [4, 12, 50, 100, 250, 1000]) {
      for (const quantity of [1, 50, 200, 1000, 100000]) {
        const res = await request.get(
          `${API_BASE}/api/Stats/suggest-purchase-price?sellPrice=${sellPrice}&quantity=${quantity}`,
          { headers: await auth("admin") }
        );
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(body.suggestedUnitPrice, `sell ${sellPrice} x ${quantity}`).toBeLessThan(sellPrice);
        expect(body.suggestedUnitPrice).toBeGreaterThan(0);
      }
    }
  });

  test("pricing endpoints reject nonsense input instead of returning nonsense", async ({ request }) => {
    const bad = [
      "/api/Stats/suggest-purchase-price?sellPrice=-1",
      "/api/Stats/suggest-purchase-price?sellPrice=50&quantity=0",
      "/api/Stats/suggest-purchase-price?sellPrice=50&quantity=-5",
      "/api/Stats/suggest-price?cost=-1",
      "/api/Stats/financial?from=2030-01-01&to=2020-01-01",
    ];
    for (const path of bad) {
      const res = await request.get(`${API_BASE}${path}`, { headers: await auth("admin") });
      expect(res.status(), path).toBe(400);
    }
  });
});

test.describe("Injection and untrusted input", () => {
  test("SQL metacharacters in search are treated as text", async ({ request }) => {
    const payloads = [
      "' OR 1=1--",
      "'; DROP TABLE Medicines;--",
      "\" UNION SELECT * FROM AspNetUsers--",
      "%' AND 1=1--",
    ];
    for (const payload of payloads) {
      const res = await request.get(
        `${API_BASE}/api/Medicine/search?name=${encodeURIComponent(payload)}`,
        { headers: await auth("pharmacist") }
      );
      expect(res.status(), payload).toBe(200);
      expect(Array.isArray(await res.json()), payload).toBe(true);
    }

    // The table is still there.
    const after = await request.get(`${API_BASE}/api/Medicine`, { headers: await auth("admin") });
    expect(after.ok()).toBeTruthy();
    expect((await after.json()).length).toBeGreaterThan(0);
  });

  test("a script tag in a medicine name is rendered as text, not executed", async ({ page, request }) => {
    const marker = `XSS${Date.now()}`;
    const hostile = `<img src=x onerror="window.__xss='${marker}'">`;

    const form = new FormData();
    form.append("Name", hostile);
    form.append("Price", "9.99");
    form.append("Quantity", "3");
    const created = await request.post(`${API_BASE}/api/Medicine`, {
      headers: await auth("admin"),
      multipart: { Name: hostile, Price: "9.99", Quantity: "3" },
    });
    expect(created.ok(), `seeding hostile name: ${created.status()}`).toBeTruthy();
    const id = (await created.json()).id;

    try {
      await clearSession(page);
      await loginAs(page, "admin");
      await page.getByRole("button", { name: "Products", exact: true }).click();
      await page.waitForTimeout(1500);

      // React escapes text nodes; the payload must never have run.
      expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__xss)).toBeUndefined();
      expect(await page.locator("img[src='x']").count()).toBe(0);
    } finally {
      await request.delete(`${API_BASE}/api/Medicine/${id}`, { headers: await auth("admin") });
    }
  });

  test("an over-long name is rejected or stored safely, never a 500", async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/Medicine`, {
      headers: await auth("admin"),
      multipart: { Name: "A".repeat(10_000), Price: "1.00", Quantity: "1" },
    });
    expect(res.status(), "should be a clean validation failure").toBeLessThan(500);
    if (res.ok()) {
      await request.delete(`${API_BASE}/api/Medicine/${(await res.json()).id}`, { headers: await auth("admin") });
    }
  });
});

test.describe("Information disclosure", () => {
  test("login does not reveal whether a username exists", async ({ request }) => {
    const wrongPassword = await request.post(`${API_BASE}/api/Auth/login`, {
      data: { userName: ACCOUNTS.admin.username, password: "definitely-not-the-password" },
    });
    const unknownUser = await request.post(`${API_BASE}/api/Auth/login`, {
      data: { userName: "no-such-user-at-all", password: "definitely-not-the-password" },
    });

    expect(wrongPassword.status()).toBe(unknownUser.status());
    expect(await wrongPassword.text()).toBe(await unknownUser.text());
  });

  test("errors do not leak stack traces or connection strings", async ({ request }) => {
    const probes = [
      "/api/Medicine/not-a-number",
      "/api/Medicine/999999999",
      "/api/Order/999999999/invoice",
    ];
    for (const path of probes) {
      const res = await request.get(`${API_BASE}${path}`, { headers: await auth("admin") });
      const body = await res.text();
      expect(body, path).not.toMatch(/Data Source=|Initial Catalog=|Password=/i);
      expect(body, path).not.toMatch(/at Microsoft\.EntityFrameworkCore|StackTrace/i);
    }
  });

  test("password hashes are never returned by the users endpoint", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/Users`, { headers: await auth("admin") });
    const body = await res.text();
    expect(body).not.toMatch(/passwordHash|securityStamp|concurrencyStamp/i);
  });

  test("a real recorded cost is withheld from a pharmacist", async ({ request }) => {
    // Asserting costPrice is null proves nothing unless a cost actually exists, so
    // one is recorded first through the real supply-order flow.
    const admin = await auth("admin");
    const storage = await auth("storage");

    const suppliers = await request.get(`${API_BASE}/api/Supplier`, { headers: admin });
    let supplierId = (await suppliers.json())[0]?.id;
    if (!supplierId) {
      const created = await request.post(`${API_BASE}/api/Supplier`, {
        headers: admin,
        data: { name: "E2E Cost Supplier", phone: "0123456789", email: "cost@example.test" },
      });
      supplierId = (await created.json()).id;
    }

    const meds = await request.get(`${API_BASE}/api/Medicine`, { headers: admin });
    const medicineId = (await meds.json())[0].id;

    const order = await request.post(`${API_BASE}/api/SupplyOrder`, {
      headers: admin,
      data: { supplierId, notes: "e2e-cost-leak", items: [{ medicineId, quantity: 10, unitPrice: 7.25 }] },
    });
    const orderId = (await order.json()).id;

    for (const [headers, status] of [
      [admin, "Approved"],
      [admin, "Ordered"],
      [storage, "Shipped"],
      [storage, "Received"],
      [storage, "Stored"],
    ] as const) {
      const res = await request.patch(`${API_BASE}/api/SupplyOrder/${orderId}/status`, {
        headers,
        data: { status },
      });
      expect(res.status(), `advancing to ${status}`).toBe(200);
    }

    // The admin can see what it cost.
    const asAdmin = await request.get(`${API_BASE}/api/Medicine/${medicineId}`, { headers: admin });
    expect((await asAdmin.json()).costPrice, "admin should see the recorded cost").toBeGreaterThan(0);

    // The pharmacist must not, by field or by value, on either endpoint.
    for (const path of [`/api/Medicine`, `/api/Medicine/${medicineId}`]) {
      const res = await request.get(`${API_BASE}${path}`, { headers: await auth("pharmacist") });
      const body = await res.text();
      expect(body, `${path} leaked the purchase price`).not.toContain("7.25");

      const payload = await res.json();
      const list = Array.isArray(payload) ? payload : [payload];
      for (const medicine of list) {
        expect(medicine.costPrice ?? null, `${path} costPrice`).toBeNull();
        expect(medicine.markupPercent ?? null, `${path} markupPercent`).toBeNull();
      }
    }
  });
});

test.describe("Cross-origin policy", () => {
  test("an unlisted origin is not granted credentialed access", async ({ request }) => {
    const res = await request.fetch(`${API_BASE}/api/Medicine`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      },
    });
    expect(res.headers()["access-control-allow-origin"]).toBeUndefined();
  });

  test("the configured origin is allowed", async ({ request }) => {
    const res = await request.fetch(`${API_BASE}/api/Medicine`, {
      method: "OPTIONS",
      headers: {
        Origin: process.env.E2E_WEB_BASE ?? "http://localhost:3001",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      },
    });
    expect(res.headers()["access-control-allow-origin"]).toBeTruthy();
    // Credentialed CORS forbids a wildcard, which SignalR needs.
    expect(res.headers()["access-control-allow-origin"]).not.toBe("*");
  });
});
