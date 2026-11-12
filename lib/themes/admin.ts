import "server-only";
import { z } from "zod";
import { createReadOnlyStaffClient } from "@/lib/supabase/server";
import { DEFAULT_THEME, parseTheme, type ThemeSetting } from "./presets";

export type LiveTheme = {
  setting: ThemeSetting;
  /** Null when nothing has ever been applied: the site has always been everyday. */
  appliedAt: string | null;
  appliedBy: string | null;
};

const row = z.object({
  applied_at: z.string().nullable().optional(),
  applied_by: z.string().nullable().optional(),
});

/**
 * The live theme as the Workspace sees it: the setting plus who applied it
 * and when. A missing row is the everyday look, never an error.
 */
export async function getLiveTheme(): Promise<LiveTheme> {
  const supabase = await createReadOnlyStaffClient();
  const { data, error } = await supabase.rpc("admin_get_site_theme");
  if (error || data === null || data === undefined) {
    return { setting: DEFAULT_THEME, appliedAt: null, appliedBy: null };
  }
  const meta = row.safeParse(data);
  return {
    setting: parseTheme(data),
    appliedAt: meta.success ? (meta.data.applied_at ?? null) : null,
    appliedBy: meta.success ? (meta.data.applied_by ?? null) : null,
  };
}
