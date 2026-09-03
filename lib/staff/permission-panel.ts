import { MANAGEABLE_PERMISSIONS } from "./permission-catalog";
import {
  resolvePermissions,
  type PermissionOverride,
  type StaffJobRole,
  type StaffPermission,
} from "./roles";

/**
 * What one switch on the Workspace access panel shows.
 *
 * WHY THIS IS NOT ROLE_PERMISSIONS[role].
 *
 * "What the role gives" has to be read after branch scoping, not before. A
 * Manager assigned to a counter does not inherit menu:configure, because the
 * catalog is one shared list and 0059 takes the business wide permissions off
 * an assigned profile. So the effective default for that switch is off, and an
 * override row granting it is the only thing that can turn it on.
 *
 * Read it the other way round and the switch silently breaks: turning
 * menu:configure on for an assigned manager would look like a return to the
 * Manager default, delete the row instead of writing one, and leave the
 * permission off. The screen would say yes and the database would say no.
 *
 * resolvePermissions() with no overrides is exactly that answer, and it is the
 * same function the session uses, so there is no second opinion to keep in
 * step. The database computes the same thing its own way in
 * admin_set_staff_permission, which is what actually decides whether a row is
 * written or deleted; this side decides only what the person sees before they
 * press it.
 */
export type PermissionRowState = {
  /** Whether the person holds it now. */
  on: boolean;
  /** Whether that answer comes from the role rather than from an override row. */
  isDefault: boolean;
  /** What the role and branch alone would give, which is what the switch returns to. */
  defaultOn: boolean;
};

function defaultsFor(
  role: StaffJobRole | null,
  branchId: string | null,
): Set<StaffPermission> {
  return new Set(resolvePermissions(role, [], branchId));
}

export function permissionRowState(
  role: StaffJobRole | null,
  branchId: string | null,
  overrides: readonly PermissionOverride[],
  permission: StaffPermission,
): PermissionRowState {
  const defaultOn = defaultsFor(role, branchId).has(permission);
  const override = overrides.find((row) => row.permission === permission);

  // An override that agrees with the default is not a decision to show. The
  // action deletes the row when a switch lands on its default, so one can only
  // arrive from an older hand edit, and calling it a change would put a count
  // on the heading that nothing on screen explains.
  if (!override || override.granted === defaultOn) {
    return { on: defaultOn, isDefault: true, defaultOn };
  }
  return { on: override.granted, isDefault: false, defaultOn };
}

export type PermissionSummary = {
  on: number;
  total: number;
  changed: number;
};

/**
 * The heading count: "7/13 on, 2 changed".
 *
 * Both numbers are taken over MANAGEABLE_PERMISSIONS rather than over the
 * override rows, so a row for a permission the panel does not offer, which can
 * only come from a hand edit, cannot move a count that has no switch to
 * account for it.
 */
export function summarizePermissions(
  role: StaffJobRole | null,
  branchId: string | null,
  overrides: readonly PermissionOverride[],
): PermissionSummary {
  let on = 0;
  let changed = 0;
  for (const permission of MANAGEABLE_PERMISSIONS) {
    const row = permissionRowState(role, branchId, overrides, permission);
    if (row.on) on += 1;
    if (!row.isDefault) changed += 1;
  }
  return { on, total: MANAGEABLE_PERMISSIONS.length, changed };
}
