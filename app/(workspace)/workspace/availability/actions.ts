"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AvailabilityActionState } from "@/lib/staff/availability-types";
import { getStaffProfile, hasStaffPermission } from "@/lib/staff/session";
import { createStaffClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  branchId: z.uuid(),
  accepting: z.enum(["true", "false"]).transform((value) => value === "true"),
});

function friendly(message: string | undefined): string {
  if (message?.includes("FORBIDDEN") || message?.includes("BRANCH_FORBIDDEN")) {
    return "You do not have access to change this counter.";
  }
  if (message?.includes("BRANCH_NOT_FOUND")) return "That counter is no longer available.";
  return "The counter status could not be updated. Try again.";
}

/** Pause or resume the caller's own counter. The RPC repeats this permission and scope check. */
export async function setBranchOrderIntake(
  _previous: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const parsed = inputSchema.safeParse({
    branchId: formData.get("branchId"),
    accepting: formData.get("accepting"),
  });
  if (!parsed.success) return { status: "error", message: "Check the counter status and try again." };

  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "store:availability")) {
    return { status: "error", message: "You do not have access to change store availability." };
  }

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_set_branch_accepting_orders", {
    p_branch_id: parsed.data.branchId,
    p_accepting: parsed.data.accepting,
  });
  if (error) {
    console.error("[workspace] branch availability update failed:", error.message);
    return { status: "error", message: friendly(error.message) };
  }

  revalidatePath("/workspace/availability");
  revalidatePath("/workspace/settings");
  revalidatePath("/workspace");
  return {
    status: "success",
    message: parsed.data.accepting ? "This counter is taking orders again." : "This counter is paused.",
  };
}
