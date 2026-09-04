import type { StaffPermission } from "./roles";

/**
 * What each permission is called, and what it opens, in words for the person
 * handing it out rather than for the person who wrote the check.
 *
 * These live here rather than beside the switches because two screens read
 * them: the Workspace access panel, where the Super Admin grants them, and
 * /workspace/profile, where a member reads back what they hold. Keeping one
 * copy is the point. Both are Record<StaffPermission, string>, so a permission
 * added to the union without a label is a type error rather than a blank row.
 */
export const PERMISSION_LABELS: Record<StaffPermission, string> = {
  "dashboard:view": "View dashboard",
  "orders:view": "View orders",
  "orders:manage": "Manage orders",
  "menu:view": "View menu",
  "menu:availability": "Change menu availability",
  "menu:configure": "Configure menu",
  "pos:manage": "Manage POS",
  "analytics:view": "View analytics",
  "vouchers:manage": "Manage vouchers",
  "store:availability": "Change store availability",
  "settings:manage": "Manage settings",
  "audit:view": "View audit log",
  "team:manage": "Manage team access",
  "refunds:manage": "Issue refunds",
};

export const PERMISSION_DESCRIPTIONS: Record<StaffPermission, string> = {
  "dashboard:view": "Open the Workspace dashboard.",
  "orders:view": "See incoming and past orders.",
  "orders:manage": "Advance order stages and record payments.",
  "menu:view": "Open the Menu dashboard and browse the catalog.",
  "menu:availability": "Mark items sold out and put them back.",
  "menu:configure": "Add, rename, price and delete items across the whole catalog.",
  "pos:manage": "Read the POS sync records. There is no POS screen yet, so this opens nothing.",
  "analytics:view": "Open the sales report: hours, prep times, menu mix and no-shows.",
  "vouchers:manage":
    "Read the voucher tables. There is no voucher screen yet, so this opens nothing.",
  "store:availability": "Pause and resume orders, and set opening hours.",
  "settings:manage": "Change branch details and business settings.",
  "audit:view": "Open the audit log of staff actions.",
  "team:manage": "Grant and revoke Workspace access.",
  "refunds:manage": "Send money back to a customer for an online payment.",
};

/**
 * The permissions the Super Admin may switch on and off for one person.
 *
 * Everything except team:manage. That one is named in the union and labelled
 * above, because /workspace/profile still has to be able to print it if a row
 * for it exists, but nothing in the app ever checks it: /workspace/team admits
 * the Super Admin on profile.role === 'admin', and no other screen mentions
 * it. A switch for it would move, save, and change nothing a person could see,
 * which is worse than not offering it.
 *
 * Wiring it up would mean letting somebody who is not the Super Admin hand out
 * permissions, including refunds, and that is a decision rather than a
 * tidy-up. Until it is made, this list is thirteen.
 *
 * Written out rather than filtered from ALL_PERMISSIONS so that the literal
 * type survives, which is what lets the toggle schema in team-schemas.ts hand
 * it straight to z.enum and get a union of keys instead of plain string.
 * tests/unit/permission-catalog.test.ts compares it back against
 * ALL_PERMISSIONS, so a permission added to the union and forgotten here fails
 * there rather than quietly going unofferable.
 */
export const MANAGEABLE_PERMISSIONS = [
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
] as const satisfies readonly StaffPermission[];

/** One of the thirteen the panel offers, as opposed to any StaffPermission. */
export type ManageablePermission = (typeof MANAGEABLE_PERMISSIONS)[number];

/**
 * The switches whose feature has not been built.
 *
 * They are offered rather than hidden, and the panel says so on the row.
 * Both of them are read by live RLS policies: 0022 makes vouchers:manage the
 * read policy on vouchers and voucher_redemptions, and pos:manage the read
 * policy on pos_sync. Taking either switch away would leave those policies
 * governed by the job role alone, with no way to grant or withhold them for
 * one person, which is a real loss of control over a real rule. What is
 * missing is the screen, not the rule.
 *
 * analytics:view used to be the third entry here, for a third reason: nothing
 * read it at all, in the app or the database. /workspace/analytics shipped on
 * 2026-09-04 and migration 0062 guards the report on it, so it came off this
 * list in the same commit, which is the drift guard working as designed.
 *
 * team:manage is the case that went the other way, and MANAGEABLE_PERMISSIONS
 * above says why: it is not merely unbuilt, it is unreachable by design,
 * because the screen that would honour it admits the Super Admin by profile
 * role instead.
 *
 * WHEN A FEATURE SHIPS, DELETE ITS ENTRY HERE and rewrite its description.
 * tests/unit/permission-catalog.test.ts fails if a permission named here turns
 * up in a permission check under app/, which is the drift guard: the test goes
 * red on the commit that builds the screen rather than months later.
 */
export const UNBUILT_PERMISSIONS = [
  "vouchers:manage",
  "pos:manage",
] as const satisfies readonly ManageablePermission[];

export type PermissionGroup = {
  label: string;
  /**
   * Narrowed to the manageable list rather than to StaffPermission, so a group
   * naming team:manage is a type error here rather than a switch on the screen
   * that saves and changes nothing.
   */
  permissions: readonly ManageablePermission[];
};

/**
 * The switches, in the order and the grouping the panel shows them.
 *
 * Grouped by the part of the Workspace each one opens, so the question the
 * Super Admin is actually asking ("can this person touch the menu?") is
 * answered by one block rather than by scanning thirteen rows. The order runs
 * from what everybody has to what almost nobody should.
 *
 * tests/unit/permission-catalog.test.ts checks this partitions
 * MANAGEABLE_PERMISSIONS exactly: no permission missing, none named twice.
 */
export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  { label: "Dashboard", permissions: ["dashboard:view"] },
  { label: "Orders", permissions: ["orders:view", "orders:manage", "pos:manage"] },
  { label: "Menu", permissions: ["menu:view", "menu:availability", "menu:configure"] },
  { label: "The counter", permissions: ["store:availability", "settings:manage"] },
  { label: "Money", permissions: ["vouchers:manage", "refunds:manage"] },
  { label: "Reporting", permissions: ["analytics:view", "audit:view"] },
];
