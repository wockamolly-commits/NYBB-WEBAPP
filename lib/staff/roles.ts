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

const ALL_PERMISSIONS = Object.keys(PERMISSION_KEYS) as StaffPermission[];

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

/** Role defaults, with each per-person row forcing one permission on or off. */
export function resolvePermissions(
  role: StaffJobRole | null,
  overrides: readonly PermissionOverride[],
): StaffPermission[] {
  const permissions = new Set<StaffPermission>(roleDefaultPermissions(role));
  for (const override of overrides) {
    if (override.granted) permissions.add(override.permission);
    else permissions.delete(override.permission);
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
