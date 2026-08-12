import {
  CLIENT_HEADER,
  MOBILE_API_BASE_PATH,
  TRACKING_TOKEN_HEADER,
  type MobileError,
  type MobileOtpRequested,
  type MobilePaymentStart,
  type MobileResponse,
  type MobileSession,
} from "./contract";
import type {
  PickupSlots,
  PlaceOrderRequest,
  PlacedOrder,
  StorefrontMenu,
  TrackedOrder,
} from "./types";

/**
 * Every call the app makes to NYBB, in one file.
 *
 * The rule this file enforces is that the phone asks and the server answers.
 * There is no request builder here that can carry a price, a total, a discount
 * or an order status, because no such field exists in `PlaceOrderRequest` and
 * none may be added: `place_order` resolves money from the branch price list
 * inside the transaction that reserves the pickup window, and the PayMongo
 * webhook is the only thing that may say an order is paid.
 *
 * WHERE THE SERVER IS.
 * ================================================================
 * `EXPO_PUBLIC_API_URL`, and there is deliberately no default. A phone running
 * Expo Go cannot reach the development machine's `localhost`, so a built-in
 * fallback would not be a convenience, it would be a URL that silently fails on
 * every device and works only in a simulator. Missing configuration is
 * therefore an explicit, visible state that the app explains on screen.
 */

export function apiBaseUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!configured) return null;
  return configured.replace(/\/+$/, "");
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: MobileError };

/** What the app shows when the request never reached an answer. */
function offline(): { ok: false; error: MobileError } {
  return {
    ok: false,
    error: {
      code: "unavailable",
      message: "We could not reach NYBB. Check your connection and try again.",
    },
  };
}

function unconfigured(): { ok: false; error: MobileError } {
  return {
    ok: false,
    error: {
      code: "unavailable",
      message:
        "This build has no NYBB server address. Set EXPO_PUBLIC_API_URL and restart Expo.",
    },
  };
}

export type Credentials = {
  /** Supabase access token when the customer is signed in. */
  accessToken?: string | null;
  /** The order's tracking token, which is what a guest reads an order with. */
  trackingToken?: string | null;
};

async function call<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; credentials?: Credentials } = {},
): Promise<ApiResult<T>> {
  const base = apiBaseUrl();
  if (!base) return unconfigured();

  const headers: Record<string, string> = { accept: "application/json", [CLIENT_HEADER]: "nybb-customer-app" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.credentials?.accessToken) {
    headers.authorization = `Bearer ${init.credentials.accessToken}`;
  }
  if (init.credentials?.trackingToken) {
    headers[TRACKING_TOKEN_HEADER] = init.credentials.trackingToken;
  }

  let response: Response;
  try {
    response = await fetch(`${base}${MOBILE_API_BASE_PATH}${path}`, {
      method: init.method ?? "GET",
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch {
    // Deliberately not logged with the request in it. These requests carry
    // bearer credentials in their headers, and a crash reporter is somewhere
    // they can be read later.
    return offline();
  }

  let body: MobileResponse<T>;
  try {
    body = (await response.json()) as MobileResponse<T>;
  } catch {
    // A response that is not the envelope is a proxy, a captive portal or a
    // deploy in progress. None of those is something to show raw to a customer.
    return offline();
  }

  if (typeof body !== "object" || body === null || typeof body.ok !== "boolean") {
    return offline();
  }

  return body.ok ? { ok: true, data: body.data } : { ok: false, error: body.error };
}

export function fetchMenu(branchSlug?: string): Promise<ApiResult<StorefrontMenu>> {
  return call(`/menu${branchSlug ? `?branch=${encodeURIComponent(branchSlug)}` : ""}`);
}

export function fetchPickupSlots(branchSlug?: string): Promise<ApiResult<PickupSlots>> {
  return call(`/slots${branchSlug ? `?branch=${encodeURIComponent(branchSlug)}` : ""}`);
}

export function placeOrder(
  order: PlaceOrderRequest,
  credentials: Credentials = {},
): Promise<ApiResult<PlacedOrder>> {
  return call("/orders", { method: "POST", body: order, credentials });
}

export function fetchOrder(
  shortCode: string,
  credentials: Credentials,
): Promise<ApiResult<TrackedOrder>> {
  return call(`/orders/${encodeURIComponent(shortCode)}`, { credentials });
}

export function startPayment(
  shortCode: string,
  request: { method: string; paymentAttemptId: string },
  credentials: Credentials,
): Promise<ApiResult<MobilePaymentStart>> {
  return call(`/orders/${encodeURIComponent(shortCode)}/payment`, {
    method: "POST",
    body: request,
    credentials,
  });
}

/**
 * Development only. The endpoint answers 404 unless the server has mock
 * payments switched on, which it cannot have in production.
 */
export function settleMockPayment(
  shortCode: string,
  request: { method: string; paymentAttemptId: string; outcome: "paid" | "failed" },
  credentials: Credentials,
): Promise<ApiResult<{ action: "done" }>> {
  return call(`/orders/${encodeURIComponent(shortCode)}/payment/mock`, {
    method: "POST",
    body: request,
    credentials,
  });
}

export function markArrived(
  shortCode: string,
  credentials: Credentials,
): Promise<ApiResult<{ arrived: true }>> {
  return call(`/orders/${encodeURIComponent(shortCode)}/arrival`, {
    method: "POST",
    credentials,
  });
}

/**
 * Asks NYBB to email a six-digit sign-in code.
 *
 * None of the three sign-in calls takes `Credentials`. Two of them are how a
 * credential is obtained in the first place, and the third authorizes itself
 * with the refresh token in its body rather than with the bearer header, because
 * that header carries access tokens everywhere else in this file and one header
 * holding two kinds of credential is how a refresh token ends up forwarded to
 * the database.
 */
export function requestSignInCode(email: string): Promise<ApiResult<MobileOtpRequested>> {
  return call("/auth/otp", { method: "POST", body: { email } });
}

export function verifySignInCode(
  email: string,
  token: string,
): Promise<ApiResult<MobileSession>> {
  return call("/auth/session", { method: "POST", body: { email, token } });
}

export function refreshSession(refreshToken: string): Promise<ApiResult<MobileSession>> {
  return call("/auth/refresh", { method: "POST", body: { refreshToken } });
}
