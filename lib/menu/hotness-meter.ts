import { heatSwatch, noise, type HeatStop } from "@/lib/menu/heat-slider";

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

/**
 * The chili count printed under each level, from the owner's reference art:
 * Lite ×1, Moderate ×5, Hot ×10, Wild ×20, Insane ×35. It climbs steeply on
 * purpose, so each step up reads as a real jump. No heat shows none.
 */
export const CHILI_COUNT: Record<HeatTier, number> = { 0: 0, 1: 1, 2: 5, 3: 10, 4: 20, 5: 35 };

/** The chilies shown for a score, by its tier. */
export function chiliCount(score: number): number {
  return CHILI_COUNT[heatTier(score)];
}

/** The meter's accessible name, e.g. "Hotness level: Wild, 78 percent". */
export function hotnessLabel(score: number): string {
  const clamped = Math.round(clampScore(score));
  return `Hotness level: ${HEAT_TIER_NAMES[heatTier(clamped)]}, ${clamped} percent`;
}

/**
 * The flame's drawing space: an SVG viewBox 100 wide and 160 tall, with the
 * flame's base centred at (50, 150), just above the bottom edge, where it cups
 * the top of the ember.
 */
export const FLAME_BOX = { width: 100, height: 160, baseX: 50, baseY: 150 } as const;

/** One pose of the flame, in viewBox units. */
export type FlameShape = {
  /** Half the width at the widest point of the belly. */
  width: number;
  /** Base to tip. */
  height: number;
  /** Where the tip sits across the box. */
  tipX: number;
  /** How far the upper body bends toward the tip's side. */
  sway: number;
};

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * One flame silhouette as an SVG path: a rounded belly that cups the ember,
 * narrowing through a waist into a single curling tip.
 *
 * Every pose is written with the same commands in the same order (a move, five
 * cubics, a close), because SVG can only morph smoothly between two paths that
 * have the same structure. Change the structure of one and the animation
 * snaps instead of flowing.
 */
export function flamePath({ width: w, height: h, tipX, sway }: FlameShape): string {
  const { baseX: x, baseY: y } = FLAME_BOX;
  const points = [
    // Left of the belly, rolling up off the base.
    [x - w * 0.95, y, x - w * 1.08, y - h * 0.14, x - w, y - h * 0.3],
    // The left flank, drawn in toward the tip as it rises.
    [x - w * 0.9 + sway * 0.4, y - h * 0.48, x - w * 0.3 + sway * 0.8, y - h * 0.62, tipX - w * 0.14, y - h * 0.82],
    // Up into the tip.
    [tipX - w * 0.05, y - h * 0.9, tipX - w * 0.02, y - h * 0.96, tipX, y - h],
    // Down the right flank, which is fuller: a flame's two sides never match.
    [tipX + w * 0.16, y - h * 0.8, x + w * 0.5 + sway * 0.8, y - h * 0.62, x + w, y - h * 0.34],
    // Round the right of the belly and back to the base.
    [x + w * 1.1, y - h * 0.14, x + w * 0.85, y, x, y],
  ];
  const curves = points.map((p) => `C${p.map(round).join(" ")}`).join(" ");
  return `M${x} ${y} ${curves} Z`;
}

export type FlameLayer = "outer" | "body" | "core";

/**
 * The poses each layer moves through, in order, looping. The outer flame is
 * the tall ragged envelope, the body the amber mass inside it, the core the
 * white hot heart that sits down on the ember. They share a rhythm but not a
 * clock, so the inside of the flame visibly moves against the outside, which
 * is what makes it read as burning rather than as a shape being stretched.
 */
