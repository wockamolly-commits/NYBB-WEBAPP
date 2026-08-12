import { requestCustomerOtp } from "@/lib/customer/auth";
import { clientAddress } from "@/lib/rate-limit/address";
import { mobileError, mobileFailure, mobileOk, readMobileBody } from "@/lib/mobile/http";
import { authErrorCode } from "@/lib/mobile/auth-code";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Asks for a six-digit sign-in code.
 *
 * THE ANSWER IS THE SAME WHETHER OR NOT THE ADDRESS HAS AN ACCOUNT.
 * ================================================================
 * A response that differed would turn this endpoint into a way to test whether
 * somebody has ordered from NYBB, one address at a time, and it is unauthenticated
 * by necessity. So a first-time address and a returning customer both get
 * `expiresAt` and `resendAvailableAt` and nothing else. The only refusals that
 * are visible from outside are the rate limit and a malformed address, neither
 * of which says anything about who exists.
 *
 * The limiter runs before Supabase is called, on the same hashed-email
 * namespaces the web login uses, so a device and a browser share one budget
 * rather than each having their own.
 */
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  if (!body.ok) return body.response;

  const payload = body.value as { email?: unknown };
  if (typeof payload?.email !== "string") {
    return mobileError("invalid_request", "Enter a valid email address.", { field: "email" });
  }

  try {
    const result = await requestCustomerOtp({
      email: payload.email,
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
    // Never logged with the request, which carries the address.
    console.error("[mobile] sign-in code request failed", cause);
    return mobileError("unavailable", "We could not send a code just now. Please try again.");
  }
}
