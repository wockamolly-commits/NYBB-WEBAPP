import { describe, expect, it } from "vitest";
import { auditFieldLabel, describeAuditDetail, formatAuditValue } from "@/lib/staff/audit-detail";
import { toAuditLogEntry, withRestrictedDetails } from "@/lib/staff/audit-log";

describe("the audit detail in words", () => {
  it("lists only the fields that changed in a before and after pair", () => {
    expect(
      describeAuditDetail({
        before: { id: "x", name: "Wings", price_cents: 32900, is_active: true, updated_at: "a" },
        after: { id: "x", name: "Wings", price_cents: 34900, is_active: false, updated_at: "b" },
      }),
    ).toEqual({
      kind: "changed",
      lines: [
        { label: "Price", before: "₱329.00", after: "₱349.00" },
        { label: "Active", before: "Yes", after: "No" },
      ],
      hiddenCount: 0,
    });
  });

  it("reads a created row and a removed row as one side each", () => {
    expect(describeAuditDetail({ before: null, after: { code: "W1", name: "Gravy" } })).toMatchObject({
      kind: "created",
      lines: [
        { label: "Code", value: "W1" },
        { label: "Name", value: "Gravy" },
      ],
    });
    expect(describeAuditDetail({ before: { name: "Gravy" }, after: null }).kind).toBe("removed");
  });

  it("reads a status move", () => {
    expect(describeAuditDetail({ from: "ready", to: "claimed" }).lines).toEqual([
      { label: "Status", before: "ready", after: "claimed" },
    ]);
  });

  it("keeps a shape it does not know as plain lines, rather than dropping it", () => {
    expect(describeAuditDetail({ permission: "menu:configure", before: null, after: true }).lines).toEqual([
      { label: "Permission", value: "menu:configure" },
      { label: "Value", before: "None", after: "Yes" },
    ]);
    expect(describeAuditDetail({ jobName: "expire", rows: 3 }).lines).toEqual([
      { label: "Job name", value: "expire" },
      { label: "Rows", value: "3" },
    ]);
  });

  it("says in words that a value was withheld", () => {
    expect(formatAuditValue("[restricted]")).toBe("Hidden (needs promo code access)");
    expect(formatAuditValue("[redacted]")).toBe("Hidden");
  });

  it("caps a whole-row diff so it stays a summary", () => {
    const after = Object.fromEntries(Array.from({ length: 45 }, (_, index) => [`field_${index}`, index]));
    const summary = describeAuditDetail({ before: null, after });
    expect(summary.lines).toHaveLength(30);
    expect(summary.hiddenCount).toBe(15);
  });

  it("names fields in words", () => {
    expect(auditFieldLabel("max_discount_cents")).toBe("Max discount");
    expect(auditFieldLabel("maxDiscountCents")).toBe("Max discount");
    expect(auditFieldLabel("is_accepting_orders")).toBe("Taking orders");
  });
});

describe("the full copy of a masked entry", () => {
  const row = {
    id: 7,
    created_at: "2026-10-21T01:00:00.000Z",
    action: "voucher.create",
    target_table: "vouchers",
    target_id: "v1",
    actor_profile_id: null,
    diff: { before: null, after: { code: "[restricted]", amount_cents: 5000 } },
    branches: null,
    actor: null,
  };

  it("marks an entry whose promo code the database masked", () => {
    expect(toAuditLogEntry(row)?.restricted).toBe(true);
    expect(toAuditLogEntry({ ...row, diff: { from: "a", to: "b" } })?.restricted).toBe(false);
  });

  it("swaps in the full diff only for the entries the database returned", () => {
    const entry = toAuditLogEntry(row)!;
    const [allowed] = withRestrictedDetails([entry], [
      { audit_log_id: 7, diff: { before: null, after: { code: "STAFF50", amount_cents: 5000, pickup_code: "1234" } } },
    ]);
    expect(allowed?.restricted).toBe(false);
    // Redaction still runs on the full copy.
    expect(allowed?.detail).toEqual({ before: null, after: { code: "STAFF50", amount_cents: 5000, pickup_code: "[redacted]" } });

    const [refused] = withRestrictedDetails([entry], []);
    expect(refused).toBe(entry);
  });
});
