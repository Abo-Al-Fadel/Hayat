// src/Services/sessionExpiry.ts
/**
 * One place that decides what happens when the session is no longer usable.
 *
 * Lives outside React so the axios interceptor and raw fetch call sites can share it.
 * Guarded so that a burst of simultaneous 401s (dashboards fire several requests at
 * once) produces exactly one sign-out and one redirect, not a redirect loop.
 */
import { clearSessionStorage } from "../utils/token";

let handling = false;

export function isHandlingSessionExpiry(): boolean {
  return handling;
}

/**
 * Clears the session and sends the user to the login page with a message.
 * Repeat calls while a sign-out is already in flight are ignored.
 */
export function handleSessionExpired(reason: string = "Your session has expired. Please sign in again."): void {
  if (handling) return;
  handling = true;

  clearSessionStorage();

  // Full navigation rather than router navigation: this can fire from outside the
  // React tree, and a hard load guarantees no stale component state survives.
  const alreadyOnLogin = window.location.pathname === "/login";
  if (!alreadyOnLogin) {
    const url = new URL("/login", window.location.origin);
    url.searchParams.set("reason", "expired");
    window.location.replace(url.toString());
  } else {
    handling = false;
  }

  // Surfaced by the login page via the query string; kept here so callers can log it.
  if (process.env.NODE_ENV === "development") {
    console.warn(`[Session] ${reason}`);
  }
}

/** Test/reset hook. */
export function resetSessionExpiryGuard(): void {
  handling = false;
}
