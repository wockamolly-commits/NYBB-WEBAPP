import { describe, expect, it } from "vitest";
import {
  REVEAL_MAX_STEPS,
  REVEAL_SEEN_FRACTION,
  REVEAL_STEP_MS,
  isAlreadySeen,
  revealDelayMs,
} from "@/lib/site/reveal";

/**
 * The scroll reveal arithmetic.
 *
 * Two facts are worth holding here. The cap is what keeps a stagger a stagger
 * rather than a queue, and it has to hold for a list longer than any list on
 * the page today, because the next grid somebody adds will not come back to
 * read this file. And the delay is written into a CSS custom property, so a
 * value that is not a finite number does not throw, it produces an invalid
 * declaration the browser drops, taking the whole transition delay with it and
 * collapsing the wave into one flat arrival that looks like a bug nobody can
 * reproduce.
 */
describe("revealDelayMs", () => {
  it("gives the first item no delay", () => {
    expect(revealDelayMs(0)).toBe(0);
  });

  it("steps each following item by one interval", () => {
    expect(revealDelayMs(1)).toBe(REVEAL_STEP_MS);
    expect(revealDelayMs(3)).toBe(3 * REVEAL_STEP_MS);
  });

  it("flattens at the cap so a long list still arrives as one wave", () => {
    const capped = REVEAL_MAX_STEPS * REVEAL_STEP_MS;

    expect(revealDelayMs(REVEAL_MAX_STEPS)).toBe(capped);
    // The tenth flavour tile and the ninth branch row, both real today.
    expect(revealDelayMs(9)).toBe(capped);
    // And a grid nobody has written yet.
    expect(revealDelayMs(240)).toBe(capped);
  });

  it("keeps the whole wave inside a third of a second", () => {
    expect(revealDelayMs(Number.MAX_SAFE_INTEGER)).toBeLessThanOrEqual(320);
  });

  it("returns a real number for indexes that are not ones", () => {
    // Every one of these would otherwise reach CSS as `NaNms` or a negative
    // delay, and a delay CSS cannot parse is a transition with no delay.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, -12]) {
      expect(Number.isFinite(revealDelayMs(bad))).toBe(true);
      expect(revealDelayMs(bad)).toBeGreaterThanOrEqual(0);
    }
  });

  it("does not hand CSS a fractional millisecond", () => {
    expect(revealDelayMs(2.7)).toBe(2 * REVEAL_STEP_MS);
    expect(Number.isInteger(revealDelayMs(2.7))).toBe(true);
  });
});

describe("isAlreadySeen", () => {
  const viewport = 800;

  it("counts a group scrolled past as seen", () => {
    expect(isAlreadySeen(-400, viewport)).toBe(true);
  });

  it("counts a group standing in the viewport as seen", () => {
    expect(isAlreadySeen(120, viewport)).toBe(true);
  });

  it("does not count a group below the fold as seen", () => {
    expect(isAlreadySeen(viewport + 1, viewport)).toBe(false);
  });

  it("leaves a sliver at the bottom edge unseen, so it still gets to arrive", () => {
    // A tile whose first few pixels are showing has not been read, and
    // revealing it in place would mean the reader never sees it move.
    const sliver = viewport * REVEAL_SEEN_FRACTION + 1;

    expect(isAlreadySeen(sliver, viewport)).toBe(false);
  });
});
