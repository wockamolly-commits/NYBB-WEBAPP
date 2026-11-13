import "server-only";
import { z } from "zod";
import { createReadOnlyStaffClient } from "@/lib/supabase/server";
import { CONTENT_DEFAULTS } from "./defaults";
import { parseContent } from "./read";
import { CONTENT_PAGES, type ContentFor, type ContentPage } from "./schema";

/**
 * The Workspace's view of one editable page: what is live, what is waiting
 * in the draft, and who did each and when.
 */
export type PageState<P extends ContentPage = ContentPage> = {
  page: P;
  /** What visitors see now: the published body, or the built-in text. */
  live: ContentFor[P];
  /** False while the page has never been published, or was restored to the original. */
  customised: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  /** The saved draft, when there is one. */
  draft: ContentFor[P] | null;
  draftSavedAt: string | null;
  draftSavedBy: string | null;
  /** True when a stored body did not parse and the built-in text stood in. */
  unreadable: boolean;
};

const stateRow = z.object({
  page: z.string(),
  published: z.unknown().optional(),
  published_at: z.string().nullable().optional(),
  published_by: z.string().nullable().optional(),
  draft: z.unknown().optional(),
  draft_saved_at: z.string().nullable().optional(),
  draft_saved_by: z.string().nullable().optional(),
});

export type ContentReadError = "missing" | "forbidden" | "failed";

function readError(error: { code?: string; message?: string }): ContentReadError {
  if (error.code === "PGRST202" || error.message?.includes("Could not find the function")) return "missing";
  if (error.message?.includes("FORBIDDEN")) return "forbidden";
  return "failed";
}

function toState<P extends ContentPage>(page: P, raw: unknown): PageState<P> {
  const row = stateRow.safeParse(raw);
  const value = row.success ? row.data : null;
  const publishedRaw = value?.published ?? null;
  const draftRaw = value?.draft ?? null;
  const published = parseContent(page, publishedRaw);
  const draft = parseContent(page, draftRaw);
  return {
    page,
    live: published ?? CONTENT_DEFAULTS[page],
    customised: published !== null,
    publishedAt: value?.published_at ?? null,
    publishedBy: value?.published_by ?? null,
    draft,
    draftSavedAt: draft ? (value?.draft_saved_at ?? null) : null,
    draftSavedBy: draft ? (value?.draft_saved_by ?? null) : null,
    unreadable: (publishedRaw !== null && !published) || (draftRaw !== null && !draft),
  };
}

export async function getPageState<P extends ContentPage>(
  page: P,
): Promise<{ ok: true; state: PageState<P> } | { ok: false; error: ContentReadError }> {
  const supabase = await createReadOnlyStaffClient();
  const { data, error } = await supabase.rpc("admin_get_site_page", { p_page: page });
  if (error) return { ok: false, error: readError(error) };
  return { ok: true, state: toState(page, data) };
}

export async function listPageStates(): Promise<
  { ok: true; states: PageState[] } | { ok: false; error: ContentReadError }
> {
  const supabase = await createReadOnlyStaffClient();
  const { data, error } = await supabase.rpc("admin_list_site_pages");
  if (error) return { ok: false, error: readError(error) };
  const rows = Array.isArray(data) ? data : [];
  const byPage = new Map(
    rows.map((row) => [typeof row === "object" && row && "page" in row ? String(row.page) : "", row]),
  );
  return { ok: true, states: CONTENT_PAGES.map((page) => toState(page, byPage.get(page) ?? { page })) };
}
