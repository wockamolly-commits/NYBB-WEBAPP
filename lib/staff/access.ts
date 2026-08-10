import "server-only";

import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin-client";
import { isStaffJobRole, type StaffJobRole } from "./roles";

export type StaffEmailAccess =
  | { kind: "super_admin" }
  | { kind: "staff"; profileId: string; staffRole: StaffJobRole }
  | null;

const accessRowsSchema = z.array(
  z.object({
    profile_id: z.uuid(),
    profile_role: z.enum(["admin", "staff"]),
    profile_staff_role: z.enum(["cashier", "kitchen", "manager"]).nullable(),
  }),
);

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isConfiguredSuperAdminEmail(email: string): boolean {
  const configured = process.env.SUPER_ADMIN_EMAIL;
  return Boolean(configured && normalizedEmail(configured) === normalizedEmail(email));
}

export async function resolveStaffEmailAccess(email: string): Promise<StaffEmailAccess> {
  if (isConfiguredSuperAdminEmail(email)) return { kind: "super_admin" };
  if (!adminConfigured()) return null;

  const { data, error } = await createAdminClient().rpc("resolve_active_staff_email", {
    p_email: normalizedEmail(email),
  });
  if (error) throw error;

  const parsed = accessRowsSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Staff email lookup returned an unreadable result.");
  }

  const row = parsed.data[0];
  if (!row) return null;
  // SUPER_ADMIN_EMAIL is the only authority for an admin session. A stale
  // admin profile must not grant access after that configuration changes.
  if (row.profile_role === "admin") return null;
  if (!isStaffJobRole(row.profile_staff_role)) return null;
  return { kind: "staff", profileId: row.profile_id, staffRole: row.profile_staff_role };
}

/** Provision the one env-authorized Super Admin after Auth verifies the OTP. */
export async function provisionConfiguredSuperAdmin(user: User): Promise<void> {
  if (!user.email || !isConfiguredSuperAdminEmail(user.email)) {
    throw new Error("This user is not the configured Super Admin.");
  }
  if (!adminConfigured()) throw new Error("The service-role client is not configured.");

  const metadataName = user.user_metadata?.display_name;
  const displayName =
    typeof metadataName === "string" && metadataName.trim()
      ? metadataName.trim()
      : null;
  const { error } = await createAdminClient().rpc("provision_configured_super_admin", {
    p_user_id: user.id,
    p_display_name: displayName,
  });
  if (error) throw error;
}
