/**
 * The tokens the app draws with, taken from the project's `DESIGN.md`.
 *
 * The preview screens this replaces had drifted: a slightly different charcoal,
 * a slightly different graphite, and a neutral grey for outlines. DESIGN.md is
 * explicit that this system has no neutral grey anywhere, and that a border on
 * dark is warm bone at an alpha rather than a colour of its own, so the muted
 * values below are all bone over the ground rather than invented greys.
 *
 * This is a subset, not a second design system. Anything a screen needs that is
 * not here should be added to `DESIGN.md` first and then mirrored.
 */

export const colors = {
  /** Char. The app ground. */
  char: "#0b0b0c",
  /** Charcoal. Cards and every elevated dark surface. */
  charcoal: "#17181a",
  /** Graphite. Input fills and pressed states on dark. */
  graphite: "#232528",
  /** Warm Bone. The reading colour on dark surfaces. */
  bone: "#f5f1ea",
  /** The uppercase micro-label, at 55% per DESIGN.md. */
  boneLabel: "rgba(245, 241, 234, 0.55)",
  /** Secondary copy. Still comfortably above 4.5:1 on charcoal. */
  boneMuted: "rgba(245, 241, 234, 0.72)",
  /**
   * A control's own boundary. DESIGN.md sets this at 40% bone on dark, which is
   * the point where it still measures 3:1 against this ground.
   */
  border: "rgba(245, 241, 234, 0.4)",
  /** Focused or chosen, where the border is the only thing that moves. */
  borderStrong: "rgba(245, 241, 234, 0.6)",
  /** Disabled or taken, per the pickup-slot rules. */
  borderQuiet: "rgba(245, 241, 234, 0.1)",
  buffaloOrange: "#ef6212",
  buffaloOrangeLit: "#f47621",
  signageYellow: "#f9ee18",
  buffaloRed: "#ee2329",
  redDeep: "#c81319",
} as const;

/** The five-stop heat scale, in order. */
export const heatScale = ["#f9ee18", "#f7c115", "#f47621", "#ef4a17", "#ee2329"] as const;

/** One radius on essentially everything, `0.4rem` at a 16px base. */
export const RADIUS = 6;

/** Full rounding, reserved for genuinely circular objects. */
export const RADIUS_FULL = 999;

/**
 * The minimum interaction target, from section 21 of the implementation prompt
 * and section 22 of DESIGN.md's accessibility rules.
 */
export const TAP_TARGET = 44;
