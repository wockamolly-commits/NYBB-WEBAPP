import { describe, expect, it } from "vitest";
import {
  CHILI_COUNT,
  FLAME_BOX,
  FLAME_TEMPER,
  chiliCount,
  clampScore,
  flameFrames,
  flamePath,
  flameSplines,
  heatParticles,
  heatTier,
  hotnessLabel,
  particleBudget,
  rampGradient,
  stopCentre,
} from "@/lib/menu/hotness-meter";

/**
 * The arithmetic behind the hotness meter's picture.
 *
 * The meter is the drawing, not the control, so nothing here decides what gets
 * ordered. What it does decide is which of the five visual identities a score
 * gets, what a screen reader hears, and how much fire and how many embers the
 * browser is asked to animate, which is the part that has to stay bounded on a
 * low end phone.
 */

describe("clampScore", () => {
  it("keeps a score inside 0 to 100", () => {
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(140)).toBe(100);
    expect(clampScore(78)).toBe(78);
  });

  it("treats a score that is not a number as no heat rather than as a flame", () => {
    expect(clampScore(Number.NaN)).toBe(0);
    expect(clampScore(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("heatTier", () => {
  it("puts each level of the real scale in its own tier", () => {
    expect([20, 40, 60, 80, 100].map(heatTier)).toEqual([1, 2, 3, 4, 5]);
  });

  it("follows the bands in the brief, 0 to 20 through 81 to 100", () => {
    expect(heatTier(1)).toBe(1);
    expect(heatTier(21)).toBe(2);
    expect(heatTier(41)).toBe(3);
    expect(heatTier(61)).toBe(4);
    expect(heatTier(78)).toBe(4);
    expect(heatTier(81)).toBe(5);
  });

  it("gives zero its own tier, because No heat is not a small Lite", () => {
    expect(heatTier(0)).toBe(0);
  });
});

describe("chiliCount", () => {
  it("prints the owner's reference counts, Lite x1 through Insane x35", () => {
    expect([20, 40, 60, 80, 100].map(chiliCount)).toEqual([1, 5, 10, 20, 35]);
  });

  it("shows no chilies for No heat", () => {
    expect(chiliCount(0)).toBe(0);
    expect(CHILI_COUNT[0]).toBe(0);
  });

  it("follows the tier bands, not the exact percent", () => {
    expect(chiliCount(1)).toBe(1);
    expect(chiliCount(21)).toBe(5);
    expect(chiliCount(78)).toBe(20);
  });
});

describe("hotnessLabel", () => {
  it("names the level and the percent", () => {
    expect(hotnessLabel(78)).toBe("Hotness level: Wild, 78 percent");
  });

  it("reads zero as No heat", () => {
    expect(hotnessLabel(0)).toBe("Hotness level: No heat, 0 percent");
  });

  it("rounds and clamps what it reads out", () => {
    expect(hotnessLabel(64.6)).toBe("Hotness level: Wild, 65 percent");
    expect(hotnessLabel(250)).toBe("Hotness level: Insane, 100 percent");
  });
});

describe("particleBudget", () => {
  it("draws no particles below Hot", () => {
    for (const tier of [0, 1, 2] as const) {
      expect(particleBudget(tier, "large")).toBe(0);
    }
  });

  it("grows from Hot to Insane", () => {
    const counts = ([3, 4, 5] as const).map((tier) => particleBudget(tier, "large"));
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
  });

  it("never asks for more than twenty, at any size", () => {
    for (const size of ["small", "medium", "large"] as const) {
      expect(particleBudget(5, size)).toBeLessThanOrEqual(20);
    }
  });
});

describe("heatParticles", () => {
  it("draws the number asked for, the same way every time", () => {
    expect(heatParticles(12, 4)).toHaveLength(12);
    expect(heatParticles(12, 4)).toEqual(heatParticles(12, 4));
  });

  it("keeps every particle over the bar", () => {
    for (const particle of heatParticles(18, 5)) {
      expect(particle.x).toBeGreaterThanOrEqual(0);
      expect(particle.x).toBeLessThanOrEqual(1);
    }
  });

  it("throws sparks only at Insane", () => {
    expect(heatParticles(12, 4).some((p) => p.kind === "spark")).toBe(false);
    expect(heatParticles(18, 5).some((p) => p.kind === "spark")).toBe(true);
    expect(heatParticles(18, 5).some((p) => p.kind === "ember")).toBe(true);
  });
});

describe("rampGradient", () => {
  const five = [20, 40, 60, 80, 100].map((percent, at) => ({
    slug: `s${at}`,
    name: `S${at}`,
    percent,
  }));

  it("pins every level's own swatch at the centre of its stop", () => {
    const ramp = rampGradient(five);
    expect(ramp).toBe(
      "linear-gradient(to right, var(--color-nybb-heat-1) 10.000%, var(--color-nybb-heat-2) 30.000%, " +
        "var(--color-nybb-heat-3) 50.000%, var(--color-nybb-heat-4) 70.000%, var(--color-nybb-heat-5) 90.000%)",
    );
  });

  it("starts from graphite when the scale opens on No heat", () => {
    const ramp = rampGradient([{ slug: "none", name: "No heat", percent: 0 }, ...five]);
    expect(ramp.startsWith("linear-gradient(to right, var(--color-nybb-graphite) ")).toBe(true);
  });

  it("paints one stop solid, and nothing as graphite", () => {
    expect(rampGradient([five[2]])).toBe("var(--color-nybb-heat-3)");
    expect(rampGradient([])).toBe("var(--color-nybb-graphite)");
  });
});

describe("stopCentre", () => {
  it("rests the pointer over the middle of the chosen stop", () => {
    expect(stopCentre(0, 5)).toBeCloseTo(0.1);
    expect(stopCentre(2, 5)).toBeCloseTo(0.5);
    expect(stopCentre(4, 5)).toBeCloseTo(0.9);
  });

  it("clamps an index off the scale, and an empty scale to the start", () => {
    expect(stopCentre(9, 5)).toBeCloseTo(0.9);
    expect(stopCentre(-1, 5)).toBeCloseTo(0.1);
    expect(stopCentre(0, 0)).toBe(0);
  });
});

describe("the flame", () => {
  const commands = (path: string) => path.replace(/[^A-Za-z]/g, "");

  it("draws every pose with the same commands, so the morph flows instead of snapping", () => {
    for (const layer of ["outer", "body", "core"] as const) {
      const shapes = flameFrames(layer).map(commands);
      expect(new Set(shapes).size).toBe(1);
      expect(shapes[0]).toBe("MCCCCCZ");
    }
  });

  it("closes each loop on the pose it opened with", () => {
    for (const layer of ["outer", "body", "core"] as const) {
      const frames = flameFrames(layer);
      expect(frames.at(-1)).toBe(frames[0]);
    }
  });

  it("gives every step between poses its easing", () => {
    for (const layer of ["outer", "body", "core"] as const) {
      const steps = flameFrames(layer).length - 1;
      expect(flameSplines(layer).split(";")).toHaveLength(steps);
    }
  });

  it("stays inside its box, standing on the base", () => {
    for (const layer of ["outer", "body", "core"] as const) {
      for (const frame of flameFrames(layer)) {
        const numbers = frame.match(/-?\d+(\.\d+)?/g)!.map(Number);
        const xs = numbers.filter((_, at) => at % 2 === 0);
        const ys = numbers.filter((_, at) => at % 2 === 1);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...xs)).toBeLessThanOrEqual(FLAME_BOX.width);
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...ys)).toBe(FLAME_BOX.baseY);
      }
    }
  });

  it("nests the layers, the white hot core smallest and the envelope tallest", () => {
    const tip = (path: string) => Math.min(...path.match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, at) => at % 2 === 1));
    const [outer, body, core] = (["outer", "body", "core"] as const).map((layer) => tip(flameFrames(layer)[0]));
    expect(outer).toBeLessThan(body);
    expect(body).toBeLessThan(core);
  });

  it("rounds to a tenth, so the server and the browser write the same path", () => {
    const path = flamePath({ width: 30.123, height: 140.456, tipX: 50.789, sway: 1.234 });
    for (const value of path.match(/-?\d+(\.\d+)?/g)!) {
      expect(value.split(".")[1]?.length ?? 0).toBeLessThanOrEqual(1);
    }
  });
});

