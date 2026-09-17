import { describe, expect, it } from "vitest";
import {
  flameIntensity,
  flamePath,
  flameTongues,
  heatSliderState,
  heatStops,
  heatSwatch,
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

describe("flameTongues", () => {
  it("draws the number of tongues asked for", () => {
    expect(flameTongues(9)).toHaveLength(9);
    expect(flameTongues(22)).toHaveLength(22);
  });

  it("gives the same fire every time it is called", () => {
    // The bar is server rendered and hydrated, so a fire drawn from
    // Math.random() would differ between the two passes and React would report
    // a hydration mismatch.
    expect(flameTongues(22)).toEqual(flameTongues(22));
  });

  it("spreads the tongues along the whole bar, in order", () => {
    const xs = flameTongues(12).map((tongue) => tongue.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1);
    // Actually reaching both ends, rather than huddling in the middle.
    expect(Math.min(...xs)).toBeLessThan(0.12);
    expect(Math.max(...xs)).toBeGreaterThan(0.88);
  });

  it("keeps every tongue inside the height the bar reserves for it", () => {
    // Height is a share of --flame-height, which is what sets the padding
    // above the track. Over 1 and the tip is clipped mid flame.
    for (const tongue of flameTongues(22)) {
      expect(tongue.height).toBeGreaterThan(0);
      expect(tongue.height).toBeLessThanOrEqual(1);
    }
  });

  it("makes no two tongues alike", () => {
    // The old fire repeated a pattern of eight and read as a picket fence.
    const tongues = flameTongues(22);
    expect(new Set(tongues.map((t) => t.height)).size).toBeGreaterThan(12);
    expect(new Set(tongues.map((t) => t.width)).size).toBeGreaterThan(12);
  });

  it("leans tongues both ways, because fire does not all lean one way", () => {
    const leans = flameTongues(22).map((tongue) => tongue.lean);
    expect(leans.some((lean) => lean < 0)).toBe(true);
    expect(leans.some((lean) => lean > 0)).toBe(true);
  });

  it("varies the durations, so the tongues never beat in unison", () => {
    const tongues = flameTongues(22);
    expect(new Set(tongues.map((t) => t.duration)).size).toBeGreaterThan(8);
    for (const tongue of tongues) expect(tongue.duration).toBeGreaterThan(0);
  });

  it("has nothing to draw for a count of none", () => {
    expect(flameTongues(0)).toEqual([]);
  });

  it("draws a different fire for a different seed", () => {
    // The fire is two layers, a slow body and the licks that rise off it.
    // Drawn from one seed they would sit on exactly the same tongues and the
    // depth between the layers would collapse.
    const body = flameTongues(14, 0);
    const licks = flameTongues(14, 1);
    expect(licks).not.toEqual(body);
    expect(licks.map((t) => t.x)).not.toEqual(body.map((t) => t.x));
  });

  it("keeps a seeded fire deterministic too", () => {
    expect(flameTongues(14, 3)).toEqual(flameTongues(14, 3));
  });

  it("keeps every seed inside the reserved height", () => {
    for (const seed of [0, 1, 2, 3, 9]) {
      for (const tongue of flameTongues(16, seed)) {
        expect(tongue.height).toBeGreaterThan(0);
        expect(tongue.height).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("flamePath", () => {
  const tongue = flameTongues(9)[4];

  it("draws a closed shape", () => {
    const d = flamePath(tongue, 1000, 200);
    expect(d.startsWith("M")).toBe(true);
    expect(d.trimEnd().endsWith("Z")).toBe(true);
  });

  it("never emits a NaN", () => {
    // A single NaN anywhere in a path makes the whole thing render nothing,
    // silently. No error, no warning, just no flame.
    for (const t of flameTongues(22)) {
      expect(flamePath(t, 1000, 200)).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it("puts the tip at the tongue's own height above the base", () => {
    const d = flamePath({ ...tongue, height: 0.5, lean: 0, x: 0.5 }, 1000, 200);
    // Base line is the bottom of the box, so a half height tongue tips at 100.
    expect(d).toContain("100");
  });

  it("stands every tongue on the base line", () => {
    // Both ends of the outline sit on the bottom edge. A tongue that starts
    // above it floats off the bar.
    const d = flamePath(tongue, 1000, 200);
    const first = d.match(/^M\s*(-?[\d.]+)\s+(-?[\d.]+)/);
    expect(Number(first?.[2])).toBe(200);
  });
});

describe("flameIntensity", () => {
  it("gives No heat no flame", () => {
    expect(flameIntensity(0)).toBe(0);
  });

  it("gives the top of the scale a full flame", () => {
    expect(flameIntensity(100)).toBe(1);
  });

  it("climbs with the heat", () => {
    expect(flameIntensity(20)).toBeLessThan(flameIntensity(60));
    expect(flameIntensity(60)).toBeLessThan(flameIntensity(100));
  });

  it("refuses to draw a flame taller than the scale allows", () => {
    // Nothing should be able to feed this a percent off the scale, but the
    // CSS reads the result as a multiplier and a stray 400 would throw a
    // flame across the section.
    expect(flameIntensity(140)).toBe(1);
    expect(flameIntensity(-40)).toBe(0);
  });
});
