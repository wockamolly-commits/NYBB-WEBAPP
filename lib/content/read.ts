import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";
import { CONTENT_DEFAULTS } from "./defaults";
import { CONTENT_PAGES, CONTENT_SCHEMAS, type ContentFor, type ContentPage } from "./schema";

/** The cache tag one page's publish expires. */
export function siteContentTag(page: ContentPage): string {
  return `site-content:${page}`;
}

/**
 * The published copy of one page, for the public site.
 *
 * Cached across requests for the reason the seasonal theme is
 * (lib/themes/read.ts): get_site_page takes the page name and nothing about
 * the visitor, so every visitor gets the same answer. Publishing expires the
 * page's tag with updateTag, so a change shows on the very next load; the
 * five minute revalidate is only a backstop.
 *
 * EVERY FAILURE IS THE BUILT-IN TEXT. No database, no migration yet, a read
 * error, nothing published, "restore the original" published, or a stored
 * body this deploy cannot parse: each one renders the text in defaults.ts.
 * A content read must never be the reason a policy page is blank.
 */
const readers = Object.fromEntries(
  CONTENT_PAGES.map((page) => [
    page,
    unstable_cache(
      async (): Promise<unknown> => {
        const { data, error } = await createPublicClient().rpc("get_site_page", { p_page: page });
        if (error) throw error;
        return data;
      },
      ["site-content-v1", page],
      { tags: [siteContentTag(page)], revalidate: 300 },
    ),
  ]),
) as Record<ContentPage, () => Promise<unknown>>;

/** A stored body, parsed against its page's schema. Null for anything unreadable. */
export function parseContent<P extends ContentPage>(page: P, value: unknown): ContentFor[P] | null {
  if (value === null || value === undefined) return null;
  const parsed = CONTENT_SCHEMAS[page].safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const getPageContent = cache(
  async <P extends ContentPage>(page: P): Promise<ContentFor[P]> => {
    const fallback = CONTENT_DEFAULTS[page];
    if (!supabaseConfigured()) return fallback;
    try {
      return parseContent(page, await readers[page]()) ?? fallback;
    } catch {
      return fallback;
    }
  },
);
