"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { STAFF_JOB_ROLES } from "@/lib/staff/roles";
import { branchAssignmentSchema } from "@/lib/staff/team-schemas";
import { getStaffProfile } from "@/lib/staff/session";
import type { WorkspaceAccessActionState } from "@/lib/staff/team-types";
import { createStaffClient } from "@/lib/supabase/server";

const accessSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim().toLowerCase(),
  staffRole: z.enum(STAFF_JOB_ROLES),
  branchId: branchAssignmentSchema,
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
});

function friendlyError(message: string | undefined): string {
  if (message?.includes("ACCOUNT_NOT_FOUND")) {
    return "No account exists for that email yet. Ask them to sign in on the website once, then try again.";
  }
  if (message?.includes("CANNOT_CHANGE_SELF")) return "You cannot change your own access.";
  if (message?.includes("CANNOT_CHANGE_ADMIN")) return "Another admin account cannot be changed here.";
  if (message?.includes("ACCESS_NOT_FOUND")) return "That account has no Workspace access to revoke.";
  if (message?.includes("INVALID_BRANCH")) {
    return "That branch no longer exists. Reload the page and choose again.";
  }
  if (message?.includes("FORBIDDEN")) return "Only the Super Admin can change Workspace access.";
  return "Workspace access could not be updated. Try again.";
}

export async function setWorkspaceAccess(
  _previous: WorkspaceAccessActionState,
  formData: FormData,
): Promise<WorkspaceAccessActionState> {
  const parsed = accessSchema.safeParse({
    email: formData.get("email"),
    staffRole: formData.get("staffRole"),
    branchId: formData.get("branchId"),
    active: formData.get("active"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the access details and try again.",
    };
  }

  const profile = await getStaffProfile();
  if (profile?.role !== "admin") {
    return { status: "error", message: "Only the Super Admin can change Workspace access." };
  }

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("admin_set_workspace_access", {
    p_email: parsed.data.email,
    p_staff_role: parsed.data.staffRole,
    p_branch_id: parsed.data.branchId,
    p_active: parsed.data.active,
  });
  if (error) {
    console.error("[workspace] access update failed:", error.message);
    return { status: "error", message: friendlyError(error.message) };
  }

  revalidatePath("/workspace/team");
  return {
    status: "success",
    message: parsed.data.active ? "Workspace access saved." : "Workspace access revoked.",
  };
}
