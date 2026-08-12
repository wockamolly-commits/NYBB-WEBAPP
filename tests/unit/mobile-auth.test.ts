import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Customer sign-in, without a Supabase project and without a network.
 *
 * What is worth asserting here is not that `signInWithOtp` was called. It is the
 * handful of decisions this service makes on its own, each of which is a real
 * bug if it goes the other way:
 *
 * - the rate limit runs *before* Supabase, or the limiter is decorative;
 * - a wrong code and an expired refresh token are `rejected`, while an outage is
 *   `unavailable`, because the app signs a customer out on the first and retries
 *   on the second;
 * - the address is normalized once, so the limiter's hashed namespace is the
 *   same bucket whether somebody typed `Sam@Example.com ` or `sam@example.com`.
 */

const mocks = vi.hoisted(() => ({
  requestLimit: vi.fn(),
  verifyLimit: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  refreshSession: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  checkOtpRequestLimit: mocks.requestLimit,
  checkOtpVerifyLimit: mocks.verifyLimit,
}));

vi.mock("@/lib/supabase/public-client", () => ({
  supabaseConfigured: () => true,
  createPublicClient: () => ({
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      verifyOtp: mocks.verifyOtp,
      refreshSession: mocks.refreshSession,
    },
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => ({ upsert: mocks.upsert }) }),
}));

import {
  refreshCustomerSession,
  requestCustomerOtp,
  verifyCustomerOtp,
} from "@/lib/customer/auth";

const ALLOWED = { allowed: true } as const;

function session(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requestLimit.mockResolvedValue(ALLOWED);
  mocks.verifyLimit.mockResolvedValue(ALLOWED);
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  mocks.upsert.mockResolvedValue({ error: null });
});

describe("asking for a sign-in code", () => {
  it("refuses an address that is not one, without spending a limiter slot", async () => {
    const result = await requestCustomerOtp({ email: "nope", address: "1.2.3.4" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("email");
    expect(mocks.requestLimit).not.toHaveBeenCalled();
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("counts the address before it asks Supabase for anything", async () => {
    mocks.requestLimit.mockResolvedValue({
      allowed: false,
      message: "Wait 60 seconds before requesting another code.",
    });

    const result = await requestCustomerOtp({ email: "sam@example.com", address: "1.2.3.4" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("limited");
    // The load-bearing assertion. A limiter consulted after the send has
    // already happened stops nothing.
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("lowercases and trims before the limiter sees the address", async () => {
    await requestCustomerOtp({ email: "  Sam@Example.COM ", address: null });

    expect(mocks.requestLimit).toHaveBeenCalledWith("sam@example.com", null);
    expect(mocks.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "sam@example.com" }),
    );
  });

  it("creates an account for a first-time customer, because guests become customers", async () => {
    await requestCustomerOtp({ email: "sam@example.com", address: null });

    expect(mocks.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ options: { shouldCreateUser: true } }),
    );
  });

  it("reports Supabase's own throttle as a limit rather than as a bad address", async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: { status: 429, message: "over_email_rate" } });

    const result = await requestCustomerOtp({ email: "sam@example.com", address: null });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("limited");
      // Not pointed at the email field: the address is fine, the timing is not,
      // and marking the input invalid would send somebody to retype a correct
      // address.
      expect(result.error.field).toBeUndefined();
    }
  });

  it("hands back only timings, never a token", async () => {
    const result = await requestCustomerOtp({ email: "sam@example.com", address: null });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.data).sort()).toEqual([
        "email",
        "expiresAt",
        "resendAvailableAt",
      ]);
      expect(result.data.resendAvailableAt).toBeGreaterThan(Date.now());
      expect(result.data.expiresAt).toBeGreaterThan(result.data.resendAvailableAt);
    }
  });
});

