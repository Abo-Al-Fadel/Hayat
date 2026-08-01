export const API_BASE = process.env.E2E_API_BASE ?? "http://localhost:5057";

export const ACCOUNTS = {
  admin: { username: "e2eadmin", password: "E2eAdmin#2026x", role: "Admin", landing: "/admin" },
  pharmacist: { username: "e2epharm", password: "E2ePharm#2026x", role: "Pharmacist", landing: "/pharmacist" },
  storage: { username: "e2estore", password: "E2eStore#2026x", role: "StorageManager", landing: "/storage" },
} as const;

export type RoleKey = keyof typeof ACCOUNTS;

/** All landing pages, used to assert a role cannot reach another role's dashboard. */
export const ALL_LANDINGS: Record<RoleKey, string> = {
  admin: "/admin",
  pharmacist: "/pharmacist",
  storage: "/storage",
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
