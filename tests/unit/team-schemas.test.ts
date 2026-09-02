import { describe, expect, it } from "vitest";
import { ALL_BRANCHES, branchAssignmentSchema } from "@/lib/staff/team-schemas";

const BRANCH = "b9e86115-1268-455e-9953-ed32ef6bedff";

describe("branch assignment schema", () => {
  it("reads the roving sentinel as business wide", () => {
    expect(branchAssignmentSchema.parse(ALL_BRANCHES)).toBeNull();
  });

  it("keeps a real branch as it was posted", () => {
    expect(branchAssignmentSchema.parse(BRANCH)).toBe(BRANCH);
  });

  it("refuses the values that mean nobody chose", () => {
    // Empty is not a branch and it is not "all branches" either. A control that
    // was never touched must fail here rather than resolve to something the
    // Super Admin did not pick.
    for (const value of ["", " ", null, undefined, "0", "none", "ALL"]) {
      expect(branchAssignmentSchema.safeParse(value).success, String(value)).toBe(false);
    }
  });

  it("refuses an id that is not a uuid", () => {
    expect(branchAssignmentSchema.safeParse("central-bloc").success).toBe(false);
  });
});
