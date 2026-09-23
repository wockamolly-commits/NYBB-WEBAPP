/**
 * The arithmetic behind the page's scroll reveals.
 *
 * This lives in `lib/` rather than inside the client component for the reason
 * AGENTS.md section 6 gives about schemas: a value that only exists inside a
 * component is a value no unit test can reach, and the cap below is the whole
 * reason the reveals are allowed to exist at all. DESIGN.md's ban is on an
 * undifferentiated fade applied to every section in turn; what replaces it is
 * a list arriving as a list, and a list only reads as one wave if the last
 * item is not still waiting when the reader has finished looking.
 */

/** The gap between one item in a wave and the next. */
export const REVEAL_STEP_MS = 40;

/**
 * How many steps the wave is allowed to climb before it flattens.
 *
 * Seven, so the longest list on the landing page (ten flavours) finishes
 * starting inside 280ms and the nine branch rows inside the same. Without a
 * cap the tenth tile would begin 360ms after the first and the twentieth on
 * some future grid would begin at 760ms, which is no longer a stagger, it is
 * a queue the reader is standing in.
 */
export const REVEAL_MAX_STEPS = 7;

/**
 * The delay carried by the item at `index` within its wave.
 *
 * Guards a non-finite or negative index rather than trusting the caller,
 * because the result is written straight into a CSS custom property and
 * `--reveal-delay: NaNms` is an invalid declaration that the browser drops
 * silently, taking the transition's delay with it.
 */
export function revealDelayMs(index: number): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  return Math.min(Math.trunc(index), REVEAL_MAX_STEPS) * REVEAL_STEP_MS;
}

/**
 * How much of the viewport a group has to be above before it counts as
 * already seen.
 */
export const REVEAL_SEEN_FRACTION = 0.92;

/**
 * Whether a group was already on screen when the script came up.
 *
 * An entrance that plays to somebody who is already looking at the finished
 * thing is the exact failure DESIGN.md records against the old heat band
 * animation: it says what the content already said standing still. So a group
 * that is in view at mount is never hidden in the first place, which also
 * means there is no frame in which it could flash.
 *
 * `top` is the group's viewport-relative top edge. A negative one is a group
 * scrolled past, which is seen by definition.
 */
export function isAlreadySeen(top: number, viewportHeight: number): boolean {
  return top < viewportHeight * REVEAL_SEEN_FRACTION;
}
