import "server-only";

import { z } from "zod";
import { STAFF_JOB_ROLES } from "@/lib/staff/roles";
import { createReadOnlyStaffClient } from "@/lib/supabase/server";
import type { AssignableBranch, WorkspaceMember } from "./team-types";

const memberRowsSchema = z.array(
  z.object({
    profile_id: z.uuid(),
    email: z.email(),
    display_name: z.string().min(1),
    profile_role: z.enum(["admin", "staff"]),
    profile_staff_role: z.enum(STAFF_JOB_ROLES).nullable(),
    branch_id: z.uuid().nullable(),
    is_active: z.boolean(),
    created_at: z.iso.datetime({ offset: true }),
  }),
);

export async function getWorkspaceMembers(): Promise<WorkspaceMember[] | null> {
  const supabase = await createReadOnlyStaffClient();
  const { data, error } = await supabase.rpc("admin_list_workspace_access");
  if (error) {
    console.error("[workspace] access list failed:", error.message);
    return null;
  }

  const parsed = memberRowsSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[workspace] access list had an unreadable shape", parsed.error.issues);
    return null;
  }

  return parsed.data.map((row) => ({
    profileId: row.profile_id,
    email: row.email,
    displayName: row.display_name,
    role: row.profile_role,
    staffRole: row.profile_staff_role,
    branchId: row.branch_id,
    isActive: row.is_active,
    createdAt: row.created_at,
  }));
}

const branchRowsSchema = z.array(
  z.object({
    id: z.uuid(),
    short_name: z.string().min(1),
    is_active: z.boolean(),
  }),
);

/**
 * The branches the team screen offers.
 *
 * Only the Super Admin opens that screen, and the Super Admin is business wide,
 * so the branch-scoped read policy from 0059 returns every row here. A branch
 * manager reading this would see only their own, which is why the screen stays
 * admin only rather than gated on a permission.
 */
export async function listAssignableBranches(): Promise<AssignableBranch[] | null> {
  const supabase = await createReadOnlyStaffClient();
  const { data, error } = await supabase
    .from("branches")
    .select("id, short_name, is_active")
    .order("sort_order")
    .order("short_name");
  if (error) {
    console.error("[workspace] branch list failed:", error.message);
    return null;
  }

  const parsed = branchRowsSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[workspace] branch list had an unreadable shape", parsed.error.issues);
    return null;
  }

  return parsed.data.map((row) => ({
    id: row.id,
    shortName: row.short_name,
    isActive: row.is_active,
  }));
}