describe("flame temper", () => {
  it("burns faster and wilder at every level up", () => {
    for (let tier = 2; tier <= 5; tier++) {
      const here = FLAME_TEMPER[tier as 1 | 2 | 3 | 4 | 5];
      const below = FLAME_TEMPER[(tier - 1) as 1 | 2 | 3 | 4];
      expect(here.speed).toBeLessThan(below.speed);
      expect(here.wildness).toBeGreaterThan(below.wildness);
    }
  });

  it("holds a flame with no wildness perfectly still", () => {
    expect(new Set(flameFrames("outer", 0)).size).toBe(1);
  });

  it("swings the tip further the wilder the level", () => {
    const tipXs = (wildness: number) =>
      flameFrames("outer", wildness).map((frame) => {
        const numbers = frame.match(/-?\d+(\.\d+)?/g)!.map(Number);
        const ys = numbers.filter((_, at) => at % 2 === 1);
        const tip = ys.indexOf(Math.min(...ys));
        return numbers[tip * 2];
      });
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(spread(tipXs(FLAME_TEMPER[5].wildness))).toBeGreaterThan(spread(tipXs(FLAME_TEMPER[1].wildness)) * 3);
  });

  it("keeps even Insane's wildest pose inside the drawing", () => {
    for (const layer of ["outer", "body", "core"] as const) {
      for (const frame of flameFrames(layer, FLAME_TEMPER[5].wildness)) {
        const numbers = frame.match(/-?\d+(\.\d+)?/g)!.map(Number);
        expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...numbers.filter((_, at) => at % 2 === 0))).toBeLessThanOrEqual(FLAME_BOX.width);
      }
    }
  });
});
