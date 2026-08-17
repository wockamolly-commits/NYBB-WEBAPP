"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/staff/session";
import { createStaffClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  id: z.uuid(),
  handled: z.boolean(),
});

export type TriageResult = { ok: true } | { ok: false; message: string };

/**
 * Marking a franchise lead dealt with, or putting it back.
 *
 * The admin check is made twice on purpose, and the two are not redundant. This
 * one gives a person a sentence they can act on. The one inside
 * `set_franchise_inquiry_handled` is the one that actually holds, because it
 * runs whether the caller came through this action or not.
 */
export async function setLeadHandled(
  id: string,
  handled: boolean,
): Promise<TriageResult> {
  const parsed = inputSchema.safeParse({ id, handled });
  if (!parsed.success) {
    return { ok: false, message: "That lead could not be identified." };
  }

  const { profile } = await requireStaff("/workspace/franchise");
  if (profile.role !== "admin") {
    return { ok: false, message: "Only the owner can triage franchise leads." };
  }

  const supabase = await createStaffClient();
  const { data, error } = await supabase.rpc("set_franchise_inquiry_handled", {
    p_id: parsed.data.id,
    p_handled: parsed.data.handled,
  });

  if (error) {
    console.error("[workspace] set_franchise_inquiry_handled failed:", error.message);
    return { ok: false, message: "That did not save. Try again." };
  }

  if (data !== true) {
    // The function found no row. The likeliest cause is two people working the
    // list and one of them reloading, so this is a stale screen rather than a
    // fault.
    return { ok: false, message: "That lead is no longer there. Reload the list." };
  }

  revalidatePath("/workspace/franchise");
  return { ok: true };
}
