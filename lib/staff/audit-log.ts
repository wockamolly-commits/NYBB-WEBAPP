import "server-only";

import { z } from "zod";
import { createReadOnlyStaffClient } from "@/lib/supabase/server";
import {
  firstSearchValue,
  isValidWorkspaceDate,
  manilaDateEndExclusiveIso,
  manilaDateStartIso,
} from "./manila-dates";
import { ilikeOrFilter, ilikePattern } from "./search-pattern";

export const AUDIT_PAGE_SIZE = 50;

export type AuditLogFilters = {
  query: string;
  from: string;
  to: string;
  /** Keyset cursor: only rows older than this id. Empty means the newest page. */
  before: string;
};

export type AuditLogEntry = {
  id: string;
  createdAt: string;
  action: string;
  targetTable: string;
  targetId: string | null;
  branchName: string | null;
  actorName: string | null;
  actorRole: "admin" | "staff" | null;
  detail: Record<string, unknown> | null;
};

export type AuditLogPage = {
  entries: AuditLogEntry[];
  /** The id to page from, or null when this is the last page. */
  olderCursor: string | null;
};

/**
 * Values that never reach the audit screen, for two different reasons.
 *
 * **Credentials.** Nothing writes one into a diff today. That is not a claim
 * that nothing ever will: `diff` is `jsonb` and a future RPC that logs a row
 * it changed will carry whatever columns that row has. The pickup code, the
 * tracking token, the invitation token hash and the push keys are the values
 * in this schema that must never be readable, so they are named here and the
 * redaction runs before the page sees the object.
 *
 * **A phone number.** This one is written today. The access-change and Super
 * Admin provisioning RPCs record `to_jsonb()` of the profile row, which
 * carries `phone`, so a staff member's number appeared in the detail of any
 * entry about their account. It is not a credential and an audit trail that
 * hides what changed is not one, so this was a judgement call rather than a
 * defect, and the owner made it: mask it. What survives is that the change
 * happened, who made it, and to whom, which is what the trail is for.
 *
 * Note what this does not cover. An email address is not masked, because no
 * diff in this schema carries one; `profiles` has no email column and the
 * address lives in the Auth directory. If a future RPC starts logging one,
 * decide then rather than assuming the suffix rule below caught it.
 *
 * A denylist is the wrong default in general. It is the right one here because
 * the diff is deliberately open ended and an allowlist would quietly blank the
 * next useful field somebody logs.
 */
const REDACTED_KEYS = new Set([
  "pickup_code",
  "pickupcode",
  "tracking_token",
  "trackingtoken",
  "token",
  "token_hash",
  "tokenhash",
  "password",
  "secret",
  "p256dh",
  "auth_key",
  "authkey",
  "phone",
]);

const REDACTED = "[redacted]";

function isRedactedKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return REDACTED_KEYS.has(normalized)
    || normalized.endsWith("_token")
    || normalized.endsWith("_secret")
    || normalized.endsWith("_phone");
}

/** Walks the diff and blanks any value whose key names a credential. */
export function redactAuditDetail(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditDetail);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        isRedactedKey(key) ? REDACTED : redactAuditDetail(entry),
      ]),
    );
  }
  return value;
}

const branchSchema = z.object({ short_name: z.string() });
const actorSchema = z.object({
  display_name: z.string(),
  role: z.enum(["admin", "staff"]),
});

const rowSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
  created_at: z.string(),
  action: z.string(),
  target_table: z.string(),
  target_id: z.string().nullable(),
  diff: z.unknown(),
  branches: z.union([branchSchema, z.array(branchSchema)]).nullable(),
  actor: z.union([actorSchema, z.array(actorSchema)]).nullable(),
});

const auditSelect = `
  id, created_at, action, target_table, target_id, diff,
  branches ( short_name ),
  actor:profiles!audit_logs_actor_profile_id_fkey ( display_name, role )
`;

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function normalizeAuditFilters(
  values: Record<string, string | string[] | undefined>,
): AuditLogFilters {
  const fromValue = firstSearchValue(values.from);
  const toValue = firstSearchValue(values.to);
  const beforeValue = firstSearchValue(values.before).trim();

  return {
    query: firstSearchValue(values.q).trim().slice(0, 80),
    from: isValidWorkspaceDate(fromValue) ? fromValue : "",
    to: isValidWorkspaceDate(toValue) ? toValue : "",
    // A bigserial id, so digits only and short enough that no arithmetic on it
    // can leave the range Postgres will accept.
    before: /^\d{1,19}$/.test(beforeValue) ? beforeValue : "",
  };
}

/** The query string that reproduces this view, so paging keeps the filters. */
export function auditFilterParams(
  filters: AuditLogFilters,
  before: string | null,
): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (before) params.set("before", before);
  return params.toString();
}

export function toAuditLogEntry(value: unknown): AuditLogEntry | null {
  const parsed = rowSchema.safeParse(value);
  if (!parsed.success) return null;

  const row = parsed.data;
  const actor = first(row.actor);
  const detail = redactAuditDetail(row.diff);

  return {
    id: String(row.id),
    createdAt: row.created_at,
    action: row.action,
    targetTable: row.target_table,
    targetId: row.target_id,
    branchName: first(row.branches)?.short_name ?? null,
    actorName: actor?.display_name ?? null,
    actorRole: actor?.role ?? null,
    detail:
      detail && typeof detail === "object" && !Array.isArray(detail)
        ? (detail as Record<string, unknown>)
        : null,
  };
}

/**
 * The trail, newest first, for whoever is signed in.
 *
 * There is no branch argument on purpose. Migration 0023 scopes audit_logs by
 * the caller's own branch inside RLS, so a page that forgot to pass one would
 * still be scoped, and a page that passed the wrong one could not widen it.
 * Returns null when the read failed, which the screen says differently from an
 * empty trail.
 */
export async function getAuditLog(
  filters: AuditLogFilters,
): Promise<AuditLogPage | null> {
  const supabase = await createReadOnlyStaffClient();
  const query = supabase
    .from("audit_logs")
    .select(auditSelect)
    .order("id", { ascending: false })
    .limit(AUDIT_PAGE_SIZE);

  const from = manilaDateStartIso(filters.from);
  const to = manilaDateEndExclusiveIso(filters.to);
  if (from) query.gte("created_at", from);
  if (to) query.lt("created_at", to);
  if (filters.before) query.lt("id", filters.before);

  const pattern = ilikePattern(filters.query);
  if (pattern) query.or(ilikeOrFilter(["action", "target_id"], pattern));

  const { data, error } = await query;
  if (error) {
    console.error("[workspace] audit log query failed:", error.message);
    return null;
  }

  const entries = (data ?? [])
    .map((row) => {
      const entry = toAuditLogEntry(row);
      if (!entry) console.error("[workspace] skipped an unreadable audit row");
      return entry;
    })
    .filter((entry): entry is AuditLogEntry => entry !== null);

  // A full page is the only evidence that another one exists. Asking for one
  // more row per page to know for certain is not worth a second query shape.
  const olderCursor =
    entries.length === AUDIT_PAGE_SIZE
      ? entries[entries.length - 1]!.id
      : null;

  return { entries, olderCursor };
}
