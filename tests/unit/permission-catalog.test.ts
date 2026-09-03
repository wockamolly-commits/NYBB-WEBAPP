import { describe, expect, it } from "vitest";
import {
  MANAGEABLE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
} from "@/lib/staff/permission-catalog";
import { ALL_PERMISSIONS, type StaffPermission } from "@/lib/staff/roles";

/**
 * The catalog is the only thing standing between a new permission and a blank
 * row on the Workspace access screen.
 *
 * StaffPermission is a union, so a missing label is a type error and never
 * reaches here. What types cannot catch is the grouping: PERMISSION_GROUPS is
 * an array, and an array can hold the same key twice, or drop one, or name one
 * the union no longer has. Each of those ships a screen that looks right.
 */

const grouped = PERMISSION_GROUPS.flatMap((group) => group.permissions);

describe("the permission catalog", () => {
  it("offers every permission except the one nothing checks", () => {
    expect([...MANAGEABLE_PERMISSIONS].sort()).toEqual(
      ALL_PERMISSIONS.filter((permission) => permission !== "team:manage").sort(),
    );
  });

  it("leaves team:manage out", () => {
    // Not an oversight. The Workspace access page admits the Super Admin by
    // profile role, not by this permission, so a switch for it would move and
    // change nothing. See the comment in lib/staff/permission-catalog.ts.
    expect(MANAGEABLE_PERMISSIONS).not.toContain("team:manage" as StaffPermission);
  });

  it("puts every offered permission in exactly one group", () => {
    expect([...grouped].sort()).toEqual([...MANAGEABLE_PERMISSIONS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("gives every permission a label and a sentence saying what it opens", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(PERMISSION_LABELS[permission].trim().length).toBeGreaterThan(0);
      expect(PERMISSION_DESCRIPTIONS[permission].trim().length).toBeGreaterThan(0);
    }
  });

  it("writes descriptions as sentences, without em dashes", () => {
    // AGENTS.md rule 4. These strings are shipped UI copy.
    for (const permission of ALL_PERMISSIONS) {
      expect(PERMISSION_DESCRIPTIONS[permission]).not.toContain("—");
      expect(PERMISSION_DESCRIPTIONS[permission]).toMatch(/\.$/);
    }
  });

  it("names no empty group", () => {
    for (const group of PERMISSION_GROUPS) {
      expect(group.label.trim().length).toBeGreaterThan(0);
      expect(group.permissions.length).toBeGreaterThan(0);
    }
  });
});
