import { z } from "zod";
import { PALETTES } from "./palettes";

/**
 * Seasonal themes: the one list both the storefront and the Workspace read.
 *
 * A theme changes how the public site looks and never what it says. The menu,
 * the prices, the copy and the layout are the same under every one of these;
 * what moves is the palette (app/themes.css, generated from palettes.ts by
 * scripts/build-themes-css.ts), the decoration hung on the header and logo,
 * an optional banner, and an optional canvas animation.
 *
 * The order is the calendar, starting in January, because that is how the
 * person choosing one thinks about them. "default" is first and is not a
 * season: it is the everyday look, with no overrides of any kind.
 *
 * supabase/migrations/0107_site_themes.sql checks theme_id against the same
 * list, and tests/unit/theme-presets.test.ts fails if the two disagree.
 */
export const THEME_IDS = [
  "default",
  "new-year",
  "sinulog",
  "chinese-new-year",
  "valentines",
  "summer",
  "independence-day",
  "back-to-school",
  "halloween",
  "christmas",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];
export type SeasonalThemeId = Exclude<ThemeId, "default">;

export type EffectKind =
  | "none"
  | "fireworks"
  | "sinulog"
  | "lunar"
  | "hearts"
  | "summer"
  | "independence"
  | "school"
  | "halloween"
  | "snow";

export type ThemePreset = {
  id: ThemeId;
  name: string;
  /** When it usually runs, shown in the Workspace as a hint. */
  season: string;
  /** One line for the Workspace card describing the look. */
  blurb: string;
  /** What the animation does, in plain words. */
  effectLabel: string;
  effect: EffectKind;
  /** The suggested banner text. Shown when a custom one is left empty. */
  banner: string;
  /** Four dots on the Workspace card: card, accent, ground, signal. */
  swatch: readonly [card: string, accent: string, ground: string, signal: string];
  /** <meta name="theme-color">, the phone's address bar. */
  chrome: string;
};

function swatchOf(id: SeasonalThemeId): ThemePreset["swatch"] {
  const p = PALETTES[id];
  return [p.charcoal, p.accent, p.ground[1], p.signal];
}

