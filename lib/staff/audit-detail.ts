/** What 0098 writes in place of a promo code in a diff. */
export const RESTRICTED_VALUE = "[restricted]";

/**
 * An audit entry's diff, as lines a manager can read.
 *
 * The diff is open ended jsonb, written by some forty RPCs in three shapes:
 * `{ before, after }` with a whole row on each side, `{ from, to }` for a
 * status move, and a flat object of whatever the writer thought worth saying.
 * The screen used to print it as raw JSON, which is accurate and unreadable,
 * and showed every column of a row to say that one of them changed. This
 * reads all three shapes, keeps only what changed, and names the fields in
 * words. Anything it does not recognise still comes out as a line rather than
 * being dropped: an audit trail that hides what it cannot format is worse than
 * one that formats it plainly.
 *
 * It runs on the diff after redaction (lib/staff/audit-log.ts) and after the
 * database masked promo codes (0098), so it never sees a value the viewer may
 * not read, and says so in words where one was withheld.
 */

export type AuditDetailLine =
  | { label: string; before: string; after: string }
  | { label: string; value: string };

export type AuditDetailSummary = {
  /** "changed" lists before and after; "created" and "removed" list one side. */
  kind: "changed" | "created" | "removed" | "details";
  lines: AuditDetailLine[];
  /** Lines left off the end so a whole-row diff stays a summary. */
  hiddenCount: number;
};

const MAX_LINES = 30;
const MAX_TEXT = 160;

/** Bookkeeping columns that change on every write and say nothing about it. */
const IGNORED_KEYS = new Set(["id", "created_at", "updated_at", "createdAt", "updatedAt"]);

const LABELS: Record<string, string> = {
  is_active: "Active",
  isActive: "Active",
  is_accepting_orders: "Taking orders",
  staff_role: "Job role",
  branch_id: "Branch",
  branchIds: "Branches",
  display_name: "Name",
  price_cents: "Price",
  amount_cents: "Amount",
  amountCents: "Amount",
  percent_off: "Percent off",
  percentOff: "Percent off",
  max_uses: "Total uses allowed",
  maxUses: "Total uses allowed",
  max_uses_per_customer: "Uses per customer",
  maxUsesPerCustomer: "Uses per customer",
  starts_at: "Starts",
  startsAt: "Starts",
  expires_at: "Ends",
  expiresAt: "Ends",
  code: "Code",
  voucher_code: "Promo code",
  customerPhones: "Customers",
};

/** "max_discount_cents" and "maxDiscountCents" both become "Max discount". */
export function auditFieldLabel(key: string): string {
  if (LABELS[key]) return LABELS[key];
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+cents$/, "");
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function isCentsKey(key: string): boolean {
  return /(_cents|Cents)$/.test(key);
}

function clip(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

function pesos(cents: number): string {
  return `₱${(cents / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** One value, in words. */
export function formatAuditValue(value: unknown, key = ""): string {
  if (value === null || value === undefined) return "None";
  if (value === RESTRICTED_VALUE) return "Hidden (needs promo code access)";
  if (value === "[redacted]") return "Hidden";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return isCentsKey(key) ? pesos(value) : String(value);
  if (typeof value === "string") {
    if (isCentsKey(key) && /^-?\d+$/.test(value)) return pesos(Number(value));
    return clip(value) || "(blank)";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return clip(value.map((entry) => formatAuditValue(entry)).join(", "));
  }
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>)
      .filter(([entryKey]) => !IGNORED_KEYS.has(entryKey))
      .map(([entryKey, entry]) => `${auditFieldLabel(entryKey)}: ${formatAuditValue(entry, entryKey)}`);
    return parts.length === 0 ? "None" : clip(parts.join("; "));
  }
  return clip(String(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function rowLines(row: Record<string, unknown>): AuditDetailLine[] {
  return Object.entries(row)
    .filter(([key, value]) => !IGNORED_KEYS.has(key) && value !== null && value !== undefined)
    .map(([key, value]) => ({ label: auditFieldLabel(key), value: formatAuditValue(value, key) }));
}

function extraLines(detail: Record<string, unknown>, skip: readonly string[]): AuditDetailLine[] {
  return rowLines(Object.fromEntries(Object.entries(detail).filter(([key]) => !skip.includes(key))));
}

function summary(kind: AuditDetailSummary["kind"], lines: AuditDetailLine[]): AuditDetailSummary {
  return {
    kind,
    lines: lines.slice(0, MAX_LINES),
    hiddenCount: Math.max(lines.length - MAX_LINES, 0),
  };
}

export function describeAuditDetail(detail: Record<string, unknown>): AuditDetailSummary {
  if ("before" in detail || "after" in detail) {
    const before = detail.before;
    const after = detail.after;
    const extras = extraLines(detail, ["before", "after"]);

    if (isRecord(before) && isRecord(after)) {
      const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
      const changed = keys
        .filter((key) => !IGNORED_KEYS.has(key) && !same(before[key], after[key]))
        .map((key) => ({
          label: auditFieldLabel(key),
          before: formatAuditValue(before[key], key),
          after: formatAuditValue(after[key], key),
        }));
      return summary("changed", [...extras, ...changed]);
    }
    if ((before === null || before === undefined) && isRecord(after)) {
      return summary("created", [...extras, ...rowLines(after)]);
    }
    if (isRecord(before) && (after === null || after === undefined)) {
      return summary("removed", [...extras, ...rowLines(before)]);
    }
    return summary("changed", [
      ...extras,
      { label: "Value", before: formatAuditValue(before), after: formatAuditValue(after) },
    ]);
  }

  if ("from" in detail && "to" in detail) {
    return summary("changed", [
      { label: "Status", before: formatAuditValue(detail.from), after: formatAuditValue(detail.to) },
      ...extraLines(detail, ["from", "to"]),
    ]);
  }

  return summary("details", rowLines(detail));
}
