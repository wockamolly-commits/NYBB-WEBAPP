import { describe, expect, it } from "vitest";
import { auditFilterParams, normalizeAuditFilters } from "@/lib/staff/audit-log";
import {
  BUSINESS_WIDE_BRANCH,
  canFilterByBranch,
  effectiveBranchFilter,
  normalizeBranchFilter,
} from "@/lib/staff/branch-filter";
import { normalizeOrderHistoryFilters } from "@/lib/staff/order-history";

const BRANCH = "b9e86115-1268-455e-9953-ed32ef6bedff";

const superAdmin = { role: "admin" as const };
const staff = { role: "staff" as const };

describe("branch filter", () => {
  it("accepts a branch id and reads anything else as every branch", () => {
    expect(normalizeBranchFilter(BRANCH)).toBe(BRANCH);
    expect(normalizeBranchFilter(` ${BRANCH.toUpperCase()} `)).toBe(BRANCH);
    expect(normalizeBranchFilter("")).toBe("");
    expect(normalizeBranchFilter("not-a-branch")).toBe("");
    expect(normalizeBranchFilter(`${BRANCH},other`)).toBe("");
    expect(normalizeBranchFilter(`${BRANCH}' or '1'='1`)).toBe("");
  });

  it("offers the business wide choice only where it is asked for", () => {
    expect(normalizeBranchFilter(BUSINESS_WIDE_BRANCH)).toBe("");
    expect(normalizeBranchFilter(BUSINESS_WIDE_BRANCH, { allowBusinessWide: true }))
      .toBe(BUSINESS_WIDE_BRANCH);
  });

  it("is the Super Admin's alone", () => {
    expect(canFilterByBranch(superAdmin)).toBe(true);
    expect(canFilterByBranch(staff)).toBe(false);
  });

  it("drops a branch typed into the URL by anyone else", () => {
    expect(effectiveBranchFilter(superAdmin, BRANCH)).toBe(BRANCH);
    expect(effectiveBranchFilter(superAdmin, "")).toBe("");
    expect(effectiveBranchFilter(staff, BRANCH)).toBe("");
    expect(effectiveBranchFilter(staff, BUSINESS_WIDE_BRANCH)).toBe("");
  });

  it("reaches both screens' filters and survives audit paging", () => {
    expect(normalizeOrderHistoryFilters({ branch: BRANCH }).branch).toBe(BRANCH);
    expect(normalizeOrderHistoryFilters({ branch: BUSINESS_WIDE_BRANCH }).branch).toBe("");
    const audit = normalizeAuditFilters({ q: "order", branch: BRANCH });
    expect(audit.branch).toBe(BRANCH);
    expect(auditFilterParams(audit, "412")).toBe(`q=order&branch=${BRANCH}&before=412`);
    expect(normalizeAuditFilters({ branch: BUSINESS_WIDE_BRANCH }).branch).toBe(BUSINESS_WIDE_BRANCH);
  });
});
