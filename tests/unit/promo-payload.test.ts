import { describe, expect, it } from "vitest";
import { promoPayload } from "@/lib/push/payload";

/**
 * What a promo looks like on a lock screen.
 *
 * Two of these matter more than the words. `kind` has to be "promo", because
 * `public/sw.js` keys its unreadable-payload fallback on the audience and the
 * kind together, and without the kind a promo would inherit "Your order has an
 * update" and send somebody hunting for an order they never placed. And the
 * tag has to be prefixed, because tags are one flat namespace shared with
 * order notifications and a bare code could collide with a short code.
 */

const base = {
  code: "LAUNCH50",
  description: null,
  sentence: "₱50.00 off, on the whole order.",
};

describe("the promo notification", () => {
  it("is marked as a promo, not as an order", () => {
    expect(promoPayload(base).kind).toBe("promo");
  });

  it("is addressed to a customer", () => {
    // Who it goes to and what it is about are two different questions, and
    // `audience` still answers the first one. It has to keep matching the
    // push_subscriptions.audience column, which knows nothing about promos.
    expect(promoPayload(base).audience).toBe("customer");
  });

  it("names the code in the title, because that is what gets typed", () => {
    expect(promoPayload(base).title).toContain("LAUNCH50");
  });

  it("falls back to the generated sentence when nobody wrote a description", () => {
    expect(promoPayload(base).body).toBe("₱50.00 off, on the whole order.");
  });

  it("prefers the owner's own words when there are some", () => {
    // The description is written for a customer; the sentence is written for
    // correctness. Both are true, and the human one reads better on a phone.
    expect(
      promoPayload({ ...base, description: "Fifty off, this week only." }).body,
    ).toBe("Fifty off, this week only.");
  });

  it("opens the promos page", () => {
    expect(promoPayload(base).url).toBe("/promos");
  });

  it("cannot collide with an order's notification", () => {
    // A short code and a promo code live in the same tag namespace, and an
    // untagged collision would replace an order alert on the lock screen.
    expect(promoPayload(base).tag).toBe("promo-LAUNCH50");
    expect(promoPayload(base).tag).not.toBe(base.code);
  });

  it("is quiet, because an advert has not earned a buzz", () => {
    // An order being ready is something to act on and is allowed to interrupt.
    // A marketing message that survives a swipe is the fastest way to lose the
    // permission it was sent under.
    const payload = promoPayload(base);
    expect(payload.requireInteraction).toBe(false);
    expect(payload.renotify).toBe(false);
    expect(payload.vibrate).toBeNull();
  });
});
