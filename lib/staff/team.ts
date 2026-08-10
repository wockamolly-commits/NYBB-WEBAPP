import "server-only";

import { z } from "zod";
import { createReadOnlyStaffClient } from "@/lib/supabase/server";
import type { WorkspaceMember } from "./team-types";

const memberRowsSchema = z.array(
  z.object({
    profile_id: z.uuid(),
    email: z.email(),
    display_name: z.string().min(1),
    profile_role: z.enum(["admin", "staff"]),
    profile_staff_role: z.enum(["cashier", "kitchen", "manager"]).nullable(),
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
