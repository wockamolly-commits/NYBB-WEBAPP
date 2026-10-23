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
  VOUCHER_POSTER_REQUIRED_MESSAGE,
  voucherPosterProblem,
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

  // A new code has no id yet, and a new code needs its poster (0089). Checked
  // beside the schema rather than after it, so a form with a bad amount and no
  // poster is told about both at once.
  const creating = !formData.get("id");
  const posterEntry = formData.get("poster");
  const posterFile = posterEntry instanceof File ? posterEntry : null;
  const posterProblem = creating ? voucherPosterProblem(posterFile) : null;

  if (!parsed.success || posterProblem) {
    // Field messages written into the schema are staff copy and are shown
    // beside the control. A structural complaint is about a request no form
    // could have produced, so it gets the neutral wording.
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.success ? [] : parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !(field in fieldErrors)) {
        fieldErrors[field] = issue.message;
      }
    }
    if (posterProblem) fieldErrors.poster = posterProblem;
    return {
      ok: false,
      error: "Some of this needs another look.",
      fieldErrors,
    };
  }

  const supabase = await createStaffClient();

  // posterProblem has already refused a create with no file, so `!posterFile`
  // never sends a create down this path. It is here so TypeScript knows that.
  if (!creating || !posterFile) {
    const { data, error } = await supabase.rpc("admin_upsert_voucher", {
      p_voucher: voucherRpcPayload(parsed.data),
    });
    if (error) return refuse(errorFor(error.message));
    const savedId = typeof data === "string" ? data : null;
    refresh(savedId);
    return { ok: true, savedId: savedId ?? undefined };
  }

  // The poster goes up first, and the code is created with it in one call.
  // admin_create_voucher writes the terms and the poster in one transaction,
  // so a poster refused anywhere leaves no code behind. A code that is
  // refused (a duplicate, say) leaves only an unreferenced file in the
  // bucket, which is what a replaced poster leaves too.
  const stored = await storePoster(supabase, posterFile);
  if (!stored.ok) {
    return { ok: false, error: stored.error, fieldErrors: { poster: stored.error } };
  }

  const { data, error } = await supabase.rpc("admin_create_voucher", {
    p_voucher: voucherRpcPayload(parsed.data),
    p_poster: stored.poster,
  });
  if (error) {
    const aboutPoster =
      error.message?.includes("POSTER_REQUIRED") || error.message?.includes("INVALID_INPUT");
    const message = aboutPoster ? posterErrorFor(error.message) : errorFor(error.message);
    return aboutPoster
      ? { ok: false, error: message, fieldErrors: { poster: message } }
      : refuse(message);
  }

  const savedId = typeof data === "string" ? data : null;
  refresh(savedId);
  return { ok: true, savedId: savedId ?? undefined };
}

type StaffClient = Awaited<ReturnType<typeof createStaffClient>>;

const voucherIdSchema = z.uuid();

/**
 * errorFor, plus the refusals that are about the poster. INVALID_INPUT on a
 * poster path means the stored poster was refused, and errorFor's generic
 * wording would send the person to retry a save rather than the upload.
 */
function posterErrorFor(message: string | undefined): string {
  if (message?.includes("POSTER_REQUIRED")) return VOUCHER_POSTER_REQUIRED_MESSAGE;
  if (message?.includes("INVALID_INPUT")) {
    return "That poster could not be saved. Try uploading it again.";
  }
  return errorFor(message);
}

type StoredPoster = { url: string; width: number; height: number; blur: string };

/**
 * Check, process and land one poster at a fresh path, and say where it is.
 *
 * Module private because a "use server" file may only export async functions
 * that are meant to be called from a browser, and this one takes a client.
 * Nothing here touches the voucher row: the caller hands the result to
 * admin_create_voucher or admin_set_voucher_poster.
 *
 * The path is `${year}/${randomUUID()}.webp` with upsert: false, for the reason
 * uploadMenuImageObject gives: next.config.ts caches an optimized image for a
 * year, so a replacement has to be a new URL. Uploaded through the signed-in
 * staff client, so 0077's storage policy is what lets it through.
 */
async function storePoster(
  supabase: StaffClient,
  file: File,
): Promise<{ ok: true; poster: StoredPoster } | { ok: false; error: string }> {
  const problem = voucherPosterProblem(file);
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

  return {
    ok: true,
    poster: {
      url: publicUrl.publicUrl,
      width: processed.width,
      height: processed.height,
      blur: processed.blurDataURL,
    },
  };
}

/**
 * Putting a poster on a code, or replacing the one it has.
 *
 * Its own action rather than a field of the main form, for the reason
 * setVoucherPublicise is: a poster is not a term, and once a code has met an
 * order the upsert refuses every save. The artwork on a running promo is the
 * thing an owner most wants to change, so it stays changeable on a locked code.
 *
 * There is no remove. A poster is required from 0089, so it can be replaced
 * and never emptied.
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
  const stored = await storePoster(supabase, file);
  if (!stored.ok) return refuse(stored.error);

  const { error } = await supabase.rpc("admin_set_voucher_poster", {
    p_voucher_id: id.data,
    p_url: stored.poster.url,
    p_width: stored.poster.width,
    p_height: stored.poster.height,
    p_blur: stored.poster.blur,
  });
  if (error) {
    console.error("[workspace] voucher poster could not be set:", error.message);
    return refuse(posterErrorFor(error.message));
  }

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
