import { describe, it, expect } from "vitest";
import { landingPathForRole, DEFAULT_LANDING } from "./roleLanding";

/**
 * This mapping was duplicated in three places and the copies disagreed: the homepage's
 * "Get Started" button had no case for HR, so it navigated to "/" - the page already on
 * screen. Now there is one function, and these are its rules.
 */
describe("landingPathForRole", () => {
  it("sends each role to its own page", () => {
    expect(landingPathForRole("Admin")).toBe("/admin");
    expect(landingPathForRole("Pharmacist")).toBe("/pharmacist");
    expect(landingPathForRole("StorageManager")).toBe("/storage");
  });

  it("sends the read-only observer to the view picker, not a dashboard", () => {
    // HR borrows all three dashboards, so it chooses rather than being dropped into one.
    expect(landingPathForRole("HR")).toBe("/hr");
  });

  it("ignores casing and surrounding whitespace", () => {
    // Roles arrive lowercased from AuthContext but capitalised from the login response.
    expect(landingPathForRole("admin")).toBe("/admin");
    expect(landingPathForRole("hr")).toBe("/hr");
    expect(landingPathForRole("  StorageManager  ")).toBe("/storage");
  });

  it("accepts the spaced spelling of storage manager", () => {
    expect(landingPathForRole("storage manager")).toBe("/storage");
  });

  it("falls back to the homepage for anything unrecognised", () => {
    for (const role of ["", "   ", "wizard", undefined, null]) {
      expect(landingPathForRole(role)).toBe(DEFAULT_LANDING);
    }
  });

  it("never returns a path a role cannot open", () => {
    // A typo'd case returning "/admin" would bounce the user through ProtectedRoute
    // back to /login, which reads as a failed sign-in.
    const known = ["Admin", "Pharmacist", "StorageManager", "HR"];
    const paths = known.map(landingPathForRole);

    expect(new Set(paths).size).toBe(known.length);
    expect(paths).not.toContain(DEFAULT_LANDING);
  });
});
