/**
 * The app's copy of the mobile contract.
 *
 * The server's copy is `lib/mobile/contract.ts` and it is the original. This
 * exists because Metro cannot follow the Next project's `@/` alias out of the
 * Expo workspace, and because an app bundle should not depend on a build step
 * in a different project to compile.
 *
 * Two copies of anything drift. `tests/unit/mobile-contract.test.ts` imports
 * both files and asserts they still agree, so a header or a code renamed on one
 * side fails the repository's own test run rather than a customer's checkout.
 * Anything added here must be added there, and the reverse.
 */

export const MOBILE_API_VERSION = "v1";
export const MOBILE_API_BASE_PATH = `/api/mobile/${MOBILE_API_VERSION}`;

/** A bearer credential, so it travels in a header and never in a URL. */
export const TRACKING_TOKEN_HEADER = "x-nybb-tracking-token";
export const CLIENT_HEADER = "x-nybb-client";

export const MOBILE_ERROR_CODES = [
  "invalid_request",
  "unauthorized",
  "not_found",
  "conflict",
  "rate_limited",
  "unavailable",
  "server_error",
] as const;

export type MobileErrorCode = (typeof MOBILE_ERROR_CODES)[number];

export type MobileError = {
  code: MobileErrorCode;
  message: string;
  field?: "name" | "phone" | "email" | "slot" | "cart";
  staleSlots?: true;
  newAttempt?: true;
};

export type MobileResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: MobileError };

export const MOBILE_ERROR_STATUS: Record<MobileErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  server_error: 500,
  unavailable: 503,
};

export type MobilePaymentStart =
  | { action: "qr"; qrImageUrl: string }
  | { action: "redirect"; redirectUrl: string }
  | { action: "mock" }
  | { action: "done" };

export const MAX_MOBILE_BODY_BYTES = 32 * 1024;
