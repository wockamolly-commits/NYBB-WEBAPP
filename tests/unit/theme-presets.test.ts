import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PALETTES } from "@/lib/themes/palettes";
import {
  BANNER_MAX,
  DEFAULT_THEME,
  SEASONAL_THEME_IDS,
  THEME_IDS,
  THEME_PRESETS,
  bannerText,
  parseTheme,
} from "@/lib/themes/presets";

describe("parseTheme", () => {
  it("falls back to the everyday look for anything malformed", () => {
    expect(parseTheme(null)).toEqual(DEFAULT_THEME);
    expect(parseTheme({})).toEqual(DEFAULT_THEME);
    expect(parseTheme({ id: "easter", banner: { show: true, text: "" }, effects: true })).toEqual(
      DEFAULT_THEME,
    );
    expect(
      parseTheme({ id: "christmas", banner: { show: true, text: "x".repeat(BANNER_MAX + 1) }, effects: true }),
    ).toEqual(DEFAULT_THEME);
  });

  it("keeps a valid seasonal setting and trims its text", () => {
    expect(parseTheme({ id: "halloween", banner: { show: true, text: "  Boo  " }, effects: false })).toEqual({
      id: "halloween",
      banner: { show: true, text: "Boo" },
      effects: false,
    });
  });

  it("never lets the default theme carry a banner", () => {
    expect(parseTheme({ id: "default", banner: { show: true, text: "Hi" }, effects: true })).toEqual(DEFAULT_THEME);
  });
});

describe("bannerText", () => {
  it("is null for the default theme and for a hidden banner", () => {
    expect(bannerText(DEFAULT_THEME)).toBeNull();
    expect(bannerText({ id: "christmas", banner: { show: false, text: "Hi" }, effects: true })).toBeNull();
  });

  it("uses the suggested text when the custom one is empty", () => {
    expect(bannerText({ id: "christmas", banner: { show: true, text: " " }, effects: true })).toBe(
      THEME_PRESETS.christmas.banner,
    );
    expect(bannerText({ id: "christmas", banner: { show: true, text: "Open late" }, effects: true })).toBe("Open late");
  });
});

describe("the theme list", () => {
  it("has a palette and a banner for every seasonal theme", () => {
    expect(Object.keys(PALETTES).sort()).toEqual([...SEASONAL_THEME_IDS].sort());
    for (const id of SEASONAL_THEME_IDS) {
      expect(THEME_PRESETS[id].banner.length).toBeGreaterThan(0);
      expect(THEME_PRESETS[id].banner.length).toBeLessThanOrEqual(BANNER_MAX);
    }
  });

  it("matches the check constraint in the migration", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/0107_site_themes.sql"), "utf8");
    const match = sql.match(/theme_id in \(([^)]*)\)/);
    expect(match).not.toBeNull();
    const ids = [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(ids.sort()).toEqual([...THEME_IDS].sort());
  });

  it("contains no em dashes in any customer facing copy", () => {
    for (const preset of Object.values(THEME_PRESETS)) {
      for (const text of [preset.name, preset.season, preset.blurb, preset.effectLabel, preset.banner]) {
        expect(text).not.toContain("—");
      }
    }
  });
});
