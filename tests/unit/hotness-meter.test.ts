import { describe, expect, it } from "vitest";
import {
  clampScore,
  flameBudget,
  heatParticles,
  heatTier,
  hotnessLabel,
  particleBudget,
  tongueTierMin,
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

describe("tongueTierMin", () => {
  const visible = (layer: "body" | "lick", count: number, tier: number) =>
    Array.from({ length: count }, (_, at) => tongueTierMin(layer, at, count)).filter(
      (min) => min <= tier,
    ).length;

  it("lights nothing at No heat", () => {
    expect(visible("body", 14, 0)).toBe(0);
    expect(visible("lick", 20, 0)).toBe(0);
  });

  it("lights every tongue at Insane", () => {
    expect(visible("body", 14, 5)).toBe(14);
    expect(visible("lick", 20, 5)).toBe(20);
  });

  it("never puts out a tongue as the heat goes up", () => {
    for (const layer of ["body", "lick"] as const) {
      let last = 0;
      for (let tier = 0; tier <= 5; tier++) {
        const now = visible(layer, 20, tier);
        expect(now).toBeGreaterThanOrEqual(last);
        last = now;
      }
    }
  });

  it("keeps the licks off Lite, which is a low bed of flame and nothing taller", () => {
    expect(visible("body", 14, 1)).toBeGreaterThan(0);
    expect(visible("lick", 20, 1)).toBe(0);
  });

  it("spreads the lit tongues along the bar rather than bunching them at one end", () => {
    const count = 20;
    const lit = Array.from({ length: count }, (_, at) => at).filter(
      (at) => tongueTierMin("lick", at, count) <= 2,
    );
    expect(lit.some((at) => at < count / 2)).toBe(true);
    expect(lit.some((at) => at >= count / 2)).toBe(true);
  });
});

describe("flameBudget", () => {
  it("draws a denser fire the larger the meter", () => {
    const small = flameBudget("small");
    const large = flameBudget("large");
    expect(large.body + large.lick).toBeGreaterThan(small.body + small.lick);
  });
});
