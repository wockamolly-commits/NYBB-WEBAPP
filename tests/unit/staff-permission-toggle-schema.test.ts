import { describe, expect, it } from "vitest";
import { permissionTogglePayloadSchema } from "@/lib/staff/team-schemas";

/**
 * The one value a permission switch posts.
 *
 * The panel is a single form holding thirteen submit buttons, so the button
 * that was pressed is the whole message: which permission, and which way. That
 * makes this parse the only thing between a crafted POST and a row in
 * staff_permission_overrides, which is why it lives in lib/ and is tested
 * rather than sitting inside the "use server" file where nothing could reach
 * it. The database refuses an unknown permission too; this is the first of the
 * two answers, not the only one.
 */

function parse(value: unknown) {
  return permissionTogglePayloadSchema.safeParse(value);
}

describe("permissionTogglePayloadSchema", () => {
  it("reads a switch turned on", () => {
    const result = parse("refunds:manage|on");
    expect(result.success && result.data).toEqual({
      permission: "refunds:manage",
      granted: true,
    });
  });

  it("reads a switch turned off", () => {
    const result = parse("audit:view|off");
    expect(result.success && result.data).toEqual({
      permission: "audit:view",
      granted: false,
    });
  });

  it("refuses a permission the app does not have", () => {
    expect(parse("orders:delete|on").success).toBe(false);
    expect(parse("|on").success).toBe(false);
  });

  it("refuses team:manage, which the panel does not offer", () => {
    // It is a real StaffPermission, so isStaffPermission() admits it. The
    // panel deliberately has no switch for it, and a value that could only
    // have been hand made should not be honoured just because it parses.
    expect(parse("team:manage|on").success).toBe(false);
  });

  it("refuses a state that is neither on nor off", () => {
    expect(parse("refunds:manage|maybe").success).toBe(false);
    expect(parse("refunds:manage|true").success).toBe(false);
    expect(parse("refunds:manage").success).toBe(false);
  });

  it("refuses an empty or missing value", () => {
    // A form submitted by pressing Enter in a text field posts no button name
    // at all, so formData.get() hands back null. Empty is not a permission.
    expect(parse("").success).toBe(false);
    expect(parse(null).success).toBe(false);
    expect(parse(undefined).success).toBe(false);
  });

  it("refuses extra separators rather than guessing which half is meant", () => {
    expect(parse("refunds:manage|on|off").success).toBe(false);
  });
});
