// src/utils/token.ts
/**
 * JWT helpers.
 *
 * The app previously treated "a token string exists in localStorage" as "signed in".
 * Once the token expired, ProtectedRoute still granted access, the dashboard mounted,
 * and every API call returned 401 - so the page rendered but nothing ever loaded and
 * the only way out was a manual sign-out. These helpers let us detect expiry up front.
 */

export const TOKEN_KEY = "token";
export const USER_KEY = "user";

interface JwtPayload {
  exp?: number; // seconds since epoch
}

/** Decodes the payload of a JWT without verifying it (verification is the server's job). */
export function decodeToken(token: string): JwtPayload | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    // base64url -> base64, then pad.
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join("")
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/** Milliseconds until the token expires. 0 when already expired, malformed, or absent. */
export function millisecondsUntilExpiry(token: string | null): number {
  if (!token) return 0;

  const payload = decodeToken(token);
  // A token with no exp claim cannot be reasoned about; treat it as already expired
  // rather than trusting it indefinitely.
  if (!payload?.exp) return 0;

  return Math.max(0, payload.exp * 1000 - Date.now());
}

/**
 * True when the token is missing, malformed, or past its expiry.
 * A small skew is applied so we log out just before the server starts rejecting.
 */
export function isTokenExpired(token: string | null, skewMs = 5000): boolean {
  if (!token) return true;
  return millisecondsUntilExpiry(token) <= skewMs;
}

/** The stored token, or null when there is none or it has expired. */
export function getValidToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  return isTokenExpired(token) ? null : token;
}

/** Removes all session keys. Safe to call repeatedly. */
export function clearSessionStorage(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem("categories_cache");
  localStorage.removeItem("products");
}
