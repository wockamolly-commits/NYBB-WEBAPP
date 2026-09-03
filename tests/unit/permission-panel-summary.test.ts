import { describe, expect, it } from "vitest";
import {
  displayedOn,
  panelRows,
  permissionRowState,
  summarizePermissions,
  togglePending,
  type PendingChanges,
} from "@/lib/staff/permission-panel";
import type { PermissionOverride } from "@/lib/staff/roles";

/**
 * What each switch shows, and what the heading counts.
 *
 * The trap this file exists for: "what the role gives" is not
 * ROLE_PERMISSIONS[role]. It is that list after branch scoping. A Manager
 * pinned to a counter has an effective default of OFF for menu:configure, even
 * though the Manager role lists it, because the catalog is shared by all nine
 * shops and 0059 strips business wide permissions from an assigned profile.
 *
 * Read it the other way and the switch appears to work and then does nothing:
 * turning menu:configure on for an assigned manager would look like a return
 * to the role default, delete the row, and leave the permission off.
 */

const NO_OVERRIDES: PermissionOverride[] = [];
const ROVING = null;
const IT_PARK = "1f1c4d0c-0f21-4a7f-9a4a-0c2d0f4b7a11";

describe("permissionRowState", () => {
  it("marks a permission the role gives as on and inherited", () => {
    const row = permissionRowState("cashier", ROVING, NO_OVERRIDES, "orders:view");
    expect(row).toEqual({ on: true, isDefault: true, defaultOn: true });
  });

  it("marks a permission the role withholds as off and inherited", () => {
    const row = permissionRowState("cashier", ROVING, NO_OVERRIDES, "refunds:manage");
    expect(row).toEqual({ on: false, isDefault: true, defaultOn: false });
  });

  it("marks a granted override as on and no longer inherited", () => {
    const row = permissionRowState(
      "cashier",
      ROVING,
      [{ permission: "refunds:manage", granted: true }],
      "refunds:manage",
    );
    expect(row).toEqual({ on: true, isDefault: false, defaultOn: false });
  });

  it("marks a revoking override as off and no longer inherited", () => {
    const row = permissionRowState(
      "manager",
      ROVING,
      [{ permission: "audit:view", granted: false }],
      "audit:view",
    );
    expect(row).toEqual({ on: false, isDefault: false, defaultOn: true });
  });

  it("reads menu:configure as off by default for a manager pinned to a branch", () => {
    // The whole reason this module exists. The Manager role lists
    // menu:configure; the branch assignment takes it away again.
    const row = permissionRowState("manager", IT_PARK, NO_OVERRIDES, "menu:configure");
    expect(row).toEqual({ on: false, isDefault: true, defaultOn: false });
  });

  it("counts the override that hands an assigned manager the catalog as a change", () => {
    const row = permissionRowState(
      "manager",
      IT_PARK,
      [{ permission: "menu:configure", granted: true }],
      "menu:configure",
    );
    expect(row).toEqual({ on: true, isDefault: false, defaultOn: false });
  });

  it("keeps menu:configure a plain role default for a roving manager", () => {
    const row = permissionRowState("manager", ROVING, NO_OVERRIDES, "menu:configure");
    expect(row).toEqual({ on: true, isDefault: true, defaultOn: true });
  });

  it("ignores an override that agrees with the default, which should not exist", () => {
    // Nothing writes one: the action deletes the row when the switch lands on
    // the default. A row left behind by an older hand edit should still read
    // as inherited rather than as somebody's decision.
    const row = permissionRowState(
      "cashier",
      ROVING,
      [{ permission: "orders:view", granted: true }],
      "orders:view",
    );
    expect(row).toEqual({ on: true, isDefault: true, defaultOn: true });
  });
});

