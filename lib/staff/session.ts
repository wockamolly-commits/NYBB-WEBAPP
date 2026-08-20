import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { safeStaffNextPath } from "@/lib/auth/redirect";
import { createReadOnlyStaffClient, supabaseConfigured } from "@/lib/supabase/server";
import { isConfiguredSuperAdminEmail } from "./access";
import {
  isStaffPermission,
  resolvePermissions,
  STAFF_JOB_ROLES,
  type PermissionOverride,
  type StaffJobRole,
  type StaffPermission,
} from "./roles";

export const WORKSPACE_HOME = "/workspace";

export type StaffProfile = {
  id: string;
  role: "admin" | "staff";
  staffRole: StaffJobRole | null;
  displayName: string;
  branchId: string | null;
  permissions: StaffPermission[];
};

const profileSchema = z.object({
  id: z.uuid(),
  role: z.enum(["admin", "staff"]),
  staff_role: z.enum(STAFF_JOB_ROLES).nullable(),
  display_name: z.string().min(1),
  branch_id: z.uuid().nullable(),
});

const overrideRowsSchema = z.array(
  z.object({ permission: z.string(), granted: z.boolean() }),
);

export function hasStaffPermission(
  profile: Pick<StaffProfile, "role" | "permissions">,
  permission: StaffPermission,
): boolean {
  return profile.role === "admin" || profile.permissions.includes(permission);
}

export const getStaffSessionUser = cache(async (): Promise<User | null> => {
  if (!supabaseConfigured()) return null;
  const supabase = await createReadOnlyStaffClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * The database role is re-read on every workspace request. A deactivated
 * profile therefore loses access immediately, without waiting for Auth tokens
 * or client navigation state to expire.
 */
export const getStaffProfile = cache(async (): Promise<StaffProfile | null> => {
  const user = await getStaffSessionUser();
  if (!user) return null;

  const supabase = await createReadOnlyStaffClient();
  const [profileResult, overridesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, role, staff_role, display_name, branch_id")
      .eq("id", user.id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("staff_permission_overrides")
      .select("permission, granted")
      .eq("profile_id", user.id),
  ]);

  if (profileResult.error) {
    console.error("[staff-auth] profile lookup failed:", profileResult.error.message);
    return null;
  }
  if (overridesResult.error) {
    console.error("[staff-auth] permission lookup failed:", overridesResult.error.message);
    return null;
  }

  const parsedProfile = profileSchema.safeParse(profileResult.data);
  const parsedOverrides = overrideRowsSchema.safeParse(overridesResult.data ?? []);
  if (!parsedProfile.success || !parsedOverrides.success) {
    console.error("[staff-auth] profile or permissions had an unreadable shape");
    return null;
  }

  if (parsedProfile.data.role === "staff" && parsedProfile.data.staff_role === null) {
    return null;
  }
  if (
    parsedProfile.data.role === "admin" &&
    (!user.email || !isConfiguredSuperAdminEmail(user.email))
  ) {
    return null;
  }

  const overrides: PermissionOverride[] = parsedOverrides.data
    .filter((row) => isStaffPermission(row.permission))
    .map((row) => ({
      permission: row.permission as StaffPermission,
      granted: row.granted,
    }));

  return {
    id: parsedProfile.data.id,
    role: parsedProfile.data.role,
    staffRole: parsedProfile.data.staff_role,
    displayName: parsedProfile.data.display_name,
    branchId: parsedProfile.data.branch_id,
    permissions: resolvePermissions(parsedProfile.data.staff_role, overrides),
  };
});

export async function requireStaff(
  returnTo = WORKSPACE_HOME,
): Promise<{ user: User; profile: StaffProfile }> {
  const destination = safeStaffNextPath(returnTo);
  const user = await getStaffSessionUser();
  if (!user) redirect(`/auth/workspace?next=${encodeURIComponent(destination)}`);

  const profile = await getStaffProfile();
  if (!profile) redirect(`/auth/workspace?next=${encodeURIComponent(destination)}`);
  return { user, profile };
}

export async function requireStaffPermission(
  permission: StaffPermission,
  returnTo = WORKSPACE_HOME,
): Promise<{ user: User; profile: StaffProfile }> {
  const context = await requireStaff(returnTo);
  if (!hasStaffPermission(context.profile, permission)) redirect(WORKSPACE_HOME);
  return context;
}
