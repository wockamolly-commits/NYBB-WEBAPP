import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { EmailOtpType } from "@supabase/supabase-js";
import { z } from "zod";
import { signInEmailSchema } from "@/lib/auth/email";
import { checkOtpRequestLimit, checkOtpVerifyLimit } from "@/lib/auth/rate-limit";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";

/**
 * Customer sign-in, for callers that have no cookie jar.
 *
 * WHY THIS IS NOT THE LOGIN SERVER ACTION.
 * ================================================================
 * `app/(marketing)/login/actions.ts` does three things this must not do. It
 * reads `next/headers`, it `redirect()`s, and it routes staff addresses into
 * the isolated workspace cookie family. A phone has no cookies, cannot be
 * redirected, and is never a workspace client: the staff workspace stays
 * browser-only by decision, so this path is the customer path and only ever
 * that. A staff member signing in here is signing in as themselves, a customer,
 * and RLS scopes what they read to their own orders exactly as it does for
 * anybody else.
 *
 * WHY THE APP DOES NOT HOLD THE SUPABASE SDK INSTEAD.
 * ================================================================
 * It could. `signInWithOtp` is callable with the anon key, so a native client
 * could talk to Supabase directly and get token refresh for free. What that
 * costs is the two things `lib/mobile/http.ts` opens by promising: one rate
 * limit and one refusal-message table. The email dimension of the OTP limit
 * lives on this server (`lib/auth/rate-limit.ts`, hashed per address), and a
 * device that asks Supabase directly is not counted by it at all, which turns
 * the limit into one a caller opts into. Supabase's own error strings would
 * also become a second message table, in English written for developers, on the
 * screen where somebody is trying to sign in. So the request comes here, and the
 * app receives a session rather than a credential to a third party.
 *
 * WHAT A SESSION IS, AND WHAT THE APP MUST DO WITH IT.
 * ================================================================
 * An access token that expires in the order of an hour, and a refresh token
 * that mints the next one. Both are bearer credentials: whoever holds the
 * refresh token can mint access tokens until it is rotated or revoked. They
 * belong in platform secure storage on the device and nowhere else, never in a
 * log, never in a crash report, and never in the request URL.
 */

/**
 * Normalized first, validated second, and the order is the whole point. The rule
 * lives in `lib/auth/email.ts` because the web sign-in action needs the identical
 * one and had the ordering backwards for a while.
 */
export const otpRequestSchema = z.object({ email: signInEmailSchema });

export const otpVerifySchema = z.object({
  email: signInEmailSchema,
  token: z.string().trim().regex(/^\d{6}$/, { error: "Enter the six-digit code from your email." }),
});

export const sessionRefreshSchema = z.object({
  refreshToken: z.string().trim().min(1).max(4096),
});

/**
 * A refusal, in the vocabulary of the domain rather than of HTTP.
 *
 * `lib/customer/orders.ts` sets the same kind of hint on its own failures and
 * lets the route decide a status code. Keeping that split here means this
 * service stays callable from somewhere that is not a Route Handler without
 * carrying a status code it would have to ignore.
 */
export type CustomerAuthFailure = {
  /** Customer copy. Safe to put on a screen as it is. */
  message: string;
  kind: "invalid" | "limited" | "unavailable" | "rejected";
  field?: "email" | "code";
};

export type CustomerAuthResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: CustomerAuthFailure };

/** What the app is told after a code is on its way. No token, nothing secret. */
export type OtpRequestAccepted = {
  email: string;
  /** Epoch milliseconds after which the code will not verify. */
  expiresAt: number;
  /** Epoch milliseconds before which "Send another code" should stay disabled. */
  resendAvailableAt: number;
};

/** A signed-in session, as the device will store it. */
export type CustomerSession = {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. The app refreshes before this, not after. */
  expiresAt: number;
  email: string | null;
};

const OTP_LIFETIME_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function unconfigured(): CustomerAuthFailure {
  return {
    message: "Sign-in is not connected in this environment yet.",
    kind: "unavailable",
  };
}

/**
 * Sends a six-digit code, or explains why it did not.
 *
 * `shouldCreateUser` is true because this is the customer app and a first-time
 * customer signing in is the ordinary case, not an error. The web action sets it
 * false for known staff addresses; that distinction belongs to the workspace and
 * has no meaning here.
 */
export async function requestCustomerOtp(input: {
  email: string;
  address: string | null;
}): Promise<CustomerAuthResult<OtpRequestAccepted>> {
  const parsed = otpRequestSchema.safeParse({ email: input.email });
  if (!parsed.success) {
    return {
      ok: false,
      error: { message: "Enter a valid email address.", kind: "invalid", field: "email" },
    };
  }
  if (!supabaseConfigured()) return { ok: false, error: unconfigured() };

  const email = parsed.data.email;
  const rate = await checkOtpRequestLimit(email, input.address);
  if (!rate.allowed) {
    return { ok: false, error: { message: rate.message, kind: "limited" } };
  }

  const { error } = await createPublicClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) {
    // The address is deliberately absent from this log. It is the one field in
    // the request that identifies a person.
    console.error("[mobile-auth] signInWithOtp failed:", error.status, error.message);
    return {
      ok: false,
      error:
        error.status === 429
          ? {
              message: "Too many code requests. Wait a little and try again.",
              kind: "limited",
            }
          : {
              message: "We could not send a code. Check the address and try again.",
              kind: "rejected",
              field: "email",
            },
    };
  }

  const now = Date.now();
  return {
    ok: true,
    data: {
      email,
      expiresAt: now + OTP_LIFETIME_MS,
      resendAvailableAt: now + RESEND_COOLDOWN_MS,
    },
  };
}

