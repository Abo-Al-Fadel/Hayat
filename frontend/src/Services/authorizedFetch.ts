// src/Services/authorizedFetch.ts
/**
 * `fetch` with the same session rules as the axios client.
 *
 * Some screens call `fetch` directly instead of going through `api`. Those calls used
 * to attach whatever string was in localStorage and ignore a 401 entirely, which is
 * how an expired session produced a dashboard that rendered but never loaded data.
 */
import { getValidToken } from "../utils/token";
import { handleSessionExpired, isHandlingSessionExpiry } from "./sessionExpiry";

export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired");
    this.name = "SessionExpiredError";
  }
}

/**
 * Performs an authenticated request.
 * Throws {@link SessionExpiredError} (after starting sign-out) when the session is
 * missing, expired, or rejected by the server.
 */
export async function authorizedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getValidToken();

  if (!token) {
    handleSessionExpired();
    throw new SessionExpiredError();
  }

  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(input, { ...init, headers });

  if (response.status === 401) {
    if (!isHandlingSessionExpiry()) handleSessionExpired();
    throw new SessionExpiredError();
  }

  return response;
}

/** True when an error came from the session ending, so callers can stay quiet. */
export const isSessionExpiredError = (err: unknown): boolean =>
  err instanceof SessionExpiredError;
