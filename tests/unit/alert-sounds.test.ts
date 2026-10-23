import { describe, expect, it } from "vitest";
import {
  CLAP_LENGTH,
  NEW_ORDER_CLAPS,
  NEW_ORDER_FANFARE,
  NEW_ORDER_INTERVAL_MS,
  READY_ALARM,
} from "@/lib/orders/alert-sounds";

describe("the counter's new order alarm", () => {
  const fanfareEnd = Math.max(...NEW_ORDER_FANFARE.map((note) => note.at + note.duration));
  const burstEnd = Math.max(fanfareEnd, ...NEW_ORDER_CLAPS.map((at) => at + CLAP_LENGTH));

  it("finishes each burst before the next one starts, with a breath between", () => {
    // Overlapping bursts would smear the charge into a wall of sound, and the
    // gap is what makes a repeat read as "still waiting".
    expect(burstEnd * 1000).toBeLessThan(NEW_ORDER_INTERVAL_MS - 400);
  });

  it("plays its notes and claps in order without stepping on each other", () => {
    for (let i = 1; i < NEW_ORDER_FANFARE.length; i++) {
      const previous = NEW_ORDER_FANFARE[i - 1];
      expect(NEW_ORDER_FANFARE[i].at).toBeGreaterThanOrEqual(previous.at + previous.duration);
    }
    for (let i = 1; i < NEW_ORDER_CLAPS.length; i++) {
      expect(NEW_ORDER_CLAPS[i]).toBeGreaterThanOrEqual(NEW_ORDER_CLAPS[i - 1] + CLAP_LENGTH);
    }
    // The crowd answers the organ; it does not talk over it.
    expect(NEW_ORDER_CLAPS[0]).toBeGreaterThan(fanfareEnd);
  });

  it("is a different tune from the customer's ready alarm", () => {
    const tune = (notes: ReadonlyArray<{ freq: number }>) => notes.map((note) => Math.round(note.freq)).join(",");
    expect(tune(NEW_ORDER_FANFARE)).not.toBe(tune(READY_ALARM));
  });
});
