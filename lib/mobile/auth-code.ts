import type { MobileErrorCode } from "@/lib/mobile/contract";
import type { CustomerAuthFailure } from "@/lib/customer/auth";

/**
 * A sign-in refusal, as a status code.
 *
 * `rejected` is 401 and not 400, and the distinction is the one the app acts on.
 * A 400 means the request was malformed and sending it again unchanged is
 * pointless; a 401 means the request was well formed and the credential in it
 * did not open anything, which is what a wrong code and an expired refresh token
 * both are. The app's own switch turns the second into "sign in again" and the
 * first into a field error, so collapsing them here would cost the sign-in
 * screen the ability to point at the right box.
 */
export function authErrorCode(kind: CustomerAuthFailure["kind"]): MobileErrorCode {
  switch (kind) {
    case "invalid":
      return "invalid_request";
    case "limited":
      return "rate_limited";
    case "unavailable":
      return "unavailable";
    case "rejected":
      return "unauthorized";
  }
}
