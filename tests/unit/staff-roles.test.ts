import { describe, expect, it } from "vitest";
import {
  isStaffJobRole,
  STAFF_JOB_ROLES,
  isStaffPermission,
  resolvePermissions,
  roleDefaultPermissions,
  workspaceLandingPath,
} from "@/lib/staff/roles";

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
    const resolved = resolvePermissions("cashier", [
      { permission: "analytics:view", granted: true },
      { permission: "pos:manage", granted: false },
    ]);

    expect(resolved).toContain("analytics:view");
    expect(resolved).not.toContain("pos:manage");
    expect(resolved).toContain("orders:manage");
  });

  it("starts an admin-style profile with no job defaults", () => {
    expect(resolvePermissions(null, [])).toEqual([]);
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
        permissions: resolvePermissions("cashier", [
          { permission: "dashboard:view", granted: false },
        ]),
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