describe("exchanging a code for a session", () => {
  it("refuses anything that is not six digits before it reaches the limiter", async () => {
    const result = await verifyCustomerOtp({
      email: "sam@example.com",
      token: "12ab56",
      address: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("code");
    expect(mocks.verifyLimit).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("tries the other verification types before giving up on a code", async () => {
    mocks.verifyOtp
      .mockResolvedValueOnce({ error: { message: "expired" }, data: {} })
      .mockResolvedValueOnce({
        error: null,
        data: { session: session(), user: { id: "user-1", email: "sam@example.com" } },
      });

    const result = await verifyCustomerOtp({
      email: "sam@example.com",
      token: "123456",
      address: null,
    });

    expect(result.ok).toBe(true);
    // Supabase types the same six digits differently depending on whether the
    // address was already registered. Stopping at the first refusal would fail
    // every first-time sign-in.
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(2);
  });

  it("gives one answer for every way a code can fail", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { message: "invalid" }, data: {} });

    const result = await verifyCustomerOtp({
      email: "sam@example.com",
      token: "123456",
      address: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("rejected");
      // Says nothing about whether the address has an account, which is what
      // stops this from being a way to enumerate customers six digits at a time.
      expect(result.error.message).toMatch(/invalid or expired/i);
    }
  });

  it("returns the tokens and an expiry the app can compare against a clock", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    mocks.verifyOtp.mockResolvedValue({
      error: null,
      data: {
        session: session({ expires_at: expiresAt }),
        user: { id: "user-1", email: "sam@example.com" },
      },
    });

    const result = await verifyCustomerOtp({
      email: "sam@example.com",
      token: "123456",
      address: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.accessToken).toBe("access-token");
      expect(result.data.refreshToken).toBe("refresh-token");
      // Milliseconds, not the seconds Supabase sends. An app that compares the
      // raw value to `Date.now()` refreshes on every single request.
      expect(result.data.expiresAt).toBe(expiresAt * 1000);
    }
  });

  it("falls back to expires_in when there is no absolute expiry", async () => {
    mocks.verifyOtp.mockResolvedValue({
      error: null,
      data: {
        session: session({ expires_at: undefined, expires_in: 3600 }),
        user: { id: "user-1", email: "sam@example.com" },
      },
    });

    const before = Date.now();
    const result = await verifyCustomerOtp({
      email: "sam@example.com",
      token: "123456",
      address: null,
    });

    expect(result.ok).toBe(true);
    // Never 1970, which is what reading the missing field would produce.
    if (result.ok) expect(result.data.expiresAt).toBeGreaterThanOrEqual(before);
  });

  it("still signs a customer in when the profile row cannot be written", async () => {
    mocks.upsert.mockResolvedValue({ error: { message: "denied" } });
    mocks.verifyOtp.mockResolvedValue({
      error: null,
      data: { session: session(), user: { id: "user-1", email: "sam@example.com" } },
    });

    const result = await verifyCustomerOtp({
      email: "sam@example.com",
      token: "123456",
      address: null,
    });

    // They proved they own the address. Refusing them over a row `/account` can
    // create later would trade a working sign-in for tidiness.
    expect(result.ok).toBe(true);
  });

  it("refuses a verification that somehow produced no session", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null, data: { session: null, user: null } });

    const result = await verifyCustomerOtp({
      email: "sam@example.com",
      token: "123456",
      address: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unavailable");
  });
});

describe("refreshing a session", () => {
  it("rotates both tokens, because Supabase does", async () => {
    mocks.refreshSession.mockResolvedValue({
      error: null,
      data: {
        session: session({ access_token: "next-access", refresh_token: "next-refresh" }),
        user: { email: "sam@example.com" },
      },
    });

    const result = await refreshCustomerSession({ refreshToken: "refresh-token" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.accessToken).toBe("next-access");
      // Storing the old one would make the next refresh present a spent token.
      expect(result.data.refreshToken).toBe("next-refresh");
    }
  });

  it("says sign in again rather than try later when the token is finished", async () => {
    mocks.refreshSession.mockResolvedValue({
      error: { status: 400, message: "Invalid Refresh Token" },
      data: { session: null },
    });

    const result = await refreshCustomerSession({ refreshToken: "spent" });

    expect(result.ok).toBe(false);
    // `rejected` becomes a 401, which is the app's signal to clear the keychain.
    // Reporting this as `unavailable` leaves a device retrying a dead credential
    // for as long as the customer keeps the app open.
    if (!result.ok) expect(result.error.kind).toBe("rejected");
  });

  it("refuses an empty refresh token without a network call", async () => {
    const result = await refreshCustomerSession({ refreshToken: "   " });

    expect(result.ok).toBe(false);
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });
});
