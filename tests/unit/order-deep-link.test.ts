import { describe, expect, it } from "vitest";
import { customerPayload } from "@/lib/push/payload";

/**
 * The tap, on the phone's side of it.
 *
 * `lib/push/payload.ts` writes one string into `data.url` and the app takes the
 * order it opens from that string alone. The two live in different projects,
 * one of which ships through an app store, so nothing but a test holds them to
 * the same shape. The tests below feed the real payload builder's output to the
 * real parser rather than a hand-written URL, which is what makes an edit to
 * either side fail here instead of on a stranger's lock screen.
 *
 * WHAT THIS DOES NOT PROVE.
 * ================================================================
 * That tapping the notification moves the screen to that order. The navigation
 * lives in `apps/customer/App.tsx` and there is no React Native test runner in
 * this repository, so it is verified on a device per
 * `docs/push-device-test-checklist.md`, not here.
 */

const parseOrderDeepLink = async () =>
  (await import("../../apps/customer/src/push/deep-link")).parseOrderDeepLink;

const order = {
  shortCode: "NY-ABC234",
  trackingToken: "11111111-1111-4111-8111-111111111111",
  status: "ready" as const,
  timeline: { rejectedReason: null, cancelledReason: null },
  payment: { method: "qrph", status: "paid" },
};

describe("the order a tapped notification names", () => {
  it("is the one the server put in the payload", async () => {
    const parse = await parseOrderDeepLink();
    expect(parse(customerPayload(order).url)).toEqual({
      shortCode: order.shortCode,
      trackingToken: order.trackingToken,
    });
  });

  it("is the tapped order, not the one already on screen", async () => {
    const parse = await parseOrderDeepLink();
    const other = { ...order, shortCode: "NY-XYZ789", trackingToken: "22222222-2222-4222-8222-222222222222" };

    const onScreen = parse(customerPayload(order).url);
    const tapped = parse(customerPayload(other).url);

    // The whole point of the deep link. A parser that answered with the short
    // code it saw last would pass every other test in this file.
    expect(tapped).not.toEqual(onScreen);
    expect(tapped?.shortCode).toBe("NY-XYZ789");
    expect(tapped?.trackingToken).toBe(other.trackingToken);
  });

  it("refuses a URL no notification of ours produced", async () => {
    const parse = await parseOrderDeepLink();
    expect(parse("/order/NY-ABC234")).toBeNull();
    expect(parse("/orders/NY-ABC234?t=abc")).toBeNull();
    expect(parse("https://example.com/order/NY-ABC234?t=abc")).toBeNull();
    expect(parse("/order/?t=abc")).toBeNull();
    expect(parse("/order/NY-ABC234?t=")).toBeNull();
    expect(parse("")).toBeNull();
  });

  it("returns null rather than throwing on a percent sequence that is not one", async () => {
    const parse = await parseOrderDeepLink();
    // `decodeURIComponent` raises URIError on this, and the call site is a
    // notification listener with no catch around it. A malformed link should
    // cost the customer a notification, not the app they just opened.
    expect(parse("/order/NY-ABC234?t=%zz")).toBeNull();
    expect(parse("/order/%zz?t=abc")).toBeNull();
  });
});
