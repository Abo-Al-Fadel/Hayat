import { test, expect, Page } from "@playwright/test";
import { loginAs, clearSession, trackPageErrors } from "./helpers";
import { ACCOUNTS, API_BASE, apiLogin } from "./accounts";

/**
 * Supplier management in the Stocks section.
 *
 * The bug these exist for: the create endpoint returned only { id }, the client
 * appended that to its list as if it were a whole supplier, and clicking edit on the
 * new row called .trim() on an undefined name and crashed the page. It only appeared
 * before a refresh, because a refresh replaced the partial object with a real one.
 */

/** Unique per run so repeat runs against the same database do not collide. */
const uniqueName = (prefix: string) => `${prefix}-${Date.now()}`;

async function openStocks(page: Page) {
  await page.getByRole("button", { name: "Stocks", exact: true }).click();
  // "Suppliers" also labels a stat card, so wait on the panel's own control instead.
  await expect(page.getByRole("button", { name: /add supplier/i }).first()).toBeVisible({
    timeout: 15_000,
  });
}

/** Opens the add form and fills it, without submitting. */
async function fillAddForm(
  page: Page,
  fields: { name?: string; email?: string; phone?: string }
) {
  await page.getByRole("button", { name: /add supplier/i }).first().click();
  if (fields.name !== undefined) await page.getByLabel("Supplier name").fill(fields.name);
  if (fields.email !== undefined) await page.getByLabel("Supplier email").fill(fields.email);
  if (fields.phone !== undefined) await page.getByLabel("Supplier phone").fill(fields.phone);
}

const submitAddForm = (page: Page) =>
  page.getByRole("button", { name: "Save Supplier", exact: true }).click();

