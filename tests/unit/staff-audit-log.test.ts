import { describe, expect, it } from "vitest";
import {
  auditFilterParams,
  normalizeAuditFilters,
  redactAuditDetail,
  toAuditLogEntry,
} from "@/lib/staff/audit-log";
import { ilikeOrFilter, ilikePattern } from "@/lib/staff/search-pattern";

describe("audit log filters", () => {
  it("keeps only a real calendar date", () => {
    expect(normalizeAuditFilters({ from: "2026-08-10", to: "2026-02-30" })).toMatchObject({
      from: "2026-08-10",
      to: "",
    });
  });

  it("bounds the search box rather than passing an essay to the database", () => {
    expect(normalizeAuditFilters({ q: "x".repeat(200) }).query).toHaveLength(80);
  });

  it("refuses a cursor that is not a bigserial id", () => {
    expect(normalizeAuditFilters({ before: "12" }).before).toBe("12");
    expect(normalizeAuditFilters({ before: "12; drop table audit_logs" }).before).toBe("");
    expect(normalizeAuditFilters({ before: "-1" }).before).toBe("");
    expect(normalizeAuditFilters({ before: "1".repeat(25) }).before).toBe("");
  });

  it("carries the filters into the next page so paging does not reset them", () => {
    const filters = normalizeAuditFilters({ q: "order.claimed", from: "2026-08-01" });
    expect(auditFilterParams(filters, "412")).toBe(
      "q=order.claimed&from=2026-08-01&before=412",
    );
    expect(auditFilterParams(filters, null)).toBe("q=order.claimed&from=2026-08-01");
  });
});

describe("the search pattern that reaches past the page cap", () => {
  it("wildcards a character that would otherwise change which columns are filtered", () => {
    expect(ilikePattern("Dela Cruz, Ana")).toBe("*Dela*Cruz**Ana*");
    expect(ilikePattern("a)b")).toBe("*a*b*");
  });

  it("keeps the characters a code, a phone and an email are made of", () => {
    expect(ilikePattern("NY-VFY248")).toBe("*NY-VFY248*");
    expect(ilikePattern("ana@example.com")).toBe("*ana@example.com*");
  });

  it("asks for no filter at all rather than one that matches nothing", () => {
    expect(ilikePattern("")).toBeNull();
    expect(ilikePattern("   ")).toBeNull();
    expect(ilikePattern("%%%")).toBeNull();
  });

  it("builds one term per column", () => {
    expect(ilikeOrFilter(["action", "target_id"], "*x*")).toBe(
      "action.ilike.*x*,target_id.ilike.*x*",
    );
  });
});

describe("audit detail redaction", () => {
  it("blanks a credential wherever it is nested", () => {
    expect(
      redactAuditDetail({
        before: { pickup_code: "4821", display_name: "Ana" },
        after: [{ tracking_token: "abc", status: "claimed" }],
      }),
    ).toEqual({
      before: { pickup_code: "[redacted]", display_name: "Ana" },
      after: [{ tracking_token: "[redacted]", status: "claimed" }],
    });
  });

  it("catches a credential nobody has written yet", () => {
    expect(redactAuditDetail({ reset_token: "x", webhook_secret: "y" })).toEqual({
      reset_token: "[redacted]",
      webhook_secret: "[redacted]",
    });
  });

  /**
   * The one value here that is written today rather than guarded against.
   * The access-change and Super Admin provisioning RPCs record to_jsonb() of
   * the profile row, so a staff member's number reached the screen on every
   * entry about their account. Masking it was the owner's call: it is not a
   * credential, and what the trail still says is that the change happened,
   * who made it, and to whom.
   */
  it("masks a staff phone number in a real access-change diff", () => {
    expect(
      redactAuditDetail({
        before: {
          role: "staff",
          staff_role: "cashier",
          display_name: "Ana Reyes",
          phone: "09170000001",
          is_active: true,
        },
        after: { role: "staff", staff_role: "manager", is_active: true },
      }),
    ).toEqual({
      before: {
        role: "staff",
        staff_role: "cashier",
        display_name: "Ana Reyes",
        phone: "[redacted]",
        is_active: true,
      },
      after: { role: "staff", staff_role: "manager", is_active: true },
    });
  });

  it("masks a phone number whatever the column is called", () => {
    expect(
      redactAuditDetail({ customer_phone: "09170000002", contact_phone: "09170000003" }),
    ).toEqual({ customer_phone: "[redacted]", contact_phone: "[redacted]" });
  });

  it("leaves the fields an auditor actually reads", () => {
    const diff = { from: "ready", to: "claimed", counterPaymentCaptured: true };
    expect(redactAuditDetail(diff)).toEqual(diff);
  });

  it("does not mistake a short code for a secret", () => {
    expect(redactAuditDetail({ short_code: "NY-VFY248" })).toEqual({
      short_code: "NY-VFY248",
    });
  });
});

describe("reading an audit row", () => {
  const row = {
    id: 412,
    created_at: "2026-08-10T09:15:00.000Z",
    action: "order.claimed",
    target_table: "orders",
    target_id: "8f14e45f-ceea-4b7c-9c2f-2a1b3c4d5e6f",
    diff: { from: "ready", to: "claimed", pickup_code: "4821" },
    branches: { short_name: "Central Bloc" },
    actor: { display_name: "Ana Reyes", role: "staff" },
  };

  it("maps the row and redacts on the way through", () => {
    expect(toAuditLogEntry(row)).toEqual({
      id: "412",
      createdAt: "2026-08-10T09:15:00.000Z",
      action: "order.claimed",
      targetTable: "orders",
      targetId: "8f14e45f-ceea-4b7c-9c2f-2a1b3c4d5e6f",
      branchName: "Central Bloc",
      actorName: "Ana Reyes",
      actorRole: "staff",
      detail: { from: "ready", to: "claimed", pickup_code: "[redacted]" },
    });
  });

  it("reads an embedded relation whether it arrives as a row or an array", () => {
    const entry = toAuditLogEntry({
      ...row,
      branches: [{ short_name: "Central Bloc" }],
      actor: [{ display_name: "Ana Reyes", role: "staff" }],
    });
    expect(entry?.branchName).toBe("Central Bloc");
    expect(entry?.actorName).toBe("Ana Reyes");
  });

  it("keeps an entry whose actor or branch is hidden", () => {
    const entry = toAuditLogEntry({ ...row, actor: null, branches: null });
    expect(entry?.actorName).toBeNull();
    expect(entry?.branchName).toBeNull();
    expect(entry?.action).toBe("order.claimed");
  });

  it("refuses a row it cannot read rather than rendering half of one", () => {
    expect(toAuditLogEntry({ ...row, action: 12 })).toBeNull();
    expect(toAuditLogEntry(null)).toBeNull();
  });
});
