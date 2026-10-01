"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { notifyCustomersOfPromo } from "@/lib/push/dispatch";
import { revalidatePath } from "next/cache";
import { getStaffProfile, hasStaffPermission } from "@/lib/staff/session";
import { processPosterImage } from "@/lib/staff/voucher-poster";
import {
  VOUCHER_POSTER_BUCKET,
  VOUCHER_POSTER_CACHE_CONTROL,
  VOUCHER_POSTER_CONTENT_TYPE,
  VOUCHER_POSTER_EXTENSION,
  VOUCHER_POSTER_MAX_BYTES,
  VOUCHER_POSTER_SIZE_MESSAGE,
  VOUCHER_POSTER_TYPE_MESSAGE,
  isAcceptablePosterFile,
} from "@/lib/staff/voucher-poster-limits";
import { createStaffClient } from "@/lib/supabase/server";
import { voucherFormInput, voucherRpcPayload } from "@/lib/vouchers/form";
import { parseVoucherOrder } from "@/lib/vouchers/order";
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
  if (message?.includes("NOT_PUBLICISED")) {
    return "One of those codes is no longer on the storefront. Reload the page and try again.";
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

  // A poster chosen on the create form rides along here, after the code
  // exists, because the poster is keyed to its id. The code is saved either
  // way: a poster that fails is reported beside the poster field and can be
  // tried again from the edit screen, and a failed image must never cost the
  // person the whole form they just filled in.
  let posterError: string | undefined;
  const posterEntry = formData.get("poster");
  if (savedId && posterEntry instanceof File && posterEntry.size > 0) {
    const attached = await attachPoster(supabase, savedId, posterEntry);
    if (!attached.ok) posterError = attached.error;
  }

  refresh(savedId);
  return { ok: true, savedId: savedId ?? undefined, posterError };
}

type StaffClient = Awaited<ReturnType<typeof createStaffClient>>;

const voucherIdSchema = z.uuid();

/**
 * errorFor, plus the one refusal that means something specific here. Only
 * admin_set_voucher_poster raises INVALID_INPUT for a poster, and errorFor's
 * generic wording would send the person to retry a save rather than the upload.
 */
function posterErrorFor(message: string | undefined): string {
  if (message?.includes("INVALID_INPUT")) {
    return "That poster could not be saved. Try uploading it again.";
  }
  return errorFor(message);
}

/** The file checks both poster paths run, before sharp sees a byte. */
function posterFileProblem(file: File): string | null {
  // By name as well as declared type, for the Windows reason
  // isDecodableImageFile records. processPosterImage checks the real bytes.
  if (!isAcceptablePosterFile(file.name, file.type)) return VOUCHER_POSTER_TYPE_MESSAGE;
  if (file.size > VOUCHER_POSTER_MAX_BYTES) return VOUCHER_POSTER_SIZE_MESSAGE;
  return null;
}

/**
 * Process one poster, land it at a fresh path and point the voucher at it.
 *
 * Module private because a "use server" file may only export async functions
 * that are meant to be called from a browser, and this one takes a client.
 *
 * The path is `${year}/${randomUUID()}.webp` with upsert: false, for the reason
 * uploadMenuImageObject gives: next.config.ts caches an optimized image for a
 * year, so a replacement has to be a new URL. Uploaded through the signed-in
 * staff client, so 0077's storage policy is what lets it through.
 */