export const THEME_PRESETS: Record<ThemeId, ThemePreset> = {
  default: {
    id: "default",
    name: "Everyday",
    season: "All year",
    blurb: "The regular NYBB look: amber ground, black cards, orange on everything that matters.",
    effectLabel: "None",
    effect: "none",
    banner: "",
    swatch: ["#17181a", "#ef6212", "#f7a70f", "#f9ee18"],
    chrome: "#0b0b0c",
  },
  "new-year": {
    id: "new-year",
    name: "New Year",
    season: "Late December to early January",
    blurb: "Midnight blue cards, champagne gold, a starburst print and a gold streamer.",
    effectLabel: "Fireworks bloom quietly in the background. Click to launch one.",
    effect: "fireworks",
    banner: "New year, same sauce. Start it with a basket of wings.",
    swatch: swatchOf("new-year"),
    chrome: PALETTES["new-year"].ink,
  },
  sinulog: {
    id: "sinulog",
    name: "Sinulog",
    season: "January, the third Sunday",
    blurb: "Sunset red-orange and festival yellow, a woven banig print and banderitas bunting.",
    effectLabel: "Festival confetti and ribbons drift down. Click for a burst.",
    effect: "sinulog",
    banner: "Pit Señor! Fuel up for the parade with a bucket of wings.",
    swatch: swatchOf("sinulog"),
    chrome: PALETTES.sinulog.ink,
  },
  "chinese-new-year": {
    id: "chinese-new-year",
    name: "Chinese New Year",
    season: "Late January to February",
    blurb: "Cinnabar and lucky gold, a cloud and coin print, lanterns on the header.",
    effectLabel:
      "Blossoms and coins fall, lanterns float up, and a dragon or a dance lion crosses now and then. Click for firecrackers.",
    effect: "lunar",
    banner: "Kung Hei Fat Choi! Share a lucky basket with the family.",
    swatch: swatchOf("chinese-new-year"),
    chrome: PALETTES["chinese-new-year"].ink,
  },
  valentines: {
    id: "valentines",
    name: "Valentine's",
    season: "Early to mid February",
    blurb: "Wine cards on a blush ground, a scattered heart print and a heart garland.",
    effectLabel: "Hearts rise and sway. Click to release a handful.",
    effect: "hearts",
    banner: "Wings for two. Sauce on the side, feelings on the table.",
    swatch: swatchOf("valentines"),
    chrome: PALETTES.valentines.ink,
  },
  summer: {
    id: "summer",
    name: "Summer",
    season: "March to May",
    blurb: "Ocean teal cards, a sun-yellow accent, waves and suns, a scalloped edge.",
    effectLabel: "Sunlit bubbles rise and shimmer. Click to make a splash.",
    effect: "summer",
    banner: "Too hot to cook. Not too hot for wings.",
    swatch: swatchOf("summer"),
    chrome: PALETTES.summer.ink,
  },
  "independence-day": {
    id: "independence-day",
    name: "Independence Day",
    season: "June 12",
    blurb: "Flag blue cards, sun gold, three stars and a sun print, tricolour bunting.",
    effectLabel: "Little suns and stars drift down in the flag's colours. Click for a burst.",
    effect: "independence",
    banner: "Maligayang Araw ng Kalayaan! Celebrate with a basket.",
    swatch: swatchOf("independence-day"),
    chrome: PALETTES["independence-day"].ink,
  },
  "back-to-school": {
    id: "back-to-school",
    name: "Back to School",
    season: "June to August",
    blurb: "Denim blue cards, bus yellow, a chalk doodle print and a ruler edge.",
    effectLabel: "Chalk letters and pencils drift down, and a paper plane glides past now and then.",
    effect: "school",
    banner: "Homework can wait. Wings after class.",
    swatch: swatchOf("back-to-school"),
    chrome: PALETTES["back-to-school"].ink,
  },
  halloween: {
    id: "halloween",
    name: "Halloween",
    season: "Late October",
    blurb: "Midnight purple cards on a pumpkin ground, cobwebs and bats, a witch hat on the logo.",
    effectLabel: "Leaves tumble and bats flit past. Click to scatter leaves.",
    effect: "halloween",
    banner: "Trick or heat? Our hottest sauce is the scariest thing here.",
    swatch: swatchOf("halloween"),
    chrome: PALETTES.halloween.ink,
  },
  christmas: {
    id: "christmas",
    name: "Christmas",
    season: "September to December",
    blurb:
      "Evergreen cards, warm gold, a snowflake print, twinkling lights and a Santa hat on the logo.",
    effectLabel:
      "Snow falls and drifts away from the pointer, and Santa's sleigh crosses the sky now and then. Click for a flurry.",
    effect: "snow",
    banner: "Merry Christmas from NYBB! Bring a bucket to the Noche Buena table.",
    swatch: swatchOf("christmas"),
    chrome: PALETTES.christmas.ink,
  },
};

export const BANNER_MAX = 140;

export const themeSettingSchema = z.object({
  id: z.enum(THEME_IDS),
  banner: z.object({
    show: z.boolean(),
    text: z.string().trim().max(BANNER_MAX),
  }),
  effects: z.boolean(),
});

export type ThemeSetting = z.infer<typeof themeSettingSchema>;

export const DEFAULT_THEME: ThemeSetting = {
  id: "default",
  banner: { show: false, text: "" },
  effects: true,
};

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

/**
 * Anything unknown or malformed is the everyday look.
 *
 * Called on every value read from the database, because a theme id written by
 * a newer deploy (or removed by this one) must not take the storefront down.
 * The default theme also never carries a banner, whatever was stored with it.
 */
export function parseTheme(raw: unknown): ThemeSetting {
  const parsed = themeSettingSchema.safeParse(raw);
  if (!parsed.success) return DEFAULT_THEME;
  if (parsed.data.id === "default") {
    return { ...DEFAULT_THEME, effects: parsed.data.effects };
  }
  return parsed.data;
}

/**
 * The banner line to show, or null for none.
 *
 * None for the default theme or when the banner is switched off. An empty
 * custom text means "use the suggested one", so the person applying a theme
 * can switch the banner on without writing anything.
 */
export function bannerText(theme: ThemeSetting): string | null {
  if (theme.id === "default" || !theme.banner.show) return null;
  const custom = theme.banner.text.trim();
  return custom || THEME_PRESETS[theme.id].banner || null;
}

export const SEASONAL_THEME_IDS = THEME_IDS.filter(
  (id): id is SeasonalThemeId => id !== "default",
);
