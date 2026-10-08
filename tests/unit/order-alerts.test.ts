import { describe, expect, it } from "vitest";
import {
  ringKey,
  shouldRingReady,
  soundStage,
  stageToAnnounce,
  type ReadyAlarmOrder,
} from "@/lib/orders/order-alerts";
import { customerReadyRingPayload } from "@/lib/push/payload";

const READY: ReadyAlarmOrder = {
  status: "ready",
  readyAcknowledgedAt: null,
  readyRingAt: null,
  customerArrivedAt: null,
};

describe("soundStage", () => {
  it("hears accept and start as one cooking step", () => {
    expect(soundStage("accepted")).toBe("cooking");
    expect(soundStage("preparing")).toBe("cooking");
  });

  it("hears every way an order can stop as one step", () => {
    expect(soundStage("rejected")).toBe("stopped");
    expect(soundStage("cancelled")).toBe("stopped");
    expect(soundStage("no_show")).toBe("stopped");
  });
});

describe("stageToAnnounce", () => {
  it("stays quiet the first time a phone sees an order", () => {
    expect(stageToAnnounce(null, "cooking")).toBeNull();
    expect(stageToAnnounce(null, "ready")).toBeNull();
  });

  it("stays quiet when nothing moved", () => {
    expect(stageToAnnounce("cooking", "cooking")).toBeNull();
  });

  it("announces cooking, ready, collected and a refusal", () => {
    expect(stageToAnnounce("received", "cooking")).toBe("cooking");
    expect(stageToAnnounce("cooking", "ready")).toBe("ready");
    expect(stageToAnnounce("ready", "collected")).toBe("collected");
    expect(stageToAnnounce("received", "stopped")).toBe("stopped");
  });

  it("never announces received", () => {
    expect(stageToAnnounce("cooking", "received")).toBeNull();
  });
});

describe("shouldRingReady", () => {
  it("rings a ready order nobody has answered", () => {
    expect(shouldRingReady(READY)).toBe(true);
  });

  it("does not ring before ready or after collection", () => {
    expect(shouldRingReady({ ...READY, status: "preparing" })).toBe(false);
    expect(shouldRingReady({ ...READY, status: "claimed" })).toBe(false);
  });

  it("stops once the customer taps I'm coming", () => {
    expect(shouldRingReady({ ...READY, readyAcknowledgedAt: "2026-10-08T08:00:00Z" })).toBe(false);
  });

  it("stops once the customer says they are here", () => {
    expect(shouldRingReady({ ...READY, customerArrivedAt: "2026-10-08T08:00:00Z" })).toBe(false);
  });

  it("rings a customer who is here when the counter rings after they arrived", () => {
    expect(
      shouldRingReady({
        ...READY,
        customerArrivedAt: "2026-10-08T08:00:00Z",
        readyRingAt: "2026-10-08T08:05:00Z",
      }),
    ).toBe(true);
    expect(
      shouldRingReady({
        ...READY,
        customerArrivedAt: "2026-10-08T08:05:00Z",
        readyRingAt: "2026-10-08T08:00:00Z",
      }),
    ).toBe(false);
  });
});

describe("ringKey", () => {
  it("gives each ring from the counter its own name", () => {
    expect(ringKey(READY)).toBe("first");
    expect(ringKey({ readyRingAt: "2026-10-08T08:05:00Z" })).not.toBe(ringKey(READY));
  });
});

describe("customerReadyRingPayload", () => {
  const payload = customerReadyRingPayload({
    shortCode: "NY-RING01",
    trackingToken: "85000000-0000-4000-8000-000000000010",
    status: "ready",
    timeline: {
      acceptedAt: null,
      preparingAt: null,
      readyAt: "2026-10-08T08:00:00Z",
      claimedAt: null,
      rejectedAt: null,
      rejectedReason: null,
      cancelledAt: null,
      cancelledReason: null,
      customerArrivedAt: null,
      noShowAt: null,
    },
    payment: null,
  });

  it("replaces the ready notification and makes a sound doing it", () => {
    expect(payload.tag).toBe("NY-RING01");
    expect(payload.renotify).toBe(true);
    expect(payload.requireInteraction).toBe(true);
  });

  it("opens the tracking page with its token", () => {
    expect(payload.url).toBe("/order/NY-RING01?t=85000000-0000-4000-8000-000000000010");
  });
});
