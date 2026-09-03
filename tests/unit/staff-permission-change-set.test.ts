import { describe, expect, it } from "vitest";
import { permissionChangeSetSchema } from "@/lib/staff/team-schemas";

/**
 * What one press of Save is asking for.
 *
 * The panel posts a hidden "change" field per switch that was actually moved,
 * so this parse is the only thing between a hand made POST and a row in
 * staff_permission_overrides. It lives in lib/ rather than in the "use server"
 * file precisely so it can be reached from here; see AGENTS.md rule 6.
 */

function parse(values: unknown) {
  return permissionChangeSetSchema.safeParse(values);
}

describe("permissionChangeSetSchema", () => {
  it("reads a set of switches into the map the database takes", () => {
    const result = parse(["refunds:manage|on", "audit:view|off"]);
    expect(result.success && result.data).toEqual({
      "refunds:manage": true,
      "audit:view": false,
    });
  });

  it("reads a single change", () => {
    const result = parse(["menu:configure|on"]);
    expect(result.success && result.data).toEqual({ "menu:configure": true });
  });

  it("refuses a save with nothing in it", () => {
    // The Save button is disabled when nothing has moved, so an empty set is
    // either a stale page or something hand made. The database refuses it too.
    expect(parse([]).success).toBe(false);
  });

  it("refuses the same permission named twice", () => {
    // A map would silently keep whichever came last, which is a coin toss over
    // somebody's access.
    expect(parse(["refunds:manage|on", "refunds:manage|off"]).success).toBe(false);
  });

  it("refuses a permission the app does not have", () => {
    expect(parse(["orders:delete|on"]).success).toBe(false);
    expect(parse(["|on"]).success).toBe(false);
  });

  it("refuses team:manage, which the panel does not offer", () => {
    expect(parse(["team:manage|on"]).success).toBe(false);
  });

  it("refuses a state that is neither on nor off", () => {
    expect(parse(["refunds:manage|maybe"]).success).toBe(false);
    expect(parse(["refunds:manage"]).success).toBe(false);
    expect(parse(["refunds:manage|on|off"]).success).toBe(false);
  });

  it("refuses one bad line even when the rest are good", () => {
    // The set is one decision. Dropping the unreadable line and saving the
    // others would apply a change nobody asked for in that shape.
    expect(parse(["refunds:manage|on", "orders:delete|on"]).success).toBe(false);
  });

  it("refuses anything that is not a list of strings", () => {
    expect(parse("refunds:manage|on").success).toBe(false);
    expect(parse([null]).success).toBe(false);
    expect(parse(undefined).success).toBe(false);
  });
});
