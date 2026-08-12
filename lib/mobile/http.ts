import "server-only";
import { bearerCaller, type CustomerCaller } from "@/lib/customer/caller";
import { clientAddress } from "@/lib/rate-limit/address";
import {
  MAX_MOBILE_BODY_BYTES,
  MOBILE_ERROR_STATUS,
  TRACKING_TOKEN_HEADER,
  type MobileError,
  type MobileErrorCode,
  type MobileResponse,
} from "./contract";

/**
 * The plumbing every mobile route shares.
 *
 * One envelope, one place that decides a status code, one place that reads a
 * credential off a request. Routes that each invent their own version of this
 * drift, and the drift shows up on a phone that cannot be redeployed.
 *
 * THERE ARE NO CORS HEADERS HERE, AND THAT IS DELIBERATE.
 * ================================================================
 * The caller is a native app. Native `fetch` is not subject to the same-origin
 * policy, so it needs no `Access-Control-Allow-Origin` to talk to this API,
 * which means the absence of one costs nothing. What it buys is that a web page
 * on some other origin cannot read these responses from a visitor's browser.
 * Adding a permissive CORS header "so it can be tested from a browser tab"
 * would hand any site the ability to place orders with a signed-in customer's
 * forwarded token, so the browser console is not a supported client here.
 *
 * NOTHING IS CACHED.
 * ================================================================
 * Every response is `no-store`. Prices and availability are the two things a
 * stale answer gets wrong in a way a customer pays for, and order data is
 * per-person by definition. Section 23 of the spec already says order data is
 * never cached; this extends the same rule to the menu, because the phone has
 * its own copy anyway and a stale price on a device is worse than a round trip.
 */

const NO_STORE = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
} as const;

export function mobileOk<T>(data: T): Response {
  const body: MobileResponse<T> = { ok: true, data };
  return new Response(JSON.stringify(body), { status: 200, headers: NO_STORE });
}

export function mobileFailure(error: MobileError): Response {
  const body: MobileResponse<never> = { ok: false, error };
  return new Response(JSON.stringify(body), {
    status: MOBILE_ERROR_STATUS[error.code],
    headers: NO_STORE,
  });
}

export function mobileError(
  code: MobileErrorCode,
  message: string,
  extra: Omit<MobileError, "code" | "message"> = {},
): Response {
  return mobileFailure({ code, message, ...extra });
}

/**
 * The access token out of `Authorization: Bearer <token>`.
 *
 * Case-insensitive on the scheme, because HTTP says so and because a client
 * library that capitalizes it differently should not silently become a guest.
 */
export function bearerToken(headers: Headers): string | null {
  const raw = headers.get("authorization");
  if (!raw) return null;

  const [scheme, ...rest] = raw.trim().split(/\s+/);
  if (scheme.toLowerCase() !== "bearer") return null;

  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}

/** The guest tracking token, which travels in a header rather than a URL. */
export function trackingToken(headers: Headers): string | null {
  const raw = headers.get(TRACKING_TOKEN_HEADER);
  return raw && raw.trim().length > 0 ? raw.trim() : null;
}

/** The caller, as the services in `lib/customer/` want to receive one. */
export function mobileCaller(request: Request): CustomerCaller {
  return bearerCaller(bearerToken(request.headers), clientAddress(request.headers));
}

const BRANCH_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_BRANCH_SLUG_LENGTH = 80;

export type BranchSlugParam =
  | { ok: true; value: string | undefined }
  | { ok: false; response: Response };

/**
 * The optional `?branch=` filter, refused rather than ignored when malformed.
 *
 * Undefined means "whichever branch is live", which is what both readers do
 * with a missing slug and is correct while one branch is piloting. A slug that
 * is not slug shaped is a client bug or a probe, and quietly serving the
 * default would hide the first and reward the second.
 */
export function branchSlugParam(request: Request): BranchSlugParam {
  const raw = new URL(request.url).searchParams.get("branch");
  if (raw === null || raw === "") return { ok: true, value: undefined };

  if (raw.length > MAX_BRANCH_SLUG_LENGTH || !BRANCH_SLUG_PATTERN.test(raw)) {
    return {
      ok: false,
      response: mobileError("invalid_request", "That branch could not be read."),
    };
  }

  return { ok: true, value: raw };
}

export type MobileBody =
  | { ok: true; value: unknown }
  | { ok: false; response: Response };

/**
 * A request body, or the refusal to read one.
 *
 * The declared length is checked before the body is touched, so an oversized
 * request costs a header read. The measured length is checked afterwards
 * because the declared one is a claim by the caller, not a fact.
 */
export async function readMobileBody(request: Request): Promise<MobileBody> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_MOBILE_BODY_BYTES) {
    return { ok: false, response: tooLarge() };
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, response: malformed() };
  }

  if (Buffer.byteLength(raw, "utf8") > MAX_MOBILE_BODY_BYTES) {
    return { ok: false, response: tooLarge() };
  }

  // An empty body is a legitimate request on the routes whose input is entirely
  // in the path, so it parses to an empty object rather than to a refusal.
  if (raw.trim().length === 0) return { ok: true, value: {} };

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, response: malformed() };
  }
}

function malformed(): Response {
  return mobileError("invalid_request", "That request could not be read. Please try again.");
}

function tooLarge(): Response {
  return mobileError("invalid_request", "That request was too large to be an order.");
}
