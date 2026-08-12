import { verifyCustomerOtp } from "@/lib/customer/auth";
import { clientAddress } from "@/lib/rate-limit/address";
import { mobileError, mobileFailure, mobileOk, readMobileBody } from "@/lib/mobile/http";
import { authErrorCode } from "@/lib/mobile/auth-code";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Exchanges a six-digit code for a session.
 *
 * This is the one response in the whole mobile contract that hands the caller a
 * credential rather than reading one, which is why the surrounding rules matter
 * more here than anywhere else in `app/api/mobile/`.
 *
 * `lib/mobile/http.ts` already puts `Cache-Control: no-store` on every response
 * and deliberately sets no CORS header, so this body cannot be read by a web
 * page on another origin and cannot be held by an intermediary cache. Neither is
 * incidental here: without the first, a shared proxy could serve one customer's
 * session to the next request for the same URL.
 *
 * Nothing in this file logs the body or the response.
 */
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  if (!body.ok) return body.response;

  const payload = body.value as { email?: unknown; token?: unknown };
  if (typeof payload?.email !== "string") {
    return mobileError("invalid_request", "Enter a valid email address.", { field: "email" });
  }
  if (typeof payload?.token !== "string") {
    return mobileError("invalid_request", "Enter the six-digit code from your email.", {
      field: "code",
    });
  }

  try {
    const result = await verifyCustomerOtp({
      email: payload.email,
      token: payload.token,
      address: clientAddress(request.headers),
    });

    if (!result.ok) {
      return mobileFailure({
        code: authErrorCode(result.error.kind),
        message: result.error.message,
        ...(result.error.field ? { field: result.error.field } : {}),
      });
    }

    return mobileOk(result.data);
  } catch (cause) {
    console.error("[mobile] sign-in verification failed", cause);
    return mobileError("unavailable", "We could not sign you in just now. Please try again.");
  }
}
