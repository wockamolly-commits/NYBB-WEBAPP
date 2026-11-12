import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";
import { DEFAULT_THEME, parseTheme, type ThemeSetting } from "./presets";

/** The cache tag the apply action expires. */
export const SITE_THEME_TAG = "site-theme";

/**
 * The live seasonal theme, for the storefront chrome.
 *
 * CACHED ACROSS REQUESTS, unlike almost every other read in this app. That is
 * safe here for the reason it is unsafe for promos (lib/promos/read.ts): the
 * answer is the same for every visitor. get_site_theme() takes no argument and
 * reads no auth.uid(), so a cache keyed on nothing cannot hand one person's
 * answer to another. The Workspace's apply action expires the tag with
 * updateTag, so a change shows on the very next page load; the five minute
 * revalidate is only a backstop for a write made some other way.
 *
 * EVERY FAILURE IS THE EVERYDAY LOOK, for the reason listPromos gives every
 * failure as an empty list: this is chrome on every public page, and a read
 * that could throw could take the site down over a colour scheme. The value is
 * parsed, never cast, so a theme id this deploy does not know is also the
 * everyday look rather than a broken one.
 */
const readCached = unstable_cache(
  async (): Promise<unknown> => {
    const { data, error } = await createPublicClient().rpc("get_site_theme");
    if (error) throw error;
    return data;
  },
  ["site-theme-v1"],
  { tags: [SITE_THEME_TAG], revalidate: 300 },
);

export const getTheme = cache(async (): Promise<ThemeSetting> => {
  if (!supabaseConfigured()) return DEFAULT_THEME;
  try {
    return parseTheme(await readCached());
  } catch {
    return DEFAULT_THEME;
  }
});