async function attachPoster(
  supabase: StaffClient,
  voucherId: string,
  file: File,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const problem = posterFileProblem(file);
  if (problem) return { ok: false, error: problem };

  let processed;
  try {
    processed = await processPosterImage(file);
  } catch (cause) {
    console.error("[workspace] voucher poster processing failed:", cause);
    return { ok: false, error: "That file could not be read as an image." };
  }

  const objectPath = `${new Date().getUTCFullYear()}/${randomUUID()}.${VOUCHER_POSTER_EXTENSION}`;
  const { error: uploadError } = await supabase.storage
    .from(VOUCHER_POSTER_BUCKET)
    .upload(objectPath, processed.data, {
      contentType: VOUCHER_POSTER_CONTENT_TYPE,
      cacheControl: VOUCHER_POSTER_CACHE_CONTROL,
      upsert: false,
    });
  if (uploadError) {
    console.error("[workspace] voucher poster upload failed:", uploadError.message);
    return { ok: false, error: "The poster could not be uploaded. Try again." };
  }

  const { data: publicUrl } = supabase.storage
    .from(VOUCHER_POSTER_BUCKET)
    .getPublicUrl(objectPath);

  const { error } = await supabase.rpc("admin_set_voucher_poster", {
    p_voucher_id: voucherId,
    p_url: publicUrl.publicUrl,
    p_width: processed.width,
    p_height: processed.height,
    p_blur: processed.blurDataURL,
  });
  if (error) {
    console.error("[workspace] voucher poster could not be set:", error.message);
    return { ok: false, error: posterErrorFor(error.message) };
  }
  return { ok: true };
}

/**
 * Putting a poster on a code, or replacing the one it has.
 *
 * Its own action rather than a field of the main form, for the reason
 * setVoucherPublicise is: a poster is not a term, and once a code has met an
 * order the upsert refuses every save. The artwork on a running promo is the
 * thing an owner most wants to change, so it stays changeable on a locked code.
 */
export async function uploadVoucherPoster(
  _previous: VoucherActionState,
  formData: FormData,
): Promise<VoucherActionState> {
  if (!(await authorized())) return refuse("You do not have access to manage promo codes.");

  const id = voucherIdSchema.safeParse(formData.get("id"));
  if (!id.success) return refuse("We could not tell which code that was.");

  const file = formData.get("poster");
  if (!(file instanceof File) || file.size === 0) return refuse("Choose a poster first.");

  const supabase = await createStaffClient();
  const attached = await attachPoster(supabase, id.data, file);
  if (!attached.ok) return refuse(attached.error);

  refresh(id.data);
  return { ok: true };
}

/**
 * Taking the poster off a code. The code itself is untouched and keeps
 * appearing on /promos as a plain card. The object stays in the bucket, as a
 * replaced menu photograph does: there is no delete policy, by design.
 */
export async function removeVoucherPoster(
  _previous: VoucherActionState,
  formData: FormData,
): Promise<VoucherActionState> {
  if (!(await authorized())) return refuse("You do not have access to manage promo codes.");

  const id = voucherIdSchema.safeParse(formData.get("id"));
  if (!id.success) return refuse("We could not tell which code that was.");

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("admin_set_voucher_poster", {
    p_voucher_id: id.data,
    p_url: null,
    p_width: null,
    p_height: null,
    p_blur: null,
  });
  if (error) return refuse(posterErrorFor(error.message));

  refresh(id.data);
  return { ok: true };
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
 * The storefront order: which promo leads and is featured (migration 0078).
 *
 * The panel posts the whole order, first to last, every time, and the
 * function applies it in one statement. Posting a single "move this up" would
 * let two people reordering at once each move from a list the other had
 * already changed. An empty order puts the storefront back to automatic,
 * soonest ending first.
 *
 * Its own action, outside the form, for the reason publicise is: it is not a
 * term, so it stays changeable on a code that has met an order.
 */
export async function setVoucherOrder(
  _previous: VoucherActionState,
  formData: FormData,
): Promise<VoucherActionState> {
  if (!(await authorized())) return refuse("You do not have access to manage promo codes.");

  const order = parseVoucherOrder(formData.get("order"));
  if (!order.ok) return refuse("We could not read that order. Reload the page and try again.");

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("admin_set_voucher_order", {
    p_voucher_ids: order.ids,
  });

  if (error) return refuse(errorFor(error.message));
  refresh();
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
