import { refreshCustomerSession } from "@/lib/customer/auth";
import { mobileError, mobileFailure, mobileOk, readMobileBody } from "@/lib/mobile/http";
import { authErrorCode } from "@/lib/mobile/auth-code";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mints the next access token from a refresh token.
 *
 * WHY THE REFRESH TOKEN IS IN THE BODY AND NOT IN `Authorization`.
 * ================================================================
 * The bearer header on every other route in this API carries an access token,
 * and `mobileCaller()` reads it there to build a caller's identity. Putting a
 * refresh token in the same header would mean one header holding two different
 * kinds of credential, distinguished only by which route received it, and the
 * first handler that read it with the wrong one would forward a refresh token to
 * PostgREST. They are separate places because they are separate things.
 *
 * There is no rate limit on this route on purpose. It is authorized by a
 * credential the server issued, so it is not reachable by a stranger, and a
 * limiter here would refuse a legitimate app that reopened after a long sleep
 * with an expired access token, which is precisely when a refresh is needed. The
 * refresh token itself is the budget: Supabase rotates it on every use.
 */
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  if (!body.ok) return body.response;

  const payload = body.value as { refreshToken?: unknown };
  if (typeof payload?.refreshToken !== "string") {
    return mobileError("unauthorized", "Please sign in again.");
  }

  try {
    const result = await refreshCustomerSession({ refreshToken: payload.refreshToken });

    if (!result.ok) {
      return mobileFailure({
        code: authErrorCode(result.error.kind),
        message: result.error.message,
      });
    }

    return mobileOk(result.data);
  } catch (cause) {
    console.error("[mobile] session refresh failed", cause);
    return mobileError("unavailable", "We could not reach sign-in just now. Please try again.");
  }
}
