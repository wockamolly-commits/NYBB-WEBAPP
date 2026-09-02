import { describe, expect, it } from "vitest";
import {
  BUSINESS_WIDE_PERMISSIONS,
  isStaffJobRole,
  STAFF_JOB_ROLES,
  isStaffPermission,
  resolvePermissions,
  roleDefaultPermissions,
  workspaceLandingPath,
} from "@/lib/staff/roles";

const BRANCH = "b9e86115-1268-455e-9953-ed32ef6bedff";

describe("staff roles", () => {
  it("offers only the jobs that use this web app", () => {
    // The kitchen works from the POS monitor. A Workspace role for it would put
    // a second screen on the same tickets, so it is not one of the jobs here.
    expect([...STAFF_JOB_ROLES]).toEqual(["cashier", "manager"]);
    expect(isStaffJobRole("kitchen")).toBe(false);
  });

  it("gives refund authority to managers only by default", () => {
    expect(roleDefaultPermissions("manager")).toContain("refunds:manage");
    expect(roleDefaultPermissions("cashier")).not.toContain("refunds:manage");
    expect(isStaffPermission("refunds:manage")).toBe(true);
  });

  it("lets an override grant and revoke one capability", () => {
    const resolved = resolvePermissions(
      "cashier",
      [
        { permission: "analytics:view", granted: true },
        { permission: "pos:manage", granted: false },
      ],
      null,
    );

    expect(resolved).toContain("analytics:view");
    expect(resolved).not.toContain("pos:manage");
    expect(resolved).toContain("orders:manage");
  });

  it("starts an admin-style profile with no job defaults", () => {
    expect(resolvePermissions(null, [], null)).toEqual([]);
  });

  it("keeps the shared catalog away from a manager pinned to one counter", () => {
    // The catalog has no branch. Editing it from one counter edits all nine,
    // so a branch-assigned manager does not inherit menu:configure, while the
    // roving manager who covers the business still does.
    expect(resolvePermissions("manager", [], null)).toContain("menu:configure");
    expect(resolvePermissions("manager", [], BRANCH)).not.toContain("menu:configure");

    // Everything that is about one counter survives the assignment.
    const assigned = resolvePermissions("manager", [], BRANCH);
    expect(assigned).toContain("menu:availability");
    expect(assigned).toContain("menu:view");
    expect(assigned).toContain("orders:manage");
    expect(assigned).toContain("settings:manage");
    expect(new Set(assigned)).toEqual(
      new Set(
        roleDefaultPermissions("manager").filter((p) => p !== "menu:configure"),
      ),
    );
  });

  it("lets the Super Admin hand the catalog to one assigned person", () => {
    expect(
      resolvePermissions(
        "manager",
        [{ permission: "menu:configure", granted: true }],
        BRANCH,
      ),
    ).toContain("menu:configure");

    // A denying override is still a denial, whichever side of the branch it is.
    expect(
      resolvePermissions(
        "manager",
        [{ permission: "menu:configure", granted: false }],
        null,
      ),
    ).not.toContain("menu:configure");
    expect(
      resolvePermissions(
        "manager",
        [{ permission: "menu:configure", granted: false }],
        BRANCH,
      ),
    ).not.toContain("menu:configure");
  });

  it("names the catalog as the one business wide capability today", () => {
    expect([...BUSINESS_WIDE_PERMISSIONS]).toEqual(["menu:configure"]);
    for (const permission of BUSINESS_WIDE_PERMISSIONS) {
      expect(isStaffPermission(permission)).toBe(true);
    }
  });

  it("rejects unknown jobs and permissions at the database boundary", () => {
    expect(isStaffJobRole("manager")).toBe(true);
    expect(isStaffJobRole("rider")).toBe(false);
    // `in` would have said yes to this one.
    expect(isStaffJobRole("toString")).toBe(false);
    expect(isStaffPermission("orders:view")).toBe(true);
    expect(isStaffPermission("deliveries:view")).toBe(false);
  });

  it("sends each role to a page it can actually open", () => {
    expect(
      workspaceLandingPath({
        role: "staff",
        permissions: resolvePermissions(
          "cashier",
          [{ permission: "dashboard:view", granted: false }],
          null,
        ),
      }),
    ).toBe("/workspace/orders");
    expect(
      workspaceLandingPath({
        role: "staff",
        permissions: roleDefaultPermissions("cashier"),
      }),
    ).toBe("/workspace");
    expect(workspaceLandingPath({ role: "staff", permissions: [] })).toBe(
      "/workspace/profile",
    );
    expect(workspaceLandingPath({ role: "admin", permissions: [] })).toBe(
      "/workspace",
    );
  });
});
