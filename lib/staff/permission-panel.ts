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
  unsaved: number;
};

/**
 * The heading count: "7/13 on, 2 changed", plus how many are waiting on Save.
 *
 * Every number is taken over MANAGEABLE_PERMISSIONS rather than over the
 * override rows, so a row for a permission the panel does not offer, which can
 * only come from a hand edit, cannot move a count that has no switch to
 * account for it.
 */
export function summarizePermissions(
  role: StaffJobRole | null,
  branchId: string | null,
  overrides: readonly PermissionOverride[],
  pending: PendingChanges = {},
): PermissionSummary {
  let on = 0;
  let changed = 0;
  let unsaved = 0;
  for (const row of panelRows(role, branchId, overrides, pending)) {
    if (row.on) on += 1;
    if (!row.isDefault) changed += 1;
    if (row.unsaved) unsaved += 1;
  }
  return { on, total: MANAGEABLE_PERMISSIONS.length, changed, unsaved };
}

/**
 * The switches that have been moved and not yet saved.
 *
 * Keyed by permission, holding the state the Super Admin has asked for. The
 * invariant that makes everything else simple: a key is present only while it
 * DISAGREES with what is saved. Moving a switch and moving it straight back
 * leaves the map empty, so "is there anything to save" is a question about its
 * size rather than a comparison somebody has to remember to run, and the Save
 * button cannot offer to write a change that is not one.
 */
export type PendingChanges = Partial<Record<StaffPermission, boolean>>;

/** What the switch is showing: the pending answer if there is one, else the saved one. */
export function displayedOn(
  role: StaffJobRole | null,
  branchId: string | null,
  overrides: readonly PermissionOverride[],
  pending: PendingChanges,
  permission: StaffPermission,
): boolean {
  return pending[permission] ?? permissionRowState(role, branchId, overrides, permission).on;
}

/**
 * Moving one switch, and keeping the invariant above.
 *
 * Returns a new map rather than mutating, because it is React state.
 */
export function togglePending(
  role: StaffJobRole | null,
  branchId: string | null,
  overrides: readonly PermissionOverride[],
  pending: PendingChanges,
  permission: StaffPermission,
): PendingChanges {
  const saved = permissionRowState(role, branchId, overrides, permission).on;
  const next = !displayedOn(role, branchId, overrides, pending, permission);
  const result = { ...pending };
  if (next === saved) delete result[permission];
  else result[permission] = next;
  return result;
}

export type PanelRow = PermissionRowState & {
  permission: StaffPermission;
  /** Moved since the last save, and not written yet. */
  unsaved: boolean;
};

/**
 * Every row the panel draws, with the pending changes folded in.
 *
 * isDefault is computed against what the switch is SHOWING, not against what
 * is saved, so the DEFAULT badge answers "if you saved this now, would there
 * be an override row" rather than describing a state that has been moved away
 * from on screen.
 */
export function panelRows(
  role: StaffJobRole | null,
  branchId: string | null,
  overrides: readonly PermissionOverride[],
  pending: PendingChanges = {},
): PanelRow[] {
  return MANAGEABLE_PERMISSIONS.map((permission) => {
    const saved = permissionRowState(role, branchId, overrides, permission);
    const on = pending[permission] ?? saved.on;
    return {
      permission,
      on,
      defaultOn: saved.defaultOn,
      isDefault: on === saved.defaultOn,
      unsaved: permission in pending,
    };
  });
}
