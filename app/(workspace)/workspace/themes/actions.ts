"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getStaffProfile, hasStaffPermission } from "@/lib/staff/session";
import { createStaffClient } from "@/lib/supabase/server";
import type { ThemeActionState } from "@/lib/themes/action-state";
import { DEFAULT_THEME, THEME_PRESETS, themeSettingSchema } from "@/lib/themes/presets";
import { SITE_THEME_TAG } from "@/lib/themes/read";

/**
 * The two writes behind /workspace/themes.
 *
 * Checked here so a person without themes:manage gets a sentence rather than
 * a spinner, and checked again inside admin_apply_site_theme (0107), which is
 * the check that matters: no staff session holds a write grant on
 * site_themes at all.
 *
 * After a write the cached storefront read is expired with updateTag, so the
 * next page load anywhere wears the new look, and the whole tree under the
 * root layout is revalidated for anybody already on a page.
 */

function errorFor(code: string | undefined, message: string | undefined): string {
  // PostgREST's "no such function": the database has not had 0107 applied.
  if (code === "PGRST202" || message?.includes("Could not find the function")) {
    return "Seasonal themes are not set up on this database yet. Migration 0107 needs to be applied first.";
  }
  if (message?.includes("FORBIDDEN")) return "You do not have access to change the website's theme.";
  if (message?.includes("UNKNOWN_THEME")) return "That theme is not one this site knows. Reload the page and try again.";
  if (message?.includes("BANNER_TOO_LONG")) return "The banner is too long.";
  return "We could not apply that just now. Please try again.";
}

async function write(input: unknown): Promise<ThemeActionState> {
  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "themes:manage")) {
    return { ok: false, error: "You do not have access to change the website's theme." };
  }

  const parsed = themeSettingSchema.safeParse(input);
  if (!parsed.success) {
    const textIssue = parsed.error.issues.find((issue) => issue.path.join(".") === "banner.text");
    return textIssue
      ? { ok: false, error: "Some of this needs another look.", fieldErrors: { text: "Keep the banner to 140 characters." } }
      : { ok: false, error: "That request could not be read. Reload the page and try again." };
  }

  const setting = parsed.data;
  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("admin_apply_site_theme", {
    p_theme_id: setting.id,
    p_banner_show: setting.banner.show,
    p_banner_text: setting.banner.text,
    p_effects: setting.effects,
  });
  if (error) return { ok: false, error: errorFor(error.code, error.message) };

  updateTag(SITE_THEME_TAG);
  revalidatePath("/", "layout");

  return {
    ok: true,
    message:
      setting.id === "default"
        ? "The everyday look is back on the website."
        : `${THEME_PRESETS[setting.id].name} is live on every page of the website.`,
  };
}

export async function applyTheme(input: unknown): Promise<ThemeActionState> {
  return write(input);
}

export async function restoreDefaultTheme(): Promise<ThemeActionState> {
  return write(DEFAULT_THEME);
}
