"use server";

import { revalidatePath } from "next/cache";
import { getStaffProfile, hasStaffPermission } from "@/lib/staff/session";
import { createStaffClient } from "@/lib/supabase/server";
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

/**
 * Split the phone textarea into numbers.
 *
 * One per line is what the field asks for, but people paste comma-separated
 * lists, so both are accepted. Normalising to digits happens in SQL, where the
 * redemption count reads the same function, rather than here where a second
 * implementation could drift from it.
 */
function phoneLines(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter((value) => value !== "");
}

export async function saveVoucher(
  _previous: VoucherActionState,
  formData: FormData,
): Promise<VoucherActionState> {
  if (!(await authorized())) return refuse("You do not have access to manage promo codes.");

  const parsed = voucherFormSchema.safeParse({
    id: formData.get("id") ?? "",
    code: formData.get("code") ?? "",
    description: formData.get("description") ?? "",
    note: formData.get("note") ?? "",
    discountKind: formData.get("discountKind") ?? "fixed",
    amountPesos: formData.get("amountPesos") ?? "",
    percentOff: formData.get("percentOff") ?? "",
    maxDiscountPesos: formData.get("maxDiscountPesos") ?? "",
    minOrderPesos: formData.get("minOrderPesos") ?? "",
    maxUses: formData.get("maxUses") ?? "",
    maxUsesPerCustomer: formData.get("maxUsesPerCustomer") ?? "1",
    startsAt: formData.get("startsAt") ?? "",
    expiresAt: formData.get("expiresAt") ?? "",
    isActive: formData.get("isActive") === "true",
    branchIds: formData.getAll("branchIds").map(String),
    itemIds: formData.getAll("itemIds").map(String),
    categoryIds: formData.getAll("categoryIds").map(String),
    customerPhones: phoneLines(formData.get("customerPhones")),
  });

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
    p_voucher: {
      id: parsed.data.id,
      code: parsed.data.code,
      description: parsed.data.description,
      note: parsed.data.note,
      amountCents: parsed.data.amountCents,
      percentOff: parsed.data.percentOff,
      maxDiscountCents: parsed.data.maxDiscountCents,
      minOrderCents: parsed.data.minOrderCents,
      maxUses: parsed.data.maxUses,
      maxUsesPerCustomer: parsed.data.maxUsesPerCustomer,
      startsAt: parsed.data.startsAt,
      expiresAt: parsed.data.expiresAt,
      isActive: parsed.data.isActive,
      branchIds: parsed.data.branchIds,
      itemIds: parsed.data.itemIds,
      categoryIds: parsed.data.categoryIds,
      customerPhones: parsed.data.customerPhones,
      customerUserIds: [],
    },
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