describe("summarizePermissions", () => {
  it("counts a plain cashier against the thirteen offered", () => {
    expect(summarizePermissions("cashier", ROVING, NO_OVERRIDES)).toEqual({
      on: 7,
      total: 13,
      changed: 0,
      unsaved: 0,
    });
  });

  it("counts a plain manager", () => {
    expect(summarizePermissions("manager", ROVING, NO_OVERRIDES)).toEqual({
      on: 13,
      total: 13,
      changed: 0,
      unsaved: 0,
    });
  });

  it("counts one added and one taken away as two changes", () => {
    expect(
      summarizePermissions("cashier", ROVING, [
        { permission: "refunds:manage", granted: true },
        { permission: "orders:manage", granted: false },
      ]),
    ).toEqual({ on: 7, total: 13, changed: 2, unsaved: 0 });
  });

  it("does not count team:manage, which the panel does not offer", () => {
    // A row for it can exist from a hand edit. It must not move the count on a
    // panel that has no switch to explain it.
    expect(
      summarizePermissions("cashier", ROVING, [{ permission: "team:manage", granted: true }]),
    ).toEqual({ on: 7, total: 13, changed: 0, unsaved: 0 });
  });

  it("drops menu:configure from an assigned manager's count", () => {
    expect(summarizePermissions("manager", IT_PARK, NO_OVERRIDES)).toEqual({
      on: 12,
      total: 13,
      changed: 0,
      unsaved: 0,
    });
  });

  it("counts a profile with no role at all as nothing on", () => {
    expect(summarizePermissions(null, ROVING, NO_OVERRIDES)).toEqual({
      on: 0,
      total: 13,
      changed: 0,
      unsaved: 0,
    });
  });
});

describe("pending changes, before Save is pressed", () => {
  const NONE: PendingChanges = {};

  it("keeps a moved switch only while it disagrees with what is stored", () => {
    // The invariant the Save button rests on. Moving a switch and moving it
    // straight back has to leave nothing behind, or Save would offer to write
    // a change that is not one.
    const once = togglePending("cashier", ROVING, NO_OVERRIDES, NONE, "refunds:manage");
    expect(once).toEqual({ "refunds:manage": true });

    const twice = togglePending("cashier", ROVING, NO_OVERRIDES, once, "refunds:manage");
    expect(twice).toEqual({});
  });

  it("does not mutate the map it was given", () => {
    const before: PendingChanges = {};
    togglePending("cashier", ROVING, NO_OVERRIDES, before, "refunds:manage");
    expect(before).toEqual({});
  });

  it("clears the pending entry when a switch returns to a stored override", () => {
    // The stored state here is an override, not a role default. Returning to
    // it is still "nothing to save".
    const stored: PermissionOverride[] = [{ permission: "refunds:manage", granted: true }];
    const off = togglePending("cashier", ROVING, stored, NONE, "refunds:manage");
    expect(off).toEqual({ "refunds:manage": false });
    expect(togglePending("cashier", ROVING, stored, off, "refunds:manage")).toEqual({});
  });

  it("shows the pending answer over the stored one", () => {
    expect(displayedOn("cashier", ROVING, NO_OVERRIDES, NONE, "refunds:manage")).toBe(false);
    expect(
      displayedOn("cashier", ROVING, NO_OVERRIDES, { "refunds:manage": true }, "refunds:manage"),
    ).toBe(true);
  });

  it("counts an unsaved switch in the on count and in the changed count", () => {
    // The heading describes what the screen is showing, so that pressing Save
    // is not expected to change the numbers, only to make them true.
    expect(
      summarizePermissions("cashier", ROVING, NO_OVERRIDES, { "refunds:manage": true }),
    ).toEqual({ on: 8, total: 13, changed: 1, unsaved: 1 });
  });

  it("moves the DEFAULT badge to follow the switch rather than the stored row", () => {
    // The badge answers "if you saved this now, would there be an override
    // row", which is the question somebody moving a switch is asking.
    const rows = panelRows("cashier", ROVING, NO_OVERRIDES, { "orders:view": false });
    const row = rows.find((entry) => entry.permission === "orders:view");
    expect(row).toEqual({
      permission: "orders:view",
      on: false,
      isDefault: false,
      defaultOn: true,
      unsaved: true,
    });
  });

  it("marks only the switches that moved", () => {
    const rows = panelRows("cashier", ROVING, NO_OVERRIDES, { "refunds:manage": true });
    expect(rows.filter((row) => row.unsaved).map((row) => row.permission)).toEqual([
      "refunds:manage",
    ]);
  });

  it("lets a pinned manager stage the catalog, and counts it as a change", () => {
    const staged = togglePending("manager", IT_PARK, NO_OVERRIDES, NONE, "menu:configure");
    expect(staged).toEqual({ "menu:configure": true });
    expect(summarizePermissions("manager", IT_PARK, NO_OVERRIDES, staged)).toEqual({
      on: 13,
      total: 13,
      changed: 1,
      unsaved: 1,
    });
  });
});
