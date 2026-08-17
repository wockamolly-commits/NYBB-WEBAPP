import { describe, expect, it } from "vitest";
import {
  franchiseLeadParams,
  normalizeFranchiseLeadFilters,
  toFranchiseLead,
} from "@/lib/staff/franchise-leads";

describe("normalizeFranchiseLeadFilters", () => {
  it("defaults to the leads nobody has worked yet", () => {
    // The list exists to be worked. Opening it to a history of closed leads
    // would bury the ones that need a phone call.
    expect(normalizeFranchiseLeadFilters({}).scope).toBe("open");
  });

  it("accepts the one widening value and treats anything else as open", () => {
    expect(normalizeFranchiseLeadFilters({ scope: "all" }).scope).toBe("all");
    for (const scope of ["", "everything", "OPEN", "handled"]) {
      expect(normalizeFranchiseLeadFilters({ scope }).scope).toBe("open");
    }
  });

  it("trims and caps the search, so the query cannot be used as a payload", () => {
    const filters = normalizeFranchiseLeadFilters({ q: `  ${"a".repeat(200)}  ` });
    expect(filters.query).toHaveLength(80);
  });

  it("keeps a timestamp cursor and discards anything that is not one", () => {
    const cursor = "2026-08-17T06:30:00.000Z";
    expect(normalizeFranchiseLeadFilters({ before: cursor }).before).toBe(cursor);

    for (const before of ["", "yesterday", "'; drop table franchise_inquiries; --", "1"]) {
      expect(normalizeFranchiseLeadFilters({ before }).before).toBe("");
    }
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(normalizeFranchiseLeadFilters({ scope: ["all", "open"] }).scope).toBe("all");
  });
});

describe("franchiseLeadParams", () => {
  it("carries the filters through paging, so page two is still filtered", () => {
    const filters = normalizeFranchiseLeadFilters({ q: "maria", scope: "all" });
    const params = new URLSearchParams(
      franchiseLeadParams(filters, "2026-08-17T06:30:00.000Z"),
    );
    expect(params.get("q")).toBe("maria");
    expect(params.get("scope")).toBe("all");
    expect(params.get("before")).toBe("2026-08-17T06:30:00.000Z");
  });

  it("omits the default scope and an absent cursor, keeping the first page clean", () => {
    const filters = normalizeFranchiseLeadFilters({});
    expect(franchiseLeadParams(filters, null)).toBe("");
  });
});

describe("toFranchiseLead", () => {
  const row = {
    id: "88000000-0000-4000-8000-000000000001",
    created_at: "2026-08-17T06:30:00.000Z",
    name: "Maria Santos",
    email: "maria@example.com",
    phone: "09170000000",
    city: null,
    message: null,
    handled_at: null,
    handled_by: null,
  };

  it("reads a lead nobody has handled", () => {
    const lead = toFranchiseLead(row);
    expect(lead).toMatchObject({ name: "Maria Santos", handledAt: null, handledByName: null });
  });

  it("names whoever closed it, whether the join arrives as an object or an array", () => {
    // PostgREST returns a to-one embed as an object or a single-element array
    // depending on how it resolves the relationship, and the audit log hit the
    // same thing.
    for (const handled_by of [{ display_name: "Owner" }, [{ display_name: "Owner" }]]) {
      const lead = toFranchiseLead({
        ...row,
        handled_at: "2026-08-17T07:00:00.000Z",
        handled_by,
      });
      expect(lead?.handledByName).toBe("Owner");
    }
  });

  it("returns null for a row it cannot read, rather than a half-built lead", () => {
    expect(toFranchiseLead({ ...row, email: undefined })).toBeNull();
    expect(toFranchiseLead({ ...row, id: "not-a-uuid" })).toBeNull();
    expect(toFranchiseLead(null)).toBeNull();
  });
});
