import { describe, test, expect, beforeEach } from "vitest";
import {
  decodeToken,
  isTokenExpired,
  millisecondsUntilExpiry,
  getValidToken,
  clearSessionStorage,
  TOKEN_KEY,
  USER_KEY,
} from "./token";

/** Builds a well-formed JWT with the given expiry offset in seconds. */
function tokenExpiringIn(seconds: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return [
    b64({ alg: "HS256", typ: "JWT" }),
    b64({ sub: "user", exp: Math.floor(Date.now() / 1000) + seconds }),
    "signature",
  ].join(".");
}

describe("decodeToken", () => {
  test("reads the payload of a well-formed token", () => {
    const payload = decodeToken(tokenExpiringIn(3600));
    expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  test("returns null for junk rather than throwing", () => {
    expect(decodeToken("not-a-jwt")).toBeNull();
    expect(decodeToken("")).toBeNull();
    expect(decodeToken("a.b.c")).toBeNull();
  });
});

describe("isTokenExpired", () => {
  test("a future token is not expired", () => {
    expect(isTokenExpired(tokenExpiringIn(3600))).toBe(false);
  });

  test("a past token is expired", () => {
    expect(isTokenExpired(tokenExpiringIn(-60))).toBe(true);
  });

  test("a missing token counts as expired", () => {
    expect(isTokenExpired(null)).toBe(true);
  });

  test("a malformed token counts as expired rather than being trusted", () => {
    expect(isTokenExpired("garbage")).toBe(true);
  });

  test("a token with no exp claim is not trusted indefinitely", () => {
    const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "");
    const noExp = `${b64({ alg: "HS256" })}.${b64({ sub: "user" })}.sig`;
    expect(isTokenExpired(noExp)).toBe(true);
  });

  test("expires slightly early so we log out before the server starts rejecting", () => {
    // 2s of life left, with the default 5s skew.
    expect(isTokenExpired(tokenExpiringIn(2))).toBe(true);
  });
});

describe("millisecondsUntilExpiry", () => {
  test("reports remaining lifetime", () => {
    const ms = millisecondsUntilExpiry(tokenExpiringIn(120));
    expect(ms).toBeGreaterThan(110_000);
    expect(ms).toBeLessThanOrEqual(120_000);
  });

  test("never reports negative time", () => {
    expect(millisecondsUntilExpiry(tokenExpiringIn(-500))).toBe(0);
  });
});

describe("getValidToken", () => {
  beforeEach(() => localStorage.clear());

  test("returns a live token", () => {
    const token = tokenExpiringIn(3600);
    localStorage.setItem(TOKEN_KEY, token);
    expect(getValidToken()).toBe(token);
  });

  test("returns null for an expired token - the cause of the stale-session bug", () => {
    localStorage.setItem(TOKEN_KEY, tokenExpiringIn(-10));
    expect(getValidToken()).toBeNull();
  });
});

describe("clearSessionStorage", () => {
  test("removes every session key", () => {
    localStorage.setItem(TOKEN_KEY, "t");
    localStorage.setItem(USER_KEY, "u");
    localStorage.setItem("categories_cache", "c");
    localStorage.setItem("products", "p");

    clearSessionStorage();

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(localStorage.getItem("categories_cache")).toBeNull();
    expect(localStorage.getItem("products")).toBeNull();
  });
});
