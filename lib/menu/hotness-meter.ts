import { noise } from "@/lib/menu/heat-slider";

/**
 * The arithmetic behind the hotness meter's picture.
 *
 * `components/menu/HotnessMeter.tsx` draws; this decides. Kept in `lib/` for the
 * reason AGENTS.md rule 6 gives: the component cannot be unit tested here, so
 * anything that lives inside it is untested by construction.
 */

export type HeatTier = 0 | 1 | 2 | 3 | 4 | 5;
export type HotnessMeterSize = "small" | "medium" | "large";

/** What each tier is called, No heat first. The same names the menu sells. */
export const HEAT_TIER_NAMES = ["No heat", "Lite", "Moderate", "Hot", "Wild", "Insane"] as const;

/**
 * A score the meter can draw, 0 to 100.
 *
 * Anything that is not a finite number is no heat. The CSS multiplies lengths
 * by this, so a stray `NaN` or `Infinity` has to land somewhere harmless
 * rather than throw a flame across the page.
 */
export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(Math.max(score, 0), 100);
}

/**
 * The tier a score falls in: 1 to 20 is Lite, through 81 to 100 is Insane.
 *
 * Zero is its own tier and not the bottom of Lite. "No heat" means flavour only
 * and draws no fire at all, the same reason `heatSwatch` keeps it off the ramp.
 */
export function heatTier(score: number): HeatTier {
  const clamped = clampScore(score);
  if (clamped <= 0) return 0;
  return Math.min(Math.ceil(clamped / 20), 5) as HeatTier;
}

/** The meter's accessible name, e.g. "Hotness level: Wild, 78 percent". */
export function hotnessLabel(score: number): string {
  const clamped = Math.round(clampScore(score));
  return `Hotness level: ${HEAT_TIER_NAMES[heatTier(clamped)]}, ${clamped} percent`;
}

/**
 * How many tongues each layer of the fire carries at a size.
 *
 * The body is the low mass that never goes out, the licks rise off it, and the
 * surge is a handful of fast licks that only burn while somebody is dragging.
 * Every tongue is two painted boxes, so these are kept well under the point
 * where a phone starts dropping frames.
 */
export function flameBudget(size: HotnessMeterSize): { body: number; lick: number; surge: number } {
  switch (size) {
    case "small":
      return { body: 11, lick: 10, surge: 0 };
    case "medium":
      return { body: 16, lick: 15, surge: 5 };
    case "large":
      return { body: 22, lick: 20, surge: 8 };
  }
}

/**
 * The share of each layer's tongues alight at each tier, No heat first.
 *
 * This is where the tiers get different fires rather than one fire at five
 * brightnesses. Lite is a low bed with no licks at all, Moderate gets its first
 * few, and the licks only fill in from Hot upward.
 */
const TONGUE_SHARE = {
  body: [0, 0.75, 0.9, 1, 1, 1],
  lick: [0, 0, 0.4, 0.7, 0.88, 1],
} as const;

/**
 * The lowest tier at which a tongue is alight.
 *
 * Tongues are ranked by the golden ratio rather than by position, so whatever
 * share is lit is spread along the whole bar instead of filling in from the
 * left. Plain multiplication and flooring are exact in every engine, which
 * matters because this renders on the server and hydrates in the browser.
 */
export function tongueTierMin(layer: "body" | "lick", index: number, count: number): HeatTier {
  if (count <= 0) return 5;
  const rank = (index * 0.6180339887) % 1;
  const shares = TONGUE_SHARE[layer];
  for (let tier = 1; tier <= 5; tier++) {
    if (rank < shares[tier]) return tier as HeatTier;
  }
  return 5;
}

/**
 * How many embers and sparks a tier throws.
 *
 * None below Hot. The brief caps the meter at twenty and so does this, at the
 * largest size, because every particle is a separately animated element.
 */
export function particleBudget(tier: HeatTier, size: HotnessMeterSize): number {
  const max = size === "large" ? 18 : size === "medium" ? 12 : 8;
  if (tier >= 5) return max;
  if (tier === 4) return Math.round(max * 0.66);
  if (tier === 3) return Math.round(max * 0.36);
  return 0;
}

export type HeatParticle = {
  /** Where it leaves the bar, as a share of the lit run, 0 to 1. */
  x: number;
  /** Sideways drift over its life, -1 to 1. */
  drift: number;
  /** How high it gets, as a share of the flame height. */
  rise: number;
  /** Relative size, 0.6 to 1. */
  scale: number;
  /** Seconds of negative delay, so they never launch together. */
  delay: number;
  /** Seconds one flight takes. */
  duration: number;
  /** Embers float and glow. Sparks are thin, fast and only thrown at Insane. */
  kind: "ember" | "spark";
};

/**
 * A deterministic set of particles, hashed the same way as the fire so the
 * server and the browser agree on every one of them.
 */
export function heatParticles(count: number, tier: HeatTier): HeatParticle[] {
  if (count <= 0) return [];
  const salt = 7919;

  return Array.from({ length: count }, (_, at) => {
    const spark = tier >= 5 && at % 3 === 0;
    const duration = spark
      ? 0.7 + noise(salt + at * 11) * 0.6
      : 1.9 + noise(salt + at * 11) * 1.6;
    return {
      x: Math.min(Math.max((at + 0.5 + (noise(salt + at * 5) - 0.5) * 0.9) / count, 0), 1),
      drift: (noise(salt + at * 7) - 0.5) * 2,
      rise: 0.55 + noise(salt + at * 13) * 0.45,
      scale: 0.6 + noise(salt + at * 17) * 0.4,
      delay: noise(salt + at * 19) * duration,
      duration,
      kind: spark ? "spark" : "ember",
    };
  });
}
