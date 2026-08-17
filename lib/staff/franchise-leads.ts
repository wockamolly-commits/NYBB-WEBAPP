import "server-only";

import { z } from "zod";
import { createReadOnlyStaffClient } from "@/lib/supabase/server";
import { firstSearchValue } from "./manila-dates";
import { ilikeOrFilter, ilikePattern } from "./search-pattern";

export const FRANCHISE_LEAD_PAGE_SIZE = 50;

export type FranchiseLeadFilters = {
  query: string;
  /** "open" hides leads somebody has already dealt with. */
  scope: "open" | "all";
  /** Keyset cursor: only leads older than this timestamp. Empty means page one. */
  before: string;
};

export type FranchiseLead = {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  phone: string;
  city: string | null;
  message: string | null;
  handledAt: string | null;
  handledByName: string | null;
};

export type FranchiseLeadPage = {
  leads: FranchiseLead[];
  /** The created_at to page from, or null when this is the last page. */
  olderCursor: string | null;
};

const handlerSchema = z.object({ display_name: z.string() });

const rowSchema = z.object({
  id: z.uuid(),
  created_at: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  city: z.string().nullable(),
  message: z.string().nullable(),
  handled_at: z.string().nullable(),
  handled_by: z.union([handlerSchema, z.array(handlerSchema)]).nullable(),
});

const leadSelect = `
  id, created_at, name, email, phone, city, message, handled_at,
  handled_by:profiles!franchise_inquiries_handled_by_profile_id_fkey ( display_name )
`;

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function normalizeFranchiseLeadFilters(
  values: Record<string, string | string[] | undefined>,
): FranchiseLeadFilters {
  const beforeValue = firstSearchValue(values.before).trim();

  return {
    query: firstSearchValue(values.q).trim().slice(0, 80),
    // Open is the default because the list exists to be worked. Somebody
    // opening this page wants the leads nobody has called yet, not a history.
    scope: firstSearchValue(values.scope) === "all" ? "all" : "open",
    // An ISO timestamp, which is what the cursor is here. `franchise_inquiries`
    // keys on a uuid rather than the bigserial the audit log pages on, so
    // ordering has to use created_at and so does the cursor.
    before: /^[\d\-T:.+Z]{10,40}$/.test(beforeValue) ? beforeValue : "",
  };
}

/** The query string that reproduces this view, so paging keeps the filters. */
export function franchiseLeadParams(
  filters: FranchiseLeadFilters,
  before: string | null,
): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.scope === "all") params.set("scope", "all");
  if (before) params.set("before", before);
  return params.toString();
}

export function toFranchiseLead(value: unknown): FranchiseLead | null {
  const parsed = rowSchema.safeParse(value);
  if (!parsed.success) return null;

  const row = parsed.data;
  return {
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    email: row.email,
    phone: row.phone,
    city: row.city,
    message: row.message,
    handledAt: row.handled_at,
    handledByName: first(row.handled_by)?.display_name ?? null,
  };
}

/**
 * Franchise leads, newest first.
 *
 * No role argument. RLS on `franchise_inquiries` is `is_admin()` and has been
 * since 0022, so a staff session reading this gets an empty list rather than a
 * refusal. The page gates on the same rule so that empty list is never what a
 * person actually sees.
 *
 * Returns null when the read failed, which the screen says differently from
 * having no leads.
 */
export async function getFranchiseLeads(
  filters: FranchiseLeadFilters,
): Promise<FranchiseLeadPage | null> {
  const supabase = await createReadOnlyStaffClient();
  const query = supabase
    .from("franchise_inquiries")
    .select(leadSelect)
    .order("created_at", { ascending: false })
    .limit(FRANCHISE_LEAD_PAGE_SIZE);

  if (filters.scope === "open") query.is("handled_at", null);
  if (filters.before) query.lt("created_at", filters.before);

  const pattern = ilikePattern(filters.query);
  if (pattern) query.or(ilikeOrFilter(["name", "email", "phone", "city"], pattern));

  const { data, error } = await query;
  if (error) {
    console.error("[workspace] franchise lead query failed:", error.message);
    return null;
  }

  const leads = (data ?? [])
    .map((row) => {
      const lead = toFranchiseLead(row);
      if (!lead) console.error("[workspace] skipped an unreadable franchise lead row");
      return lead;
    })
    .filter((lead): lead is FranchiseLead => lead !== null);

  // A full page is the only evidence another one exists, matching the audit
  // log. Two leads sharing a created_at to the microsecond would hide one at
  // the page boundary; at the volume a franchise pipeline runs at, that is not
  // worth a second query shape.
  const olderCursor =
    leads.length === FRANCHISE_LEAD_PAGE_SIZE
      ? leads[leads.length - 1]!.createdAt
      : null;

  return { leads, olderCursor };
}
