/**
 * The colours each seasonal theme puts on the brand tokens.
 *
 * Pure data, with no imports, so scripts/build-themes-css.ts can read it to
 * write app/themes.css and tests/unit/theme-contrast.test.ts can check every
 * pair the storefront actually prints.
 *
 * WHY THE ROLES ARE THESE AND NOT THE REFERENCE'S.
 *
 * The sister project themes a dark header and footer. This site cannot: the
 * "NEW YORK" line of the wordmark is solid black with no outline, so the
 * chrome is light by necessity (see the note on --color-nybb-cream in
 * app/globals.css). Its structure is a light ground, dark cards on it, light
 * chrome above and below, and one loud accent. A theme keeps that structure
 * and recolours each layer:
 *
 *   ink           --color-nybb-ink, the darkest value: dark bands, body text
 *   charcoal      --color-nybb-charcoal, the cards (and the banner)
 *   graphite      --color-nybb-graphite, raised surfaces on a card
 *   accent        --color-nybb-orange: every CTA, price, active state, focus
 *   accentLit     --color-nybb-orange-lit, the accent's hover
 *   signal        --color-nybb-yellow: badges and micro labels on dark
 *   ground        the page gradient behind everything, top to bottom
 *   cream..deep   the header and footer, kept light and only tinted
 *   shadow        an "r g b" triple for the warm shadows under the chrome
 *
 * Bone (reading text on dark), the reds (destructive) and the heat scale are
 * never themed. A heat level is data, and the same swatch has to mean the same
 * thing on a product page, a receipt and a ticket in every season.
 *
 * THE CONTRAST RULES EVERY PALETTE HAS TO MEET, all at AA 4.5:1:
 *   ink on accent (button labels), ink on every ground stop, ink on the chrome,
 *   accent on charcoal (prices on cards), bone on charcoal and on graphite,
 *   signal on ink and on charcoal. The test enforces each one.
 */

export type Palette = {
  ink: string;
  charcoal: string;
  graphite: string;
  accent: string;
  accentLit: string;
  signal: string;
  ground: readonly [string, string, string, string];
  cream: string;
  parchment: string;
  parchmentDeep: string;
  /** "r g b", for rgb(var(--x) / alpha). */
  shadow: string;
};

export const PALETTES = {
  "new-year": {
    ink: "#070d22",
    charcoal: "#0b1638",
    graphite: "#18275a",
    accent: "#f5d06f",
    accentLit: "#f8dc8f",
    signal: "#fff1b8",
    ground: ["#d4bb82", "#e4d0a2", "#f0e4c6", "#faf5e8"],
    cream: "#fdfaf2",
    parchment: "#f3ead4",
    parchmentDeep: "#ebdfc0",
    shadow: "11 22 56",
  },
  sinulog: {
    ink: "#1c0a04",
    charcoal: "#5e1f0a",
    graphite: "#7e2c10",
    accent: "#ffd60a",
    accentLit: "#ffe14a",
    signal: "#ffe57a",
    ground: ["#f2913f", "#f7b064", "#fbd38c", "#fdf0c0"],
    cream: "#fff9ec",
    parchment: "#fbebcd",
    parchmentDeep: "#f5ddb2",
    shadow: "94 31 10",
  },
  "chinese-new-year": {
    ink: "#1a0606",
    charcoal: "#6e0b11",
    graphite: "#8c1018",
    accent: "#ffcf3f",
    accentLit: "#ffda6a",
    signal: "#ffe69a",
    ground: ["#ef7f72", "#f5a596", "#facdbf", "#fdeee2"],
    cream: "#fff8f0",
    parchment: "#fbe8d8",
    parchmentDeep: "#f5d8c2",
    shadow: "110 11 17",
  },
  valentines: {
    ink: "#1a0a10",
    charcoal: "#4a0f22",
    graphite: "#62182f",
    accent: "#ff8fab",
    accentLit: "#ffa8bf",
    signal: "#ffc2d1",
    ground: ["#f29bb0", "#f7b9c8", "#fbd8e0", "#fff0f3"],
    cream: "#fff6f8",
    parchment: "#fbe4ea",
    parchmentDeep: "#f6d2dc",
    shadow: "74 15 34",
  },
  summer: {
    ink: "#06202c",
    charcoal: "#0b3a4f",
    graphite: "#114b63",
    accent: "#ffd23f",
    accentLit: "#ffdc66",
    signal: "#ffe98a",
    ground: ["#62c2d4", "#a2dbdc", "#e0f0dc", "#fff4dc"],
    cream: "#fffaf0",
    parchment: "#fbefd6",
    parchmentDeep: "#f5e4c0",
    shadow: "11 58 79",
  },
  "independence-day": {
    ink: "#07142e",
    charcoal: "#0b2a6b",
    graphite: "#14378a",
    accent: "#fcd116",
    accentLit: "#ffdd4a",
    signal: "#ffe46b",
    ground: ["#8eaee6", "#c3d4f2", "#eef1f8", "#fbe3e5"],
    cream: "#fbfbfd",
    parchment: "#eef1f8",
    parchmentDeep: "#e2e7f3",
    shadow: "11 42 107",
  },
  "back-to-school": {
    ink: "#0c1a2e",
    charcoal: "#163a66",
    graphite: "#1f4c84",
    accent: "#ffc72c",
    accentLit: "#ffd45c",
    signal: "#fff176",
    ground: ["#98bee4", "#bad4ee", "#dce8f3", "#f6f2e4"],
    cream: "#fbfaf5",
    parchment: "#eef0ea",
    parchmentDeep: "#e3e7e0",
    shadow: "22 58 102",
  },
  halloween: {
    ink: "#120818",
    charcoal: "#2a1440",
    graphite: "#3b1e58",
    accent: "#ff8c1a",
    accentLit: "#ffa244",
    signal: "#ffd36b",
    ground: ["#e8701a", "#f19034", "#f6b25c", "#fbd28a"],
    cream: "#fbf3ea",
    parchment: "#f1e1d0",
    parchmentDeep: "#e8d1bb",
    shadow: "42 20 64",
  },
  christmas: {
    ink: "#0e1a13",
    charcoal: "#1d3b2a",
    graphite: "#28503a",
    accent: "#f4c542",
    accentLit: "#f8d46e",
    signal: "#ffe08a",
    ground: ["#e49a90", "#efbcb3", "#f7ded6", "#fbf6ec"],
    cream: "#fdf8f1",
    parchment: "#f4e6dc",
    parchmentDeep: "#ecd6c9",
    shadow: "140 28 36",
  },
} as const satisfies Record<string, Palette>;

/** Bone never changes; the contrast test needs it. */
export const BONE = "#f5f1ea";
