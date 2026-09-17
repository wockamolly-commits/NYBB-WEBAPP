import type { MenuOption } from "@/lib/menu/types";

/**
 * The arithmetic behind the sliding heat bar.
 *
 * This is deliberately plain functions in `lib/` rather than logic inside the
 * client component, for the reason AGENTS.md rule 6 gives: the component
 * cannot be unit tested in this project (vitest runs in a Node environment and
 * collects `.test.ts` only), so anything that lives in it is untested by
 * construction. The one genuinely dangerous decision here is the empty versus
 * zero distinction below, and it is exactly the kind that ships silently.
 */

export type HeatStop = {
  slug: string;
  name: string;
  /** 0 to 100. */
  percent: number;
};

/**
 * Where the thumb sits, and whether that position means anything.
 *
 * These are two facts and not one. The Level of Hotness group is
 * `minSelect: 0`, so a wings line starts with no level chosen, and "No heat"
 * is a real option carrying `heatPercent: 0`. Both draw the thumb at the left
 * end of the track, and they are opposite answers: an untouched slider must
 * write no `order_item_options` row, while "No heat" writes one with
 * `heat_percent_snapshot = 0` that reaches the kitchen ticket and the
 * analytics heat mix.
 *
 * Collapsing them would put a level on every wings order nobody asked for, so
 * `index` never carries the answer on its own and the caller has to read
 * `chosen` to know whether to commit anything.
 */
export type HeatSliderState = {
  /** Always a position the control can render, chosen or not. */
  index: number;
  /** False means untouched. The index is a resting place, not a selection. */
  chosen: boolean;
  /** The stop under the thumb, or null when the group has no stops. */
  stop: HeatStop | null;
};

/**
 * The stops on the scale, coldest first.
 *
 * An option with no `heatPercent` is not on the scale at all: a flavour is not
 * a temperature. Null and undefined both mean "not heat", and neither of them
 * means zero, so they are dropped rather than floored.
 */
export function heatStops(options: readonly MenuOption[]): HeatStop[] {
  return options
    .filter((option) => typeof option.heatPercent === "number")
    .map((option) => ({
      slug: option.slug,
      name: option.name,
      percent: option.heatPercent as number,
    }))
    .sort((a, b) => a.percent - b.percent);
}

/** The stop at an index, clamped into the track. Null when there are none. */
export function stopAt(stops: readonly HeatStop[], index: number): HeatStop | null {
  if (stops.length === 0) return null;
  return stops[Math.min(Math.max(Math.round(index), 0), stops.length - 1)];
}

/** Resolve a selected slug into a thumb position. See `HeatSliderState`. */
export function heatSliderState(
  stops: readonly HeatStop[],
  slug: string | null | undefined,
): HeatSliderState {
  if (stops.length === 0) return { index: 0, chosen: false, stop: null };

  // A slug this group does not sell is not a selection. It reaches here from a
  // hand-edited URL, and parking the thumb somewhere arbitrary would claim a
  // choice the customer never made.
  const found = slug ? stops.findIndex((stop) => stop.slug === slug) : -1;
  if (found < 0) return { index: 0, chosen: false, stop: stops[0] };

  return { index: found, chosen: true, stop: stops[found] };
}

export type FlameTongue = {
  /** Centre of the tongue's base along the bar, 0 to 1. */
  x: number;
  /** Width of the base, as a share of the bar's width. */
  width: number;
  /** Height of the tip above the base, as a share of the reserved height. */
  height: number;
  /** How far the tip leans off centre, as a share of its own height. */
  lean: number;
  /** Seconds of negative animation delay, so the tongues start out of step. */
  delay: number;
  /** Seconds one flicker takes. Varied, so nothing beats in unison. */
  duration: number;
};

/**
 * A deterministic 0 to 1 from an integer, for the fire's raggedness.
 *
 * Integer operations only, and deliberately not `Math.sin(i) * 43758.5453`,
 * which is the usual shader trick for this. ECMAScript lets an engine choose
 * its own precision for the transcendental functions, so two engines can
 * disagree in the last bits of a sine; magnified by a large multiplier and cut
 * to its fractional part, that disagreement becomes a different number. This
 * bar renders on the server and hydrates in the browser, so a value that is
 * merely almost identical is a hydration mismatch. `Math.imul` and the shifts
 * below are exact everywhere.
 */
