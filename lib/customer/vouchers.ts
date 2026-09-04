import "server-only";
import { checkoutFailure } from "@/lib/checkout/messages";
import { withinAddressLimit } from "@/lib/rate-limit/limiter";
import { supabaseConfigured } from "@/lib/supabase/public-client";
import {
  voucherPreviewInputSchema,
  voucherVerdictSchema,
  type VoucherPreviewResult,
} from "@/lib/vouchers/preview";
import { callerClient, type CustomerCaller } from "./caller";

/**
 * Trying a promo code, for any client that can be reduced to a caller.
 *
 * Thin, the way `submitOrder` beside it is thin, and for the same reason: it
 * parses, it calls one RPC, and it turns a machine code into a sentence. It
 * decides nothing about the discount, because a discount decided here would be
 * a discount a client could argue with.
 *
 * WHY THIS IS RATE LIMITED WHEN THE ORDER PATH'S OWN LIMIT WOULD NOT COVER IT.
 *
 * `preview_voucher` is granted to anon, because a guest has to be able to try a
 * code and guests place most of the orders here. That makes it the one endpoint
 * in the app that answers "is this a real code" cheaply and repeatedly, and
 * without a limit it would be a comfortable way to sit and guess at codes.
 * `place_order`'s Postgres-side limit is keyed on a phone number, which does
 * not exist yet at the moment somebody is typing a code, so the address
 * dimension is the one that applies here. Sixty a minute is far above anything
 * a person typing into a form produces and far below anything useful for
 * enumeration.
 *
 * It fails open in every direction, including "no service-role key configured",
 * which is the state of every environment until the Supabase project exists.
 * A limiter that took the promo field down with it would have done more damage
 * than the guessing it prevents. `lib/rate-limit/limiter.ts` has the reasoning.
 */
export async function previewVoucher(
  input: unknown,
  caller: CustomerCaller,
): Promise<VoucherPreviewResult> {
  const parsed = voucherPreviewInputSchema.safeParse(input);
  if (!parsed.success) {
    // Nothing here is a message a form could show usefully, because every field
    // in this request is filled by the page rather than by the customer, except
    // the code itself. A structural failure means a request no screen produced.
    return { ok: false, error: "We could not read that request. Please try again." };
  }

  if (!supabaseConfigured()) {
    return {
      ok: false,
      error: "Promo codes are not available at the moment.",
      field: "voucher",
    };
  }

  if (
    !(await withinAddressLimit({
      action: "voucher_preview",
      address: caller.address,
      limit: 60,
      windowSeconds: 60,
    }))
  ) {
    return {
      ok: false,
      error: "That is a lot of promo codes in a short time. Please wait a moment.",
      field: "voucher",
    };
  }

  const supabase = await callerClient(caller);
  const { data, error } = await supabase.rpc("preview_voucher", {
    p_code: parsed.data.code,
    p_branch_slug: parsed.data.branchSlug,
    p_lines: parsed.data.lines.map((line) => ({
      item_slug: line.itemSlug,
      variation_slug: line.variationSlug,
      qty: line.quantity,
      options: line.options.map((option) => ({
        group_slug: option.groupSlug,
        option_slug: option.optionSlug,
      })),
    })),
    p_phone: parsed.data.phone,
  });

  if (error) {
    return { ok: false, ...checkoutFailure(error.message), field: "voucher" };
  }

  const verdict = voucherVerdictSchema.safeParse(data);
  if (!verdict.success) {
    console.error("[vouchers] preview_voucher returned an unreadable verdict", verdict.error.issues);
    return {
      ok: false,
      error: "We could not check that code just now. Please try again.",
      field: "voucher",
    };
  }

  if (!verdict.data.ok) {
    // The same table the placement's refusals go through, so a code refused at
    // the form and the same code refused at the till say the same sentence.
    return { ok: false, ...checkoutFailure(verdict.data.reason), field: "voucher" };
  }

  return {
    ok: true,
    voucher: {
      code: verdict.data.code,
      description: verdict.data.description,
      discountCents: verdict.data.discountCents,
      eligibleCents: verdict.data.eligibleCents,
      subtotalCents: verdict.data.subtotalCents,
    },
  };
}
