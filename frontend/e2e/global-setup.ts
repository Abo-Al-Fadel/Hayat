import { ACCOUNTS, API_BASE, DEMO_ACCOUNT, apiLogin } from "./accounts";

/**
 * Ensures the three role accounts and a little reference data exist before the
 * suite runs. Idempotent: re-running against the same database is a no-op.
 *
 * Requires an existing Admin to bootstrap from - set E2E_BOOTSTRAP_USER /
 * E2E_BOOTSTRAP_PASS, or configure BootstrapAdmin:* on the API for a fresh database.
 */
export default async function globalSetup() {
  const bootstrapUser = process.env.E2E_BOOTSTRAP_USER ?? ACCOUNTS.admin.username;
  const bootstrapPass = process.env.E2E_BOOTSTRAP_PASS ?? ACCOUNTS.admin.password;

  let adminToken: string;
  try {
    adminToken = await apiLogin(bootstrapUser, bootstrapPass);
  } catch (err) {
    throw new Error(
      `Could not sign in as bootstrap admin '${bootstrapUser}'. ` +
        `Start the API with BootstrapAdmin:* configured, or set E2E_BOOTSTRAP_USER/E2E_BOOTSTRAP_PASS. Cause: ${err}`
    );
  }

  const authed = (extra: Record<string, string> = {}) => ({
    Authorization: `Bearer ${adminToken}`,
    ...extra,
  });

  // Role accounts, plus the published demo account the login page advertises. In
  // production the API seeds that one itself from DemoAccount:*; here it is created the
  // same way as the rest so the suite does not depend on how the API was launched.
  // A duplicate username/email comes back 400, which is fine.
  for (const account of [...Object.values(ACCOUNTS), DEMO_ACCOUNT]) {
    if (account.username === bootstrapUser) continue;
    const res = await fetch(`${API_BASE}/api/Users/create`, {
      method: "POST",
      headers: authed({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        userName: account.username,
        email: `${account.username}@example.test`,
        password: account.password,
        role: account.role,
      }),
    });
    if (!res.ok && res.status !== 400) {
      throw new Error(`Failed to create ${account.username}: ${res.status} ${await res.text()}`);
    }
  }

  // A category and a well-stocked medicine so the Pharmacist has something to sell.
  const catRes = await fetch(`${API_BASE}/api/Categories`, {
    method: "POST",
    headers: authed({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name: "E2E Category" }),
  });
  const categoryId = catRes.ok ? (await catRes.json())?.id : undefined;

  const existing = await fetch(`${API_BASE}/api/Medicine`, { headers: authed() });
  const medicines: Array<{ name: string }> = existing.ok ? await existing.json() : [];

  if (!medicines.some((m) => m.name === "E2E Painkiller")) {
    const form = new FormData();
    form.append("Name", "E2E Painkiller");
    form.append("Price", "12.50");
    form.append("Quantity", "500");
    if (categoryId) form.append("CategoryId", String(categoryId));

    const res = await fetch(`${API_BASE}/api/Medicine`, {
      method: "POST",
      headers: authed(),
      body: form,
    });
    if (!res.ok) throw new Error(`Failed to seed medicine: ${res.status} ${await res.text()}`);
  }

  // A supplier and one supply order sitting in the Storage Manager's queue.
  //
  // Without this the storage dashboard is empty on a fresh database, and every test
  // that looks at a supply order row - the responsive layout checks in particular -
  // finds the "No pending supply orders" placeholder instead. That passed locally for
  // a long time purely because a development database accumulates orders from earlier
  // runs; CI builds its database from nothing on every push, so it did not.
  //
  // Idempotent like the rest of this file: if the queue already has something in it,
  // nothing is created.
  const storageQueue = await fetch(`${API_BASE}/api/SupplyOrder/storage-manager`, {
    headers: authed(),
  });
  const queued: unknown[] = storageQueue.ok ? await storageQueue.json() : [];

  if (queued.length === 0) {
    const suppliersRes = await fetch(`${API_BASE}/api/Supplier`, { headers: authed() });
    const suppliers: Array<{ id: number; name: string }> = suppliersRes.ok
      ? await suppliersRes.json()
      : [];

    let supplierId = suppliers.find((s) => s.name === "E2E Supplier")?.id ?? suppliers[0]?.id;

    if (!supplierId) {
      const created = await fetch(`${API_BASE}/api/Supplier`, {
        method: "POST",
        headers: authed({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: "E2E Supplier",
          phone: "0123456789",
          email: "e2e-supplier@example.test",
        }),
      });
      if (!created.ok) {
        throw new Error(`Failed to seed supplier: ${created.status} ${await created.text()}`);
      }
      supplierId = (await created.json()).id;
    }

    const medsRes = await fetch(`${API_BASE}/api/Medicine`, { headers: authed() });
    const meds: Array<{ id: number; name: string }> = medsRes.ok ? await medsRes.json() : [];
    const medicineId = meds.find((m) => m.name === "E2E Painkiller")?.id ?? meds[0]?.id;

    if (!medicineId) throw new Error("No medicine to put on a seeded supply order.");

    const orderRes = await fetch(`${API_BASE}/api/SupplyOrder`, {
      method: "POST",
      headers: authed({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        supplierId,
        notes: "e2e-seed",
        items: [{ medicineId, quantity: 20, unitPrice: 4.5 }],
      }),
    });
    if (!orderRes.ok) {
      throw new Error(`Failed to seed supply order: ${orderRes.status} ${await orderRes.text()}`);
    }
    const orderId = (await orderRes.json()).id;

    // Created -> Approved -> Ordered. Both are Admin transitions, and "Ordered" is the
    // first state GetOrdersForStorageManagerAsync returns, so this is the earliest
    // point the order shows up for the Storage Manager - and it is still advanceable,
    // which the status-confirmation tests need.
    for (const status of ["Approved", "Ordered"]) {
      const res = await fetch(`${API_BASE}/api/SupplyOrder/${orderId}/status`, {
        method: "PATCH",
        headers: authed({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        throw new Error(`Failed to advance seeded order to ${status}: ${res.status} ${await res.text()}`);
      }
    }
  }

  // Verify every account can actually authenticate before the suite starts.
  for (const account of [...Object.values(ACCOUNTS), DEMO_ACCOUNT]) {
    await apiLogin(account.username, account.password);
  }
}
