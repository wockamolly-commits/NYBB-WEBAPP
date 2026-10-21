import { describe, expect, it } from "vitest";
import { freshDatabase, scalar } from "./harness";

/** Migration 0095: customer phone numbers out of the audit trail. */
describe("mask_phone_for_audit", () => {
  it("keeps only the last four digits of the canonical number", async () => {
    const db = await freshDatabase();
    expect(await scalar<string>(db, "select mask_phone_for_audit('0917 123 4567')")).toBe("********4567");
    expect(await scalar<string>(db, "select mask_phone_for_audit('+63 917 123 4567')")).toBe("********4567");
    expect(await scalar<string>(db, "select mask_phone_for_audit('12')")).toBe("**");
  });

  it("is not callable from a browser", async () => {
    const db = await freshDatabase();
    for (const role of ["anon", "authenticated"]) {
      expect(
        await scalar<boolean>(db, `select has_function_privilege('${role}', 'mask_phone_for_audit(text)', 'execute')`),
      ).toBe(false);
    }
  });
});
