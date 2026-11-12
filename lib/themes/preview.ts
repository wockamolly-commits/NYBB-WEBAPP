import { BANNER_MAX, isThemeId, type SeasonalThemeId, type ThemeSetting } from "./presets";

type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The setting a preview link describes: /preview/theme/christmas?banner=1&fx=1&text=...
 *
 * Null for an id that is not a seasonal theme, which the route turns into a
 * 404. "default" is not previewable: it is what the live site looks like with
 * nothing applied, and the live site is one click away.
 *
 * Absent flags are off, not on. A link with no query previews the bare look,
 * and the Workspace always writes both flags out.
 */
export function previewSetting(id: string, query: Query): ThemeSetting | null {
  if (!isThemeId(id) || id === "default") return null;
  const text = (first(query.text) ?? "").trim().slice(0, BANNER_MAX);
  return {
    id: id as SeasonalThemeId,
    banner: { show: first(query.banner) === "1", text },
    effects: first(query.fx) === "1",
  };
}

/** The query string for a setting, the inverse of previewSetting. */
export function previewQuery(setting: ThemeSetting): string {
  const params = new URLSearchParams();
  params.set("banner", setting.banner.show ? "1" : "0");
  params.set("fx", setting.effects ? "1" : "0");
  if (setting.banner.show && setting.banner.text.trim()) params.set("text", setting.banner.text.trim());
  return params.toString();
}
