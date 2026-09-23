"use server";

import { after } from "next/server";
import { notifyCustomersOfPromo } from "@/lib/push/dispatch";
import { revalidatePath } from "next/cache";
import { getStaffProfile, hasStaffPermission } from "@/lib/staff/session";
import { createStaffClient } from "@/lib/supabase/server";
import { voucherFormInput, voucherRpcPayload } from "@/lib/vouchers/form";
import { voucherFormSchema, type VoucherActionState } from "@/lib/vouchers/schema";

/**
 * The three writes behind /workspace/vouchers.
 *
 * Each one is a thin wrapper: parse the form, call the RPC, name the refusal.
 * The permission is checked here so a person without it never sees a spinner,
 * and checked AGAIN inside the function in 0066, which is the check that
 * actually matters. A staff session holds no write grant on vouchers at all, so
 * skipping the RPC is not a route to the table.
 *
 * A `"use server"` file may only export async functions, which is why the
 * schema, the state type and the peso arithmetic live in lib/vouchers/.
 */

function refuse(message: string): VoucherActionState {
  return { ok: false, error: message };
}

/** The named refusals 0066 raises, in the words the screen should use. */
function errorFor(message: string | undefined): string {
  if (message?.includes("FORBIDDEN")) {
    return "You do not have access to manage promo codes.";
  }
  if (message?.includes("DUPLICATE_CODE")) {
    return "There is already a promo code with that code. Pick another.";
  }
  if (message?.includes("ONE_DISCOUNT_KIND")) {
    return "A code takes off a fixed amount or a percentage, not both.";
  }
  if (message?.includes("CAP_BELOW_USES")) {
    return "That total limit is lower than the number of times this code has already been used.";
  }
  if (message?.includes("VOUCHER_IN_USE")) {
    return "This code has been used on an order, so it cannot be deleted. Switch it off instead.";
  }
  if (message?.includes("VOUCHER_LOCKED")) {
    return (
      "This code has already been used on an order, so its terms are fixed. " +
      "Switch it off instead, or make a new code with the terms you want."
    );
  }
  if (message?.includes("VOUCHER_NOT_FOUND")) {
    return "That promo code is no longer there. It may have been deleted in another tab.";
  }
  if (message?.includes("INVALID_CODE") || message?.includes("MISSING_CODE")) {
    return "That code cannot be used. Try one without spaces.";
  }
  return "We could not save that just now. Please try again.";
}

async function authorized() {
  const profile = await getStaffProfile();
  return profile && hasStaffPermission(profile, "vouchers:manage") ? profile : null;
}

function refresh(id?: string | null) {
  revalidatePath("/workspace/vouchers");
  if (id) revalidatePath(`/workspace/vouchers/${id}`);
}

export async function saveVoucher(
  _previous: VoucherActionState,
  formData: FormData,
): Promise<VoucherActionState> {
  if (!(await authorized())) return refuse("You do not have access to manage promo codes.");

  // Both mappings live in lib/vouchers/form.ts and are unit tested there.
  // They used to be written out here, which is how `publicise` shipped as a
  // toggle that could never save: a field added to the schema and missed in
  // an inline object literal is invisible to tsc, because a field with a
  // default is optional in the schema's input type.
  const parsed = voucherFormSchema.safeParse(voucherFormInput(formData));

  if (!parsed.success) {
    // Field messages written into the schema are staff copy and are shown
    // beside the control. A structural complaint is about a request no form
    // could have produced, so it gets the neutral wording.
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !(field in fieldErrors)) {
        fieldErrors[field] = issue.message;
      }
    }
    return {
      ok: false,
      error: "Some of this needs another look.",
      fieldErrors,
    };
  }

  const supabase = await createStaffClient();
  const { data, error } = await supabase.rpc("admin_upsert_voucher", {
    p_voucher: voucherRpcPayload(parsed.data),
  });

  if (error) return refuse(errorFor(error.message));

  const savedId = typeof data === "string" ? data : null;
  refresh(savedId);
  return { ok: true, savedId: savedId ?? undefined };
}