function noise(seed: number): number {
  let x = (seed + 1) | 0;
  x = Math.imul(x ^ (x >>> 15), 2246822519);
  x = Math.imul(x ^ (x >>> 13), 3266489917);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/**
 * A fire's worth of tongues: where each one stands, how tall, how wide, which
 * way it leans and how fast it flickers.
 *
 * Every value is drawn from the hash above rather than from a repeating
 * pattern. The fire this replaced cycled eight heights and five widths, which
 * at twenty two tongues meant the eye found the repeat immediately and the
 * bar read as a picket fence rather than as fire.
 *
 * Positions are evenly spaced and then jittered by up to half a slot, so the
 * tongues cover the whole bar without ever landing on a grid.
 *
 * `seed` picks a different fire from the same hash. The bar draws two layers,
 * a slow body and the licks that rise off it, and sharing a seed would stack
 * them on identical tongues.
 */
export function flameTongues(count: number, seed = 0): FlameTongue[] {
  if (count <= 0) return [];

  const slot = 1 / count;
  // Far enough apart that two layers never land on the same tongues, which is
  // what gives the fire depth rather than one silhouette drawn twice.
  const salt = seed * 1013;

  return Array.from({ length: count }, (_, at) => {
    // Jitter within the slot, so tongues stay in order and still look placed
    // by chance rather than by a ruler.
    const x = (at + 0.5 + (noise(salt + at * 7 + 1) - 0.5) * 0.85) * slot;

    return {
      x: Math.min(Math.max(x, 0), 1),
      // Skewed a little short, so a few tongues stand clearly above the rest,
      // but not so far that half the fire is stubs and the crown looks like it
      // is dying out wherever the noise happened to run low.
      height: 0.38 + 0.62 * Math.pow(noise(salt + at * 13 + 5), 1.2),
      width: 0.035 + 0.055 * noise(salt + at * 29 + 3),
      lean: (noise(salt + at * 17 + 11) - 0.5) * 0.5,
      delay: noise(salt + at * 23 + 7) * 2,
      duration: 0.62 + noise(salt + at * 31 + 19) * 0.75,
    };
  });
}

/**
 * One tongue as an SVG path, in the coordinates of a `width` by `height` box.
 *
 * A leaf rather than a symmetric teardrop: both sides run from the base up to
 * a single point, and the point is offset by the tongue's lean, so no two
 * tongues in the fire are the same shape and none of them is a mirror of
 * itself. The turbulence filter in the component roughens the outline from
 * there; this only has to supply a believable silhouette underneath it.
 */
export function flamePath(tongue: FlameTongue, width: number, height: number): string {
  const round = (n: number) => Math.round(n * 100) / 100;

  const centre = tongue.x * width;
  const half = (tongue.width * width) / 2;
  const rise = tongue.height * height;
  const base = height;
  const tipY = base - rise;
  const tipX = centre + tongue.lean * rise;

  // Control points pull the sides in gradually, then hard toward the tip, so
  // the tongue is fat at the bottom and tapers rather than coming to a spike.
  return [
    `M ${round(centre - half)} ${round(base)}`,
    `C ${round(centre - half)} ${round(base - rise * 0.42)}`,
    `${round(tipX - half * 0.6)} ${round(base - rise * 0.72)}`,
    `${round(tipX)} ${round(tipY)}`,
    `C ${round(tipX + half * 0.6)} ${round(base - rise * 0.72)}`,
    `${round(centre + half)} ${round(base - rise * 0.42)}`,
    `${round(centre + half)} ${round(base)}`,
    "Z",
  ].join(" ");
}

/**
 * The fixed swatch a heat level is painted in, as a CSS custom property.
 *
 * The ramp is five quoted colours and not a gradient function, so that a level
 * is the same swatch on a product page, a receipt and a kitchen ticket. A
 * percent between two levels takes the swatch above it, because the owner can
 * type any 0 to 100 into the Workspace and the scale has to answer.
 *
 * Zero is off the ramp rather than the bottom of it. "No heat" means flavour
 * only, and painting it signage yellow would claim a little heat on an order
 * that asked for none.
 */
export function heatSwatch(percent: number): string {
  if (!Number.isFinite(percent) || percent <= 0) return "var(--color-nybb-graphite)";
  const step = Math.min(Math.ceil(percent / 20), 5);
  return `var(--color-nybb-heat-${step})`;
}

/**
 * How hard the flame draws, 0 to 1.
 *
 * The CSS multiplies lengths by this, so an out of range percent would throw a
 * flame clear across the section rather than fail visibly. Clamped here so the
 * stylesheet can trust it.
 */
export function flameIntensity(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(Math.max(percent, 0), 100) / 100;
}
