"use server";

import { cookieCaller } from "@/lib/customer/cookie-caller";
import { previewVoucher } from "@/lib/customer/vouchers";
import type { VoucherPreviewResult } from "@/lib/vouchers/preview";

/**
 * Checking a promo code, from the browser's side.
 *
 * As thin as `app/actions/checkout.ts` and split the same way: the rules and
 * the refusal copy live in `lib/customer/vouchers.ts`, where they can be tested
 * without going through Next, and what is left here is the part that is
 * genuinely about being a browser, which is turning a cookie jar and a proxy
 * header into a caller.
 *
 * A `"use server"` file may only export async functions, so the types and the
 * schemas live in `lib/vouchers/`. Exporting any of them from here type-checks,
 * passes the unit tests, and then fails `npm run build`.
 */
export async function checkVoucher(
  input: unknown,
  customerAccessToken?: string | null,
): Promise<VoucherPreviewResult> {
  return previewVoucher(input, await cookieCaller(customerAccessToken));
}
