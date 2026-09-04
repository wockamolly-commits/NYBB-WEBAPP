import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MANAGEABLE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  UNBUILT_PERMISSIONS,
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

/**
 * Reading app/ for permission checks, so the "not built yet" label cannot rot.
 *
 * The catalog claims some permissions have no feature behind them. That claim
 * is true when it is written and nothing about it is self-maintaining: the
 * commit that builds the analytics report would leave a switch on screen
 * telling the Super Admin it grants nothing. So the claim is checked rather
 * than trusted, against the same thing a reader would check, which is whether
 * any screen asks about the permission.
 *
 * It has gone red twice and been right both times: on the analytics report and
 * again on /workspace/vouchers, both 2026-09-04. pos:manage is the last one.
 *
 * Reading source in a test is a habit this suite already has;
 * tests/sql/staff-order-ops.test.ts asserts on a function body the same way.
 */
async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    }),
  );
  return found.flat();
}

describe("the permissions with nothing behind them yet", () => {
  it("names only permissions the panel offers", () => {
    for (const permission of UNBUILT_PERMISSIONS) {
      expect(MANAGEABLE_PERMISSIONS, permission).toContain(permission);
    }
  });

  it("says so in the description, so the row does not promise a screen", () => {
    for (const permission of UNBUILT_PERMISSIONS) {
      expect(PERMISSION_DESCRIPTIONS[permission], permission).toMatch(
        /has not been built|opens nothing|nothing reads this/i,
      );
    }
  });

  it("is still true: no screen asks about any of them", async () => {
    // The drift guard. When somebody builds the voucher screen and writes
    // hasStaffPermission(profile, "vouchers:manage"), this goes red on that
    // commit, which is the moment to delete the entry and rewrite the
    // description. Finding out months later, from a confused Super Admin, is
    // the outcome it exists to prevent.
    const files = await sourceFiles(path.join(process.cwd(), "app"));
    const sources = await Promise.all(
      files.map(async (file) => ({ file, text: await readFile(file, "utf8") })),
    );

    for (const permission of UNBUILT_PERMISSIONS) {
      const users = sources
        .filter(({ text }) => text.includes(`"${permission}"`))
        .map(({ file }) => path.relative(process.cwd(), file));
      expect(
        users,
        `${permission} is checked in app/ now, so it is built: remove it from ` +
          `UNBUILT_PERMISSIONS in lib/staff/permission-catalog.ts and rewrite ` +
          `its description`,
      ).toEqual([]);
    }
  });

  it("does not claim a permission that a screen already uses", async () => {
    // The other direction, cheaply: refunds:manage is genuinely wired, so if it
    // ever appeared in the unbuilt list the test above would be the only thing
    // to catch it, and only by accident of file layout.
    expect(UNBUILT_PERMISSIONS as readonly string[]).not.toContain("refunds:manage");
    expect(UNBUILT_PERMISSIONS as readonly string[]).not.toContain("orders:view");
  });
});
