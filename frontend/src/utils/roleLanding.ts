// src/utils/roleLanding.ts
/**
 * Where a role goes when it enters the app.
 *
 * One function because this was written out three separate times - once for a fresh
 * sign-in, once for restoring an existing session, and once for the homepage's
 * "Get Started" button - and they drifted. The homepage copy never learned about HR, so
 * that button silently navigated an HR user to "/", the page they were already on: it
 * looked like a dead button.
 *
 * Anything that needs to answer "where does this user belong?" should call this rather
 * than write the branches again.
 */

/** Fallback for a role we do not recognise: the public homepage. */
export const DEFAULT_LANDING = "/";

export function landingPathForRole(role: string | undefined | null): string {
  switch (role?.trim().toLowerCase()) {
    case "admin":
      return "/admin";
    // HR is read-only across all three dashboards, so it picks which to open rather
    // than being dropped into one. See Pages/HrHome.
    case "hr":
      return "/hr";
    case "pharmacist":
      return "/pharmacist";
    case "storagemanager":
    case "storage manager":
      return "/storage";
    default:
      return DEFAULT_LANDING;
  }
}
