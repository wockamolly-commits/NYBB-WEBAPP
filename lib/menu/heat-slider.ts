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
export function noise(seed: number): number {
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
 * Where an untouched showcase parks its thumb.
 *
 * Partway up rather than at either end, so the bar arrives already lit and the
 * flame has something to do. A control that opens empty reads as broken rather
 * than as cold.
 */
export function restingIndex(stops: readonly HeatStop[]): number {
  if (stops.length === 0) return 0;
  return Math.floor((stops.length - 1) / 2);
}

/**
 * How long the scale waits before it starts moving.
 *
 * Almost nothing, and the small amount it is exists for one reason. The block
 * is fading up as this runs, and its ease is exponential, so it clears half
 * opacity inside about 130ms. Eighty puts the first move just inside that, so
 * the reader sees the bar start rather than finding it already underway.
 *
 * It was 700 for one day, to let the block land before the scale spoke. That
 * read as a wait: the reader had already looked at the scale and was waiting
 * for it to do the thing the copy beside it promised. Arriving in motion is
 * better than arriving and then performing.
 */
export const SWEEP_LEAD_MS = 80;

/** The longest the travel itself may take, however many stops there are. */
export const SWEEP_TRAVEL_MS = 600;

/** The gap between one stop and the next, before the cap above applies. */
export const SWEEP_STEP_MS = 240;

export type HeatSweepStep = {
  /** The stop to move to. */
  index: number;
  /** Milliseconds after the scale enters view. The first step is the lead. */
  at: number;
};

/**
 * The showcase playing itself once, as a schedule.
 *
 * THIS IS THE RULE THE SYSTEM RETIRED, PUT BACK ON PURPOSE.
 * ================================================================
 * The Moment Belongs To The Band Rule gave the section's arrival to the five
 * bars extending in sequence, and it was retired because an entrance plays to
 * nobody in particular and says what the bars already said standing still. The
 * owner asked for it back on 2026-09-21. What is kept from the retirement is
 * the part that was actually true: the moment belongs to the customer's hand.
 * So this is a demonstration that hands over, not a performance that owns the
 * section. It runs once, it never repeats, and the first sign of a hand on the
 * control cancels whatever is left of it.
 *
 * IT STEPS RATHER THAN SLIDING, AND THAT IS THE WHOLE POINT.
 * ================================================================
 * The scale's job is to say that heat is a thing you pick an amount of, so
 * what it has to show is the picking. Each step is a real stop: the readout
 * reads Lite, then Moderate, then Hot, exactly as it would under somebody's
 * thumb, and the meter's own spring carries the bar smoothly between them. A
 * single jump to the end would move the bar and never name what it passed.
 *
 * The travel is capped rather than fixed, so a longer ramp goes faster instead
 * of running longer. Five stops today is one gap of 240ms between two moves; a
 * forty stop ramp would put the same forty moves inside the same 600ms.
 * Nothing here plus the lead comes near the five seconds that WCAG 2.2.2 would
 * require a pause control for, and it cannot loop, because there is nothing to
 * loop.
 *
 * The first step is the lead itself rather than the lead plus a gap. The gap
 * belongs between moves; putting one in front of the first move is a wait, and
 * a wait in front of an introduction is the introduction not starting.
 */
export function heatSweepSteps(resting: number): HeatSweepStep[] {
  if (!Number.isFinite(resting)) return [];
  const last = Math.trunc(resting);
  if (last <= 0) return [];

  // Gaps, not moves: two moves have one gap between them. A single move has
  // none, which is also why this cannot divide by zero.
  const gaps = last - 1;
  const step = gaps > 0 ? Math.min(SWEEP_STEP_MS, SWEEP_TRAVEL_MS / gaps) : 0;

  return Array.from({ length: last }, (_, at) => ({
    index: at + 1,
    at: Math.round(SWEEP_LEAD_MS + at * step),
  }));
}
