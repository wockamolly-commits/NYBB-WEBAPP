"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { STAFF_JOB_ROLES } from "@/lib/staff/roles";
import {
  branchAssignmentSchema,
  permissionChangeSetSchema,
} from "@/lib/staff/team-schemas";
import { getStaffProfile } from "@/lib/staff/session";
import type {
  PermissionActionState,
  WorkspaceAccessActionState,
} from "@/lib/staff/team-types";
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
  if (message?.includes("UNKNOWN_PERMISSION")) {
    return "That permission does not exist. Reload the page and try again.";
  }
  if (message?.includes("NO_CHANGES")) return "Nothing had changed, so nothing was saved.";
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

/**
 * A member's permission changes, saved together.
 *
 * The whole set goes to the database in one call, and that is the point rather
 * than an optimisation: one call is one transaction, so a set that cannot be
 * honoured in full writes nothing. Thirteen calls behind a Save button would
 * fail on the seventh and leave somebody holding four of the changes and not
 * the other three, which is worse than saving each switch as it moved, because
 * at least that version never lied about what had happened.
 *
 * The desired state goes over, not an instruction. Landing on what the role
 * and the branch already give deletes the override row rather than storing
 * agreement, and that rule lives in admin_set_staff_permissions because it
 * needs the role defaults and the business wide list, both of which the
 * database is authoritative for.
 */
export async function setStaffPermissions(
  _previous: PermissionActionState,
  formData: FormData,
): Promise<PermissionActionState> {
  const parsed = permissionChangeSetSchema.safeParse(formData.getAll("change"));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "That save could not be read. Reload the page.",
    };
  }

  const profileId = formData.get("profileId");
  if (typeof profileId !== "string" || profileId === "") {
    return { status: "error", message: "That account could not be read. Reload the page." };
  }

  const profile = await getStaffProfile();
  if (profile?.role !== "admin") {
    return { status: "error", message: "Only the Super Admin can change permissions." };
  }

  const supabase = await createStaffClient();
  const { data, error } = await supabase.rpc("admin_set_staff_permissions", {
    p_profile_id: profileId,
    p_changes: parsed.data,
  });
  if (error) {
    console.error("[workspace] permission save failed:", error.message);
    return { status: "error", message: friendlyError(error.message) };
  }

  // The function returns an outcome per permission. Everything except
  // "unchanged" was a real write, and that count is what the panel reports.
  const outcomes = data as Record<string, string> | null;
  const savedCount = Object.values(outcomes ?? {}).filter(
    (outcome) => outcome !== "unchanged",
  ).length;

  revalidatePath("/workspace/team");
  return { status: "success", savedCount };
}
