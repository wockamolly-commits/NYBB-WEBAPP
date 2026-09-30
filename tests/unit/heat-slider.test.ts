import { describe, expect, it } from "vitest";
import {
  SWEEP_LEAD_MS,
  SWEEP_TRAVEL_MS,
  heatSliderState,
  heatStops,
  heatSwatch,
  heatSweepSteps,
  restingIndex,
  stopAt,
} from "@/lib/menu/heat-slider";
import type { MenuOption } from "@/lib/menu/types";

/**
 * The arithmetic behind the sliding heat bar.
 *
 * A slider is an index into a list, and the Level of Hotness group is the one
 * place in this menu where that is dangerous. The group is `minSelect: 0`, so
 * `defaultSelection` starts it empty, and "No heat" is a real option carrying
 * `heatPercent: 0`. Those are opposite answers: one writes no
 * `order_item_options` row at all, the other writes one with
 * `heat_percent_snapshot = 0` onto the kitchen ticket and into the analytics
 * heat mix.
 *
 * A thumb has to sit somewhere to be drawn, and the left end of the track is
 * "No heat". So the resolver below reports the position and whether that
 * position is a choice as two separate facts, and the control renders the
 * untouched state from the second one. See AGENTS.md rule 6.
 */

function option(
  slug: string,
  name: string,
  heatPercent?: number | null,
): MenuOption {
  return { slug, name, priceCents: null, variationPriceCents: {}, heatPercent };
}

/** The real group, deliberately out of order to prove the sort. */
const wingHeat: MenuOption[] = [
  option("hot", "Hot", 60),
  option("none", "No heat", 0),
  option("insane", "Insane", 100),
  option("lite", "Lite", 20),
  option("wild", "Wild", 80),
  option("moderate", "Moderate", 40),
];

describe("heatStops", () => {
  it("orders the stops by heat, coldest first", () => {
    expect(heatStops(wingHeat).map((stop) => stop.slug)).toEqual([
      "none",
      "lite",
      "moderate",
      "hot",
      "wild",
      "insane",
    ]);
  });

  it("keeps No heat, which is a heat level of zero percent", () => {
    expect(heatStops(wingHeat)[0]).toMatchObject({ slug: "none", percent: 0 });
  });

  it("drops an option that has no heat level at all", () => {
    // A flavour is not a stop on the scale. Null and undefined both mean the
    // option is not heat; neither means zero percent.
    const mixed = [option("lite", "Lite", 20), option("garlic", "Garlic", null), option("bbq", "BBQ")];
    expect(heatStops(mixed).map((stop) => stop.slug)).toEqual(["lite"]);
  });
});

describe("heatSliderState", () => {
  const stops = heatStops(wingHeat);

  it("reports nothing chosen when the group is empty", () => {
    // The untouched configurator. The thumb still needs somewhere to sit.
    const state = heatSliderState(stops, null);
    expect(state.chosen).toBe(false);
    expect(state.index).toBe(0);
  });

  it("reports No heat as a real choice at the same index", () => {
    // The regression this file exists for. Same thumb position as above,
    // opposite meaning: somebody picked "flavour only" on purpose.
    const state = heatSliderState(stops, "none");
    expect(state.chosen).toBe(true);
    expect(state.index).toBe(0);
    expect(state.stop?.percent).toBe(0);
  });

  it("finds the stop a slug names", () => {
    const state = heatSliderState(stops, "wild");
    expect(state.index).toBe(4);
    expect(state.stop).toMatchObject({ name: "Wild", percent: 80 });
  });

  it("treats a slug this group does not sell as nothing chosen", () => {
    // A hand-edited URL cannot park the thumb on an option that is not here.
    expect(heatSliderState(stops, "nuclear").chosen).toBe(false);
  });

  it("reports nothing chosen when there are no stops", () => {
    expect(heatSliderState([], "lite")).toMatchObject({ chosen: false, stop: null });
  });
});

describe("stopAt", () => {
  const stops = heatStops(wingHeat);

  it("returns the stop at an index", () => {
    expect(stopAt(stops, 2)?.slug).toBe("moderate");
  });

  it("clamps an index below the track to the coldest stop", () => {
    expect(stopAt(stops, -3)?.slug).toBe("none");
  });

  it("clamps an index past the track to the hottest stop", () => {
    expect(stopAt(stops, 99)?.slug).toBe("insane");
  });

  it("has nothing to return when there are no stops", () => {
    expect(stopAt([], 0)).toBeNull();
  });
});