const POSES: Record<FlameLayer, readonly FlameShape[]> = {
  outer: [
    { width: 30, height: 142, tipX: 50, sway: 0 },
    { width: 32, height: 128, tipX: 41, sway: -8 },
    { width: 28, height: 147, tipX: 57, sway: 7 },
    { width: 31, height: 134, tipX: 46, sway: -3 },
    { width: 29, height: 140, tipX: 54, sway: 4 },
  ],
  body: [
    { width: 22, height: 96, tipX: 50, sway: 0 },
    { width: 23, height: 88, tipX: 46, sway: -5 },
    { width: 21, height: 102, tipX: 54, sway: 5 },
    { width: 22, height: 92, tipX: 48, sway: -2 },
  ],
  core: [
    { width: 13, height: 52, tipX: 50, sway: 0 },
    { width: 14, height: 46, tipX: 48, sway: -2 },
    { width: 12, height: 56, tipX: 52, sway: 2 },
  ],
};

/**
 * How each level burns: `speed` multiplies every layer's clock (under 1 is
 * faster), `wildness` scales how far each pose strays from the flame's resting
 * shape. Lite is a slow, steady candle; Insane thrashes at nearly three times
 * the pace with its tip swinging almost twice as far. No heat draws no flame,
 * so its entry is only there to keep the table total.
 */
export const FLAME_TEMPER: Record<HeatTier, { speed: number; wildness: number }> = {
  0: { speed: 1, wildness: 0 },
  1: { speed: 1.6, wildness: 0.35 },
  2: { speed: 1.25, wildness: 0.7 },
  3: { speed: 1, wildness: 1 },
  4: { speed: 0.74, wildness: 1.35 },
  5: { speed: 0.56, wildness: 1.7 },
};

/** The tallest a pose may stand, so a wild tip never leaves the drawing. */
const MAX_HEIGHT = FLAME_BOX.baseY - 2;

/**
 * A layer's poses as the `values` of an SVG `<animate>`: every pose in order
 * and the first again at the end, so the loop closes without a jump.
 *
 * `wildness` scales each pose's distance from the first, the resting shape:
 * 0 is a still flame, 1 the poses as drawn, above 1 exaggerated.
 */
export function flameFrames(layer: FlameLayer, wildness = 1): string[] {
  const poses = POSES[layer];
  const rest = poses[0];
  const k = Math.max(wildness, 0);
  const scaled = poses.map((pose) => ({
    width: rest.width + (pose.width - rest.width) * k,
    height: Math.min(rest.height + (pose.height - rest.height) * k, MAX_HEIGHT),
    tipX: rest.tipX + (pose.tipX - rest.tipX) * k,
    sway: pose.sway * k,
  }));
  return [...scaled, scaled[0]].map(flamePath);
}

/**
 * Easing for every step between poses, as `keySplines`: a gentle ease in and
 * out, so the flame drifts between shapes instead of ticking through them.
 */
export function flameSplines(layer: FlameLayer): string {
  return Array.from({ length: POSES[layer].length }, () => "0.45 0 0.55 1").join("; ");
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

/**
 * The track's colour: the stops' own fixed swatches, blended between.
 *
 * Each swatch is pinned at the centre of its stop, which is exactly where the
 * pointer comes to rest on that stop and where its label sits. So the colour
 * under a chosen level is always that level's swatch and never a sample from
 * somewhere between two of them, which is the promise DESIGN.md's heat ramp
 * makes. Only the stretch between two stops is a blend, and no level lives
 * there.
 */
export function rampGradient(stops: readonly HeatStop[]): string {
  if (stops.length === 0) return "var(--color-nybb-graphite)";
  if (stops.length === 1) return heatSwatch(stops[0].percent);
  const n = stops.length;
  const pins = stops.map(
    (stop, at) => `${heatSwatch(stop.percent)} ${(((at + 0.5) / n) * 100).toFixed(3)}%`,
  );
  return `linear-gradient(to right, ${pins.join(", ")})`;
}

/**
 * Where the pointer rests on a stop, as a share of the bar: the centre of its
 * segment, over its label and on its pinned swatch.
 */
export function stopCentre(index: number, count: number): number {
  if (count <= 0) return 0;
  const clamped = Math.min(Math.max(index, 0), count - 1);
  return (clamped + 0.5) / count;
}