export async function setVoucherActive(
  _previous: VoucherActionState,
  formData: FormData,
): Promise<VoucherActionState> {
  if (!(await authorized())) return refuse("You do not have access to manage promo codes.");

  const id = String(formData.get("id") ?? "");
  const active = formData.get("isActive") === "true";
  if (id === "") return refuse("We could not tell which code that was.");

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("admin_set_voucher_active", {
    p_voucher_id: id,
    p_active: active,
  });

  if (error) return refuse(errorFor(error.message));
  refresh(id);
  return { ok: true };
}

/**
 * Putting a code on the storefront, or taking it back off.
 *
 * Its own action for the same two reasons admin_set_voucher_active is its own
 * function. Pulling an advert that has gone wrong should not require the form
 * to round-trip every other field correctly first, and once a code has met an
 * order the upsert refuses outright, so a publicise control that only lived
 * inside the form would become unreachable at exactly the moment it matters:
 * a live campaign the owner wants to stop advertising without stopping it
 * working for the people already holding the code.
 */
export async function setVoucherPublicise(
  _previous: VoucherActionState,
  formData: FormData,
): Promise<VoucherActionState> {
  if (!(await authorized())) return refuse("You do not have access to manage promo codes.");

  const id = String(formData.get("id") ?? "");
  const publicise = formData.get("publicise") === "true";
  if (id === "") return refuse("We could not tell which code that was.");

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("admin_set_voucher_publicise", {
    p_voucher_id: id,
    p_publicise: publicise,
  });

  if (error) return refuse(errorFor(error.message));
  refresh(id);
  return { ok: true };
}

/**
 * Sending the promo to everybody who asked to hear about promos.
 *
 * DELIBERATELY NOT AUTOMATIC. Publicising a code and announcing it are two
 * separate acts, because they happen at different times: a campaign is
 * usually built and put on the storefront hours or days before anybody wants
 * a notification about it. An announcement that fired on save would also fire
 * on every later save, and `admin_upsert_voucher` runs on all of them.
 *
 * ONE SHOT FOR THE LIFE OF THE CODE. `claim_promo_announcement` writes
 * `announced_at` and refuses every caller after the first, so a staff member
 * pressing the button twice sends once. A second blast means a second code,
 * which is also what the bar's per-promo dismissal already assumes.
 *
 * Handed to `after()` rather than awaited, so a fan-out across every
 * subscriber does not hold the workspace response open. The dispatch never
 * throws, so nothing it does can fail this action.
 */
export async function announceVoucher(
  _previous: VoucherActionState,
  formData: FormData,
): Promise<VoucherActionState> {
  if (!(await authorized())) return refuse("You do not have access to manage promo codes.");

  const id = String(formData.get("id") ?? "");
  if (id === "") return refuse("We could not tell which code that was.");

  // after(), not a detached promise, for the reason app/actions/checkout.ts
  // records: on Vercel a promise the response does not wait for can be killed
  // when the function suspends.
  after(notifyCustomersOfPromo(id));

  refresh(id);
  return { ok: true };
}

export async function deleteVoucher(
  _previous: VoucherActionState,
  formData: FormData,
): Promise<VoucherActionState> {
  if (!(await authorized())) return refuse("You do not have access to manage promo codes.");

  const id = String(formData.get("id") ?? "");
  if (id === "") return refuse("We could not tell which code that was.");

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("admin_delete_voucher", { p_voucher_id: id });

  if (error) return refuse(errorFor(error.message));
  refresh();
  return { ok: true, deleted: true };
}

/**
 * The master switch for the whole engine.
 *
 * Deliberately here rather than on /workspace/settings, which is gated on
 * settings:manage. Somebody trusted with promo codes should be able to turn
 * promo codes on; splitting the two would mean the person who builds a campaign
 * cannot launch it without borrowing a different permission.
 */
export async function setVouchersEnabled(
  _previous: VoucherActionState,
  formData: FormData,
): Promise<VoucherActionState> {
  if (!(await authorized())) return refuse("You do not have access to manage promo codes.");

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("admin_set_vouchers_enabled", {
    p_enabled: formData.get("enabled") === "true",
  });

  if (error) return refuse(errorFor(error.message));
  refresh();
  return { ok: true };
}