/**
 * Exchanges a code for a session.
 *
 * The three verification types are the web action's list and exist for the same
 * reason: Supabase types the same six digits differently depending on whether
 * the address was already registered, and guessing wrong reads to the customer
 * as a wrong code. A failure of all three is reported as one message, because
 * telling somebody which of the three failed tells an attacker whether the
 * address has an account.
 */
export async function verifyCustomerOtp(input: {
  email: string;
  token: string;
  address: string | null;
}): Promise<CustomerAuthResult<CustomerSession>> {
  const parsed = otpVerifySchema.safeParse({ email: input.email, token: input.token });
  if (!parsed.success) {
    const onEmail = parsed.error.issues.some((issue) => issue.path[0] === "email");
    return {
      ok: false,
      error: onEmail
        ? { message: "Enter a valid email address.", kind: "invalid", field: "email" }
        : {
            message: "Enter the six-digit code from your email.",
            kind: "invalid",
            field: "code",
          },
    };
  }
  if (!supabaseConfigured()) return { ok: false, error: unconfigured() };

  const { email, token } = parsed.data;
  const rate = await checkOtpVerifyLimit(email, input.address);
  if (!rate.allowed) {
    return { ok: false, error: { message: rate.message, kind: "limited" } };
  }

  const supabase = createPublicClient();
  const types = ["email", "signup", "magiclink"] satisfies EmailOtpType[];
  let lastError: string | null = null;

  for (const type of types) {
    const result = await supabase.auth.verifyOtp({ email, token, type });
    if (result.error) {
      lastError = result.error.message;
      continue;
    }

    const session = result.data.session;
    if (!session?.access_token || !session.refresh_token) {
      console.error("[mobile-auth] verifyOtp returned no session");
      return {
        ok: false,
        error: {
          message: "We could not finish signing you in. Please try again.",
          kind: "unavailable",
        },
      };
    }

    if (result.data.user?.id) {
      await ensureCustomerProfile(session.access_token, result.data.user.id);
    }

    return {
      ok: true,
      data: {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: expiryMs(session.expires_at, session.expires_in),
        email: result.data.user?.email ?? email,
      },
    };
  }

  console.error("[mobile-auth] verifyOtp failed:", lastError);
  return {
    ok: false,
    error: {
      message: "That code is invalid or expired. Check it or request a new one.",
      kind: "rejected",
      field: "code",
    },
  };
}

/**
 * Mints the next access token from a refresh token.
 *
 * A refusal here is `rejected` rather than `unavailable`, and the difference is
 * load bearing on the device: `unavailable` means try again later with the same
 * tokens, `rejected` means these tokens are finished and the customer has to
 * sign in again. Treating a revoked refresh token as a temporary outage leaves
 * an app retrying a credential that will never work.
 */
export async function refreshCustomerSession(input: {
  refreshToken: string;
}): Promise<CustomerAuthResult<CustomerSession>> {
  const parsed = sessionRefreshSchema.safeParse({ refreshToken: input.refreshToken });
  if (!parsed.success) {
    return {
      ok: false,
      error: { message: "Please sign in again.", kind: "rejected" },
    };
  }
  if (!supabaseConfigured()) return { ok: false, error: unconfigured() };

  const { data, error } = await createPublicClient().auth.refreshSession({
    refresh_token: parsed.data.refreshToken,
  });

  if (error || !data.session?.access_token || !data.session.refresh_token) {
    // Not logged with the token in it.
    console.error("[mobile-auth] refreshSession failed:", error?.status, error?.message);
    return {
      ok: false,
      error: { message: "Please sign in again.", kind: "rejected" },
    };
  }

  return {
    ok: true,
    data: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: expiryMs(data.session.expires_at, data.session.expires_in),
      email: data.user?.email ?? null,
    },
  };
}

/**
 * The `customer_profiles` row, created best effort.
 *
 * The web action does the same thing and logs rather than failing, for the same
 * reason: a customer who has just proved they own an address is signed in, and
 * refusing them because a profile row did not insert would be trading a working
 * sign-in for a row that `/account` can create later. It runs as the customer,
 * never as the service role, so RLS decides whether it is allowed.
 */
async function ensureCustomerProfile(accessToken: string, userId: string): Promise<void> {
  try {
    const asCustomer = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { accessToken: async () => accessToken },
    );
    const { error } = await asCustomer
      .from("customer_profiles")
      .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
    if (error) console.error("[mobile-auth] customer profile creation failed:", error.message);
  } catch (error) {
    console.error("[mobile-auth] customer profile creation threw:", error);
  }
}

/**
 * When the access token stops working, in epoch milliseconds.
 *
 * `expires_at` is seconds since the epoch and `expires_in` is seconds from now.
 * Supabase sends both, but a client that trusts whichever one happens to be
 * present is a client that computes a time in 1970 when the other is missing,
 * and an app refreshing on every request is indistinguishable from one that
 * never signed in. The floor keeps a missing pair from producing a token the app
 * believes is already dead.
 */
function expiryMs(expiresAt: number | undefined, expiresIn: number | undefined): number {
  if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) return expiresAt * 1000;
  if (typeof expiresIn === "number" && Number.isFinite(expiresIn)) {
    return Date.now() + expiresIn * 1000;
  }
  return Date.now() + 60 * 60 * 1000;
}
