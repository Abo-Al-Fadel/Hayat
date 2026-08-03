export const API_BASE = process.env.E2E_API_BASE ?? "http://localhost:5057";

export const ACCOUNTS = {
  admin: { username: "e2eadmin", password: "E2eAdmin#2026x", role: "Admin", landing: "/admin" },
  pharmacist: { username: "e2epharm", password: "E2ePharm#2026x", role: "Pharmacist", landing: "/pharmacist" },
  storage: { username: "e2estore", password: "E2eStore#2026x", role: "StorageManager", landing: "/storage" },
  // Read-only observer. Borrows all three dashboards, so it lands on a view picker
  // rather than a dashboard of its own. Must not be able to change anything.
  hr: { username: "e2ehr", password: "E2eHrView#2026x", role: "HR", landing: "/hr" },
} as const;

/**
 * The published demo account advertised on the login page.
 *
 * Kept out of ACCOUNTS so the role-isolation sweeps do not treat it as a fifth role -
 * it is the same HR role, reached a different way. global-setup creates it, and the
 * front-end build must be given the matching REACT_APP_DEMO_* values for the panel to
 * appear at all.
 */
export const DEMO_ACCOUNT = {
  username: process.env.REACT_APP_DEMO_USER ?? "Hr",
  password: process.env.REACT_APP_DEMO_PASS ?? "Hr123456!",
  role: "HR",
  landing: "/hr",
} as const;

export type RoleKey = keyof typeof ACCOUNTS;

/** All landing pages, used to assert a role cannot reach another role's dashboard. */
export const ALL_LANDINGS: Record<RoleKey, string> = {
  admin: "/admin",
  pharmacist: "/pharmacist",
  storage: "/storage",
  hr: "/hr",
};

export async function apiLogin(username: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/Auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userName: username, password }),
  });
  if (!res.ok) throw new Error(`API login failed for ${username}: ${res.status} ${await res.text()}`);
  return (await res.json()).token as string;
}