describe("heatSwatch", () => {
  it("gives each level of the real scale its own fixed swatch", () => {
    // The whole point of the fixed ramp: a level is the same colour on a
    // product page, a receipt and a kitchen ticket. Five levels, five swatches,
    // no two sharing one.
    const swatches = [20, 40, 60, 80, 100].map(heatSwatch);
    expect(swatches).toEqual([
      "var(--color-nybb-heat-1)",
      "var(--color-nybb-heat-2)",
      "var(--color-nybb-heat-3)",
      "var(--color-nybb-heat-4)",
      "var(--color-nybb-heat-5)",
    ]);
    expect(new Set(swatches).size).toBe(5);
  });

  it("gives No heat the unlit fill rather than the coldest swatch", () => {
    // Zero percent is not the bottom of the ramp, it is off it. Painting it
    // signage yellow would say "a little heat" on an order that asked for none.
    expect(heatSwatch(0)).toBe("var(--color-nybb-graphite)");
  });

  it("never reaches past the top of the ramp", () => {
    expect(heatSwatch(100)).toBe("var(--color-nybb-heat-5)");
    expect(heatSwatch(140)).toBe("var(--color-nybb-heat-5)");
  });

  it("puts a percent between two levels on the swatch above it", () => {
    // The owner can type any 0 to 100 in the Workspace, so the scale has to
    // answer for 35% without falling off either end.
    expect(heatSwatch(21)).toBe("var(--color-nybb-heat-2)");
    expect(heatSwatch(35)).toBe("var(--color-nybb-heat-2)");
    expect(heatSwatch(1)).toBe("var(--color-nybb-heat-1)");
  });
});

/**
 * The showcase playing itself once.
 *
 * Two things have to hold whatever the ramp looks like. The travel is capped,
 * so adding stops makes the sweep faster rather than longer and it can never
 * drift toward the five seconds that would oblige us to ship a pause control.
 * And the schedule is empty whenever there is nothing to demonstrate, because
 * a scheduled step that lands on the stop the bar is already sitting on is a
 * timer that exists to do nothing.
 */
describe("heatSweepSteps", () => {
  it("names every stop between the opening one and the rest", () => {
    // Five stops rest on Hot, so the bar opens on Lite and is seen passing
    // Moderate. The readout reads all three in turn.
    expect(heatSweepSteps(2).map((step) => step.index)).toEqual([1, 2]);
  });

  it("starts at once, with no gap in front of the first move", () => {
    // The gap belongs between moves. In front of the first one it is a wait,
    // and a wait in front of an introduction is the introduction not starting.
    // This was 940ms for a day and read as lag.
    expect(heatSweepSteps(2)[0].at).toBe(SWEEP_LEAD_MS);
    expect(SWEEP_LEAD_MS).toBeLessThan(120);
  });

  it("finishes the travel inside the cap, however long the ramp is", () => {
    for (const resting of [1, 2, 4, 5, 11, 40]) {
      const steps = heatSweepSteps(resting);
      const travel = steps[steps.length - 1].at - SWEEP_LEAD_MS;

      expect(steps).toHaveLength(resting);
      expect(travel).toBeLessThanOrEqual(SWEEP_TRAVEL_MS);
    }
  });

  it("puts a single move at the lead and stops, with nothing to space", () => {
    expect(heatSweepSteps(1)).toEqual([{ index: 1, at: SWEEP_LEAD_MS }]);
  });

  it("is over well before the old schedule used to begin", () => {
    // The whole thing, lead and travel, inside the 940ms the first move alone
    // used to wait for.
    const steps = heatSweepSteps(2);

    expect(steps[steps.length - 1].at).toBeLessThan(940);
  });

  it("stays far short of the five seconds WCAG 2.2.2 asks a pause control for", () => {
    const steps = heatSweepSteps(40);

    expect(steps[steps.length - 1].at).toBeLessThan(2000);
  });

  it("only ever moves forward, one stop at a time", () => {
    const steps = heatSweepSteps(4);

    expect(steps.map((step) => step.index)).toEqual([1, 2, 3, 4]);
    for (let at = 1; at < steps.length; at++) {
      expect(steps[at].at).toBeGreaterThan(steps[at - 1].at);
    }
  });

  it("has nothing to do when the bar already rests where it opens", () => {
    // A one stop ramp, and the degenerate readings that would otherwise
    // schedule a timer to move the thumb somewhere that does not exist.
    for (const resting of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(heatSweepSteps(resting)).toEqual([]);
    }
  });
});

describe("restingIndex", () => {
  /** A ramp of `count` stops, evenly spaced, which is all this cares about. */
  const ramp = (count: number) =>
    heatStops(
      Array.from({ length: count }, (_, at) =>
        option(`s${at}`, `S${at}`, Math.round(((at + 1) / count) * 100)),
      ),
    );

  it("opens partway up rather than at either end", () => {
    // The landing page's own ramp: Lite, Moderate, Hot, Wild, Insane.
    expect(restingIndex(ramp(5))).toBe(2);
  });

  it("never indexes past the end, including when there is nothing", () => {
    expect(restingIndex([])).toBe(0);
    expect(restingIndex(ramp(1))).toBe(0);
    expect(restingIndex(ramp(2))).toBe(0);
  });

  it("agrees with the sweep about where the bar is going", () => {
    const resting = restingIndex(ramp(5));
    const steps = heatSweepSteps(resting);

    expect(steps[steps.length - 1].index).toBe(resting);
  });
});
