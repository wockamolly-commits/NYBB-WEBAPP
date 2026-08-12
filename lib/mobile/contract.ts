/**
 * The mobile contract, as values both sides of it can hold.
 *
 * This file is deliberately pure. No Next import, no Supabase import, no
 * `server-only`, nothing that reaches a database. It is the shape of the
 * conversation between the native app and this server, and the native app has
 * its own copy of it (`apps/customer/src/api/contract.ts`) because Metro cannot
 * follow the `@/` alias out of the Expo project. `tests/unit/mobile-contract.
 * test.ts` asserts the two copies still agree, which is the cheap version of a
 * shared package and catches the failure that actually matters: a code or a
 * header renamed on one side and not the other.
 *
 * WHY THERE IS A VERSION IN THE PATH.
 * ================================================================
 * A Server Action is a browser form protocol. Both halves of it deploy at the
 * same instant, so it can change shape whenever the code does. An installed app
 * cannot be redeployed: some phone will still be running last month's build
 * during the next lunch rush, and it will be calling this server. So the path
 * carries a version, and `v1` means what it meant on the day it shipped. A
 * breaking change gets `v2` beside it rather than an edit in place.
 *
 * WHAT THE APP IS ALLOWED TO SAY.
 * ================================================================
 * Names and counts. An item slug, a variation slug, option slugs, a quantity, a
 * pickup minute, who to hand the food to. There is no price, total, discount,
 * payment state or order status anywhere in a request type in this contract,
 * and none should ever be added: `place_order` resolves every peso from the
 * branch price list inside the transaction that writes the order, and the
 * PayMongo webhook is the only thing that may say an order is paid.
 */

export const MOBILE_API_VERSION = "v1";
export const MOBILE_API_BASE_PATH = `/api/mobile/${MOBILE_API_VERSION}`;

/**
 * A tracking token travels in a header, not in a query string.
 *
 * The web storefront puts it in the URL because a customer has to be able to
 * paste a link and get back to their order, and `lib/orders/tracking.ts` pays
 * for that with a `noindex` page and a referrer policy. The app has no such
 * need: it holds the token in device storage. So it goes in a header, where it
 * stays out of access logs, proxy logs and crash reports.
 */
export const TRACKING_TOKEN_HEADER = "x-nybb-tracking-token";

/**
 * Identifies the caller in logs and, later, in a minimum-version check.
 *
 * Nothing is authorized by it. It is a label, and a label a caller chooses is
 * worth exactly nothing as a permission.
 */
export const CLIENT_HEADER = "x-nybb-client";

/**
 * Every error the mobile API can return, and nothing else.
 *
 * The app switches on the code and shows `message`, which is already customer
 * copy written for the same situation on the web (`lib/checkout/messages.ts`
 * and friends). Keeping one message table rather than two is the point: a
 * refusal the web explains well should not become "something went wrong" merely
 * because a phone asked instead of a browser.
 */
export const MOBILE_ERROR_CODES = [
  /** Malformed, unparseable, or refused by a schema. */
  "invalid_request",
  /** No credential, or one that does not open this order. */
  "unauthorized",
  /** No such order, or the wrong token. Indistinguishable on purpose. */
  "not_found",
  /** Real, but not in a state where this makes sense. Already paid, not ready. */
  "conflict",
  /** Slow down. Always safe to retry later. */
  "rate_limited",
  /** The server cannot answer right now. Says nothing about the request. */
  "unavailable",
  /** A bug on this side. */
  "server_error",
] as const;

export type MobileErrorCode = (typeof MOBILE_ERROR_CODES)[number];

export type MobileError = {
  code: MobileErrorCode;
  /** Customer copy. Safe to put on a screen as it is. */
  message: string;
  /** Which input to point at, when a form caused it. */
  field?: "name" | "phone" | "email" | "slot" | "cart" | "code";
  /** The pickup windows on screen are stale. Reload them before retrying. */
  staleSlots?: true;
  /** Mint a new attempt id. Anything else is safe to retry with the old one. */
  newAttempt?: true;
};

export type MobileResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: MobileError };

/** One status per code, so the app never has to read a status and a body. */
export const MOBILE_ERROR_STATUS: Record<MobileErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  server_error: 500,
  unavailable: 503,
};

/**
 * What starting a payment tells the app to do next.
 *
 * None of these is a payment result. `done` means the provider already
 * considers the intent settled, and the app still has to read the order back to
 * find out whether it is paid, because the webhook is the only thing that may
 * say so. Naming the action rather than passing the server's internal result
 * shape through keeps the app's switch statement stable across a provider
 * change.
 */
export type MobilePaymentStart =
  /** Show this QR code and wait for the order to turn paid. */
  | { action: "qr"; qrImageUrl: string }
  /** Open this URL, then come back and read the order. */
  | { action: "redirect"; redirectUrl: string }
  /** Development only. Settle it through the mock endpoint. */
  | { action: "mock" }
  /** Nothing left to do at the provider. Read the order back. */
  | { action: "done" };

/**
 * What the app is told once a sign-in code is on its way.
 *
 * Deliberately carries nothing secret. It exists so the sign-in screen can
 * disable "Send another code" for the right length of time and say when the
 * code stops working, both of which it would otherwise have to guess at with a
 * hardcoded number that drifts from the server's real limit.
 */
export type MobileOtpRequested = {
  email: string;
  /** Epoch milliseconds after which the code will not verify. */
  expiresAt: number;
  /** Epoch milliseconds before which a resend will be refused anyway. */
  resendAvailableAt: number;
};

/**
 * A signed-in session, as the device stores it.
 *
 * Both tokens are bearer credentials and the refresh token is the stronger of
 * the two: it mints access tokens until it is rotated or revoked. It belongs in
 * platform secure storage (Keychain, Keystore) and nowhere else. Never log
 * either one, never put them in a URL, and never write them to ordinary app
 * storage on the grounds that the device is the customer's own.
 */
export type MobileSession = {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. Refresh before this, not after. */
  expiresAt: number;
  email: string | null;
};

/**
 * A hard ceiling on a request body, well above the largest real order.
 *
 * Twenty lines with twenty options each, with slugs at their schema maximum,
 * does not reach eight kilobytes. This is here so a body that could never be an
 * order is refused before anything tries to parse it.
 */
export const MAX_MOBILE_BODY_BYTES = 32 * 1024;