/** Removes a supplier through the API so the list does not grow every run. */
async function deleteByName(request: import("@playwright/test").APIRequestContext, name: string) {
  const token = await apiLogin(ACCOUNTS.admin.username, ACCOUNTS.admin.password);
  const res = await request.get(`${API_BASE}/api/Supplier`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const match = (await res.json()).find((s: { name: string }) => s.name === name);
  if (match) {
    await request.delete(`${API_BASE}/api/Supplier/${match.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

test.describe("Supplier validation", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, "admin");
    await openStocks(page);
  });

  test("an empty name is reported, not silently ignored", async ({ page }) => {
    await fillAddForm(page, { name: "" });
    await submitAddForm(page);

    await expect(page.getByText("Supplier name is required.")).toBeVisible();
  });

  test("a malformed email is reported before anything is sent", async ({ page }) => {
    await fillAddForm(page, { name: uniqueName("BadEmail"), email: "not-an-email" });
    await submitAddForm(page);

    await expect(page.getByText(/valid email address/i)).toBeVisible();
    // Nothing was created: the add form is still open.
    await expect(page.getByLabel("Supplier name")).toBeVisible();
  });

  test("a phone number with letters is reported", async ({ page }) => {
    await fillAddForm(page, { name: uniqueName("BadPhone"), phone: "call-me-maybe" });
    await submitAddForm(page);

    await expect(page.getByText(/valid phone number/i)).toBeVisible();
  });

  test("a too-short phone number is reported", async ({ page }) => {
    await fillAddForm(page, { name: uniqueName("ShortPhone"), phone: "12345" });
    await submitAddForm(page);

    await expect(page.getByText(/valid phone number/i)).toBeVisible();
  });

  test("the message clears as soon as the field is corrected", async ({ page }) => {
    await fillAddForm(page, { name: "" });
    await submitAddForm(page);
    await expect(page.getByText("Supplier name is required.")).toBeVisible();

    await page.getByLabel("Supplier name").fill("Corrected");
    await expect(page.getByText("Supplier name is required.")).toHaveCount(0);
  });

  test("every invalid field is reported at once, not one at a time", async ({ page }) => {
    await fillAddForm(page, { name: "", email: "nope", phone: "abc" });
    await submitAddForm(page);

    await expect(page.getByText("Supplier name is required.")).toBeVisible();
    await expect(page.getByText(/valid email address/i)).toBeVisible();
    await expect(page.getByText(/valid phone number/i)).toBeVisible();
  });

  test("optional fields may be left blank", async ({ page, request }) => {
    const name = uniqueName("NameOnly");
    try {
      await fillAddForm(page, { name, email: "", phone: "" });
      await submitAddForm(page);

      await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Supplier name is required.")).toHaveCount(0);
    } finally {
      await deleteByName(request, name);
    }
  });
});

test.describe("Supplier create then edit, without a refresh", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, "admin");
    await openStocks(page);
  });

  test("editing a just-added supplier does not crash the page", async ({ page, request }) => {
    const errors = trackPageErrors(page);
    const name = uniqueName("FreshSupplier");

    try {
      await fillAddForm(page, { name, email: "fresh@supplier.test", phone: "555-123-4567" });
      await submitAddForm(page);
      await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });

      // No reload here on purpose - a refresh is what used to mask the bug.
      await page.getByRole("button", { name: `Edit ${name}` }).click();

      // The React Router error page replaced the whole app when this threw.
      await expect(page.getByText(/Unexpected Application Error/i)).toHaveCount(0);
      expect(errors, `page errors: ${errors.join("; ")}`).toEqual([]);

      // The form is populated from the create response, so every field must be there.
      await expect(page.locator("#edit-supplier-name")).toHaveValue(name);
      await expect(page.locator("#edit-supplier-email")).toHaveValue("fresh@supplier.test");
      await expect(page.locator("#edit-supplier-phone")).toHaveValue("555-123-4567");
    } finally {
      await deleteByName(request, name);
    }
  });

  test("a supplier added without optional fields opens an empty, not undefined, form", async ({
    page,
    request,
  }) => {
    const errors = trackPageErrors(page);
    const name = uniqueName("SparseSupplier");

    try {
      await fillAddForm(page, { name });
      await submitAddForm(page);
      await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: `Edit ${name}` }).click();

      await expect(page.getByText(/Unexpected Application Error/i)).toHaveCount(0);
      expect(errors, `page errors: ${errors.join("; ")}`).toEqual([]);
      await expect(page.locator("#edit-supplier-name")).toHaveValue(name);
      // Absent optional fields must arrive as empty strings, not undefined.
      await expect(page.locator("#edit-supplier-email")).toHaveValue("");
      await expect(page.locator("#edit-supplier-phone")).toHaveValue("");
    } finally {
      await deleteByName(request, name);
    }
  });

  test("the edited name is reflected in the list", async ({ page, request }) => {
    const name = uniqueName("Renamable");
    const renamed = `${name}-renamed`;

    try {
      await fillAddForm(page, { name, email: "rename@supplier.test" });
      await submitAddForm(page);
      await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: `Edit ${name}` }).click();
      await page.locator("#edit-supplier-name").fill(renamed);
      await page.getByRole("button", { name: /save/i }).click();

      await expect(page.getByText(renamed)).toBeVisible({ timeout: 15_000 });
    } finally {
      await deleteByName(request, renamed);
      await deleteByName(request, name);
    }
  });

  test("the edit form rejects a malformed email with the same wording as the add form", async ({
    page,
    request,
  }) => {
    const name = uniqueName("EditValidation");

    try {
      await fillAddForm(page, { name });
      await submitAddForm(page);
      await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: `Edit ${name}` }).click();
      await page.locator("#edit-supplier-email").fill("still-not-an-email");
      await page.getByRole("button", { name: /save/i }).click();

      await expect(page.getByText(/valid email address/i)).toBeVisible();
    } finally {
      await deleteByName(request, name);
    }
  });
});

test.describe("Supplier create API contract", () => {
  test("the create response carries every field, not just the id", async ({ request }) => {
    const token = await apiLogin(ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    const name = uniqueName("ContractCheck");

    const res = await request.post(`${API_BASE}/api/Supplier`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name, email: "contract@supplier.test", phone: "555-999-0000" },
    });

    expect(res.status()).toBe(201);
    const created = await res.json();

    try {
      // The client renders this object directly; a missing field becomes undefined
      // in the UI rather than an error anyone would notice.
      expect(created.id).toBeGreaterThan(0);
      expect(created.name).toBe(name);
      expect(created.email).toBe("contract@supplier.test");
      expect(created.phone).toBe("555-999-0000");
    } finally {
      await request.delete(`${API_BASE}/api/Supplier/${created.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });
});
