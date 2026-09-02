/**
 * The jobs that need this web app.
 *
 * There is deliberately no Kitchen role. The kitchen already works from the POS
 * system's own monitor, so a Workspace login for it would put a second screen
 * beside the first one showing the same tickets: two places to mark the same
 * order, and a queue that stalls whenever the two disagree. Anyone who needs
 * this app has it as Cashier or Manager.
 *
 * This tuple is the list, in the order the Workspace access page offers it.
 * STAFF_ROLES and ROLE_PERMISSIONS are keyed by it, so a role added or removed
 * here is a type error everywhere it has not been accounted for.
 */
export const STAFF_JOB_ROLES = ["cashier", "manager"] as const;

export type StaffJobRole = (typeof STAFF_JOB_ROLES)[number];

export const STAFF_ROLES: Record<
  StaffJobRole,
  { label: string; description: string }
> = {
  cashier: {
    label: "Cashier",
    description: "Receive orders, manage the counter, and update availability.",
  },
  manager: {
    label: "Manager",
    description: "Run orders, menu, promotions, reporting, and store settings.",
  },
};

export type StaffPermission =
  | "dashboard:view"
  | "orders:view"
  | "orders:manage"
  | "menu:view"
  | "menu:availability"
  | "menu:configure"
  | "pos:manage"
  | "analytics:view"
  | "vouchers:manage"
  | "store:availability"
  | "settings:manage"
  | "audit:view"
  | "team:manage"
  | "refunds:manage";

const ROLE_PERMISSIONS: Record<StaffJobRole, readonly StaffPermission[]> = {
  cashier: [
    "dashboard:view",
    "orders:view",
    "orders:manage",
    "menu:view",
    "menu:availability",
    "pos:manage",
    "store:availability",
  ],
  manager: [
    "dashboard:view",
    "orders:view",
    "orders:manage",
    "menu:view",
    "menu:availability",
    "menu:configure",
    "pos:manage",
    "analytics:view",
    "vouchers:manage",
    "store:availability",
    "settings:manage",
    "audit:view",
    "refunds:manage",
  ],
};

const PERMISSION_KEYS: Record<StaffPermission, true> = {
  "dashboard:view": true,
  "orders:view": true,
  "orders:manage": true,
  "menu:view": true,
  "menu:availability": true,
  "menu:configure": true,
  "pos:manage": true,
  "analytics:view": true,
  "vouchers:manage": true,
  "store:availability": true,
  "settings:manage": true,
  "audit:view": true,
  "team:manage": true,
  "refunds:manage": true,
};

/**
 * Every permission, derived from the exhaustive key map above rather than
 * written out a second time. Exported so a test can walk the whole union and
 * check the app and the database give the same answer for each one.
 */
export const ALL_PERMISSIONS = Object.keys(PERMISSION_KEYS) as StaffPermission[];

/**
 * The permissions that act on the whole business rather than on one counter.
 *
 * The menu catalog carries no branch. menu_items, menu_categories, the option
 * groups and the price tables are one shared list, so a manager pinned to a
 * single counter who renames an item or moves a price is doing it to all nine.
 * A branch-assigned profile therefore does not inherit one of these from its
 * job role. The Super Admin hands it over one person at a time, with an
 * override row, which is the same mechanism that already layers on top of the
 * role defaults.
 *
 * business_wide_permission() in migration 0059 is the database's copy of this
 * list, and tests/sql/staff-business-wide-permissions.test.ts fails if the two
 * disagree.
 */
export const BUSINESS_WIDE_PERMISSIONS = ["menu:configure"] as const satisfies
  readonly StaffPermission[];

export type PermissionOverride = {
  permission: StaffPermission;
  granted: boolean;
};

export type WorkspaceAccessSummary = {
  role: "admin" | "staff";
  permissions: readonly StaffPermission[];
};

export function isStaffJobRole(value: unknown): value is StaffJobRole {
  return STAFF_JOB_ROLES.includes(value as StaffJobRole);
}

export function isStaffPermission(value: unknown): value is StaffPermission {
  return typeof value === "string" && ALL_PERMISSIONS.includes(value as StaffPermission);
}

export function roleDefaultPermissions(
  role: StaffJobRole | null,
): readonly StaffPermission[] {
  return role ? ROLE_PERMISSIONS[role] : [];
}

/**
 * Role defaults, with each per-person row forcing one permission on or off,
 * and then the branch.
 *
 * A branchId of null is business wide, not unknown. That is the reading the
 * database has used since 0023, and it is why an unassigned profile keeps
 * everything its role gives it. An assigned profile loses the business wide
 * permissions unless an override row put one back, so the counter it works is
 * the limit of what it can change.
 */
export function resolvePermissions(
  role: StaffJobRole | null,
  overrides: readonly PermissionOverride[],
  branchId: string | null,
): StaffPermission[] {
  const permissions = new Set<StaffPermission>(roleDefaultPermissions(role));
  for (const override of overrides) {
    if (override.granted) permissions.add(override.permission);
    else permissions.delete(override.permission);
  }
  if (branchId !== null) {
    const granted = new Set(
      overrides.filter((override) => override.granted).map((o) => o.permission),
    );
    for (const permission of BUSINESS_WIDE_PERMISSIONS) {
      if (!granted.has(permission)) permissions.delete(permission);
    }
  }
  return [...permissions];
}

/** The first protected page this person can actually use. */
export function workspaceLandingPath(
  access: WorkspaceAccessSummary,
): "/workspace" | "/workspace/orders" | "/workspace/profile" {
  if (access.role === "admin" || access.permissions.includes("dashboard:view")) {
    return "/workspace";
  }
  if (access.permissions.includes("orders:view")) return "/workspace/orders";
  return "/workspace/profile";
}
