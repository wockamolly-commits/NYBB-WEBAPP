import { describe, expect, it } from "vitest";
import { checkoutFailure } from "@/lib/checkout/messages";
import {
  CHECKOUT_ATTEMPT_PATTERN,
  placeOrderInputSchema,
  placedOrderSchema,
  toPlaceOrderPayload,
} from "@/lib/checkout/schema";
import type { PlaceOrderInput } from "@/lib/checkout/types";

/**
 * The checkout boundary, on the TypeScript side.
 *
 * Two claims are worth testing here and nothing else is. The first is that a
 * price cannot leave the browser even if somebody puts one in the object,
 * because that is the rule the whole pricing design rests on. The second is
 * that every code `place_order` can raise turns into a sentence a customer can
 * act on, since a raw `OPTION_COUNT:Flavour` on a checkout screen is indis-
 * tinguishable from the site being broken.
 */

const VALID: PlaceOrderInput = {
  attemptId: "6f1b4f7c-1f6a-4e37-9f0e-9b0c2b3f5a11",
  branchSlug: "garden-bloc",
  pickupSlotStart: "2026-08-06T11:00:00+00:00",
  details: { name: "Steven Cruz", phone: "0906 440 5297", email: "", notes: "" },
  lines: [
    {
      itemSlug: "chicken-wings",
      variationSlug: "full",
      quantity: 2,
      options: [
        { groupSlug: "wing-flavour", optionSlug: "classic-buffalo" },
        { groupSlug: "level-of-hotness", optionSlug: "insane" },
      ],
    },
  ],
};

describe("the checkout attempt id", () => {
  it("accepts what the browser actually mints", () => {
    // Not a theoretical check. If this pattern and crypto.randomUUID ever
    // disagree, every order is refused before it reaches the database.
    for (let i = 0; i < 20; i += 1) {
      expect(crypto.randomUUID()).toMatch(CHECKOUT_ATTEMPT_PATTERN);
    }
  });

  it("refuses anything that is merely uuid shaped", () => {
    // The idempotency ledger is keyed on this, so a loose string would let a
    // caller collide with somebody else's attempt on purpose.
    for (const bad of [
      "not-a-uuid",
      "6f1b4f7c1f6a4e379f0e9b0c2b3f5a11",
      "6f1b4f7c-1f6a-0e37-9f0e-9b0c2b3f5a11",
      "6f1b4f7c-1f6a-4e37-ff0e-9b0c2b3f5a11",
      "",
    ]) {
      expect(bad).not.toMatch(CHECKOUT_ATTEMPT_PATTERN);
      expect(placeOrderInputSchema.safeParse({ ...VALID, attemptId: bad }).success).toBe(false);
    }
  });
});

describe("what leaves the browser", () => {
  it("carries no price, even when one is handed to it", () => {
    // The rule from spec section 22 item 4, checked rather than trusted. zod
    // strips what the schema does not name, so a client that decides to send a
    // unit price finds it has sent slugs and a quantity.
    const smuggled = {
      ...VALID,
      totalCents: 1,
      lines: [{ ...VALID.lines[0], unitPriceCents: 1, priceCents: 1 }],
    };

    const parsed = placeOrderInputSchema.parse(smuggled);
    const payload = JSON.stringify(toPlaceOrderPayload(parsed));

    expect(payload).not.toMatch(/cents/i);
    expect(payload).not.toMatch(/price/i);
    expect(payload).not.toMatch(/total/i);
    expect(payload).not.toMatch(/discount/i);
  });

  it("names the item, the size, the options and how many", () => {
    const payload = toPlaceOrderPayload(placeOrderInputSchema.parse(VALID));
    expect(payload.lines).toEqual([
      {
        item_slug: "chicken-wings",
        variation_slug: "full",
        qty: 2,
        options: [
          { group_slug: "wing-flavour", option_slug: "classic-buffalo" },
          { group_slug: "level-of-hotness", option_slug: "insane" },
        ],
      },
    ]);
  });

  it("pins the payment method rather than asking the caller for one", () => {
    // Counter is the only rail the business runs. place_order refuses the rest
    // while paymongo_enabled is false; this makes sure the question is never
    // asked in the first place.
    const payload = toPlaceOrderPayload(
      placeOrderInputSchema.parse({ ...VALID, paymentMethod: "gcash" }),
    );
    expect(payload.payment_method).toBe("counter");
  });

  it("sends an omitted email and note as null rather than as an empty string", () => {
    const payload = toPlaceOrderPayload(placeOrderInputSchema.parse(VALID));
    expect(payload.customer_email).toBeNull();
    expect(payload.notes).toBeNull();
  });

  it("trims what a customer typed, so a stray space is not a name", () => {
    const parsed = placeOrderInputSchema.parse({
      ...VALID,
      details: { ...VALID.details, name: "  Steven Cruz  ", email: " a@b.co " },
    });
    expect(parsed.details.name).toBe("Steven Cruz");
    expect(toPlaceOrderPayload(parsed).customer_email).toBe("a@b.co");
  });

  it("refuses a blank name or number with words the screen can show", () => {
    const blank = placeOrderInputSchema.safeParse({
      ...VALID,
      details: { ...VALID.details, name: "   " },
    });
    expect(blank.success).toBe(false);
    expect(blank.error?.issues[0].message).toMatch(/who to hand the order to/);
  });

  it("refuses a quantity the cart screen would have clamped", () => {
    expect(
      placeOrderInputSchema.safeParse({
        ...VALID,
        lines: [{ ...VALID.lines[0], quantity: 21 }],
      }).success,
    ).toBe(false);
    expect(
      placeOrderInputSchema.safeParse({ ...VALID, lines: [{ ...VALID.lines[0], quantity: 0 }] })
        .success,
    ).toBe(false);
  });

  it("refuses an empty cart and anything that is not a slug", () => {
    expect(placeOrderInputSchema.safeParse({ ...VALID, lines: [] }).success).toBe(false);
    expect(
      placeOrderInputSchema.safeParse({
        ...VALID,
        lines: [{ ...VALID.lines[0], itemSlug: "chicken wings; drop table" }],
      }).success,
    ).toBe(false);
  });

  it("accepts a pickup minute in the shape Postgres hands back", () => {
    // get_pickup_slots serialises timestamptz with a real offset, and the
    // browser sends that value back untouched, so the schema has to take it.
    for (const instant of [
      "2026-08-06T11:00:00+00:00",
      "2026-08-06T19:00:00+08:00",
      "2026-08-06T11:00:00.000Z",
    ]) {
      expect(
        placeOrderInputSchema.safeParse({ ...VALID, pickupSlotStart: instant }).success,
      ).toBe(true);
    }
    expect(
      placeOrderInputSchema.safeParse({ ...VALID, pickupSlotStart: "7:15pm" }).success,
    ).toBe(false);
  });
});

describe("what comes back", () => {
  const placed = {
    orderId: "0f1b4f7c-1f6a-4e37-9f0e-9b0c2b3f5a11",
    shortCode: "NY-ABC234",
    trackingToken: "1f1b4f7c-1f6a-4e37-9f0e-9b0c2b3f5a11",
    pickupCode: "0417",
    status: "pending",
    paymentMethod: "counter",
    pickupSlotStart: "2026-08-06T11:00:00+00:00",
    pickupSlotEnd: "2026-08-06T11:15:00+00:00",
    subtotalCents: 117800,
    discountCents: 0,
    totalCents: 117800,
    branch: { slug: "pilot", name: "Pilot Branch", shortName: "Pilot", timezone: "Asia/Manila" },
  };

  it("is parsed rather than trusted", () => {
    expect(placedOrderSchema.parse(placed)).toMatchObject({ shortCode: "NY-ABC234" });
  });

  it("refuses a result missing the codes the customer needs", () => {
    // A deployed function that has drifted from the code calling it, caught at
    // the parse instead of by a customer holding a pickup code of undefined.
    expect(placedOrderSchema.safeParse({ ...placed, pickupCode: "41" }).success).toBe(false);
    expect(placedOrderSchema.safeParse({ ...placed, trackingToken: "" }).success).toBe(false);
  });
});

describe("turning a refusal into something to do next", () => {
  it("tells a customer whose window filled to pick another, and reloads the grid", () => {
    const failure = checkoutFailure("SLOT_FULL");
    expect(failure.error).toMatch(/choose another time/i);
    expect(failure.field).toBe("slot");
    expect(failure.staleSlots).toBe(true);
  });

  it("does not blame the customer for a shop that closed under them", () => {
    const failure = checkoutFailure("STORE_CLOSED");
    expect(failure.error).toMatch(/cart is saved/i);
    expect(failure.staleSlots).toBe(true);
  });

  it("points a field error at its own field", () => {
    expect(checkoutFailure("MISSING_NAME").field).toBe("name");
    expect(checkoutFailure("INVALID_PHONE").field).toBe("phone");
    expect(checkoutFailure("INVALID_EMAIL").field).toBe("email");
  });

  it("uses the detail the database sent, when there is one worth reading", () => {
    expect(checkoutFailure("OPTION_COUNT:Flavour").error).toMatch(/under Flavour/);
    expect(checkoutFailure("INVALID_QTY:Chicken Wings").error).toMatch(/more Chicken Wings/);
    // And copes when there is not, rather than printing "undefined".
    expect(checkoutFailure("OPTION_COUNT").error).not.toMatch(/undefined/);
    expect(checkoutFailure("OPTION_COUNT:").error).not.toMatch(/undefined/);
  });

  it("sends a stale cart to the screen that can explain itself", () => {
    for (const code of ["ITEM_UNAVAILABLE:ribs-spicy", "VARIATION_UNAVAILABLE:Ribs"]) {
      const failure = checkoutFailure(code);
      expect(failure.field).toBe("cart");
      expect(failure.error).toMatch(/open the cart/i);
      // Never the slug, which means nothing to the person reading it.
      expect(failure.error).not.toMatch(/ribs-spicy/);
    }
  });

  it("asks for a new attempt id only when the old one cannot be used again", () => {
    expect(checkoutFailure("CHECKOUT_ATTEMPT_REUSED").newAttempt).toBe(true);
    // The opposite case, and the one that matters: the first request is still
    // in flight, so retrying under the same id is exactly right.
    expect(checkoutFailure("CHECKOUT_ATTEMPT_INCOMPLETE").newAttempt).toBeUndefined();
    expect(checkoutFailure("SLOT_FULL").newAttempt).toBeUndefined();
  });

  it("says nothing was charged when it cannot say anything else", () => {
    const failure = checkoutFailure("42P01: relation does not exist");
    expect(failure.error).toMatch(/Nothing has been charged/);
    expect(failure.field).toBeUndefined();
    // A customer must never be handed a stack trace or a table name.
    expect(failure.error).not.toMatch(/relation/);
  });

  it("answers every code place_order can raise", () => {
    // The list is copied from the raise statements in migration 0013. A code
    // added there without a message here falls through to the generic wording,
    // which is a quiet way to ship "something went wrong" for a problem that
    // has a real answer.
    const codes = [
      "INVALID_ATTEMPT",
      "CHECKOUT_ATTEMPT_REUSED",
      "CHECKOUT_ATTEMPT_INCOMPLETE",
      "RATE_LIMITED",
      "NO_BRANCH",
      "NOT_ACCEPTING",
      "STORE_CLOSED",
      "MISSING_NAME",
      "MISSING_PHONE",
      "INVALID_PHONE",
      "INVALID_EMAIL",
      "EMPTY_CART",
      "TOO_MANY_LINES",
      "MISSING_SLOT",
      "SLOT_UNAVAILABLE",
      "SLOT_FULL",
      "ITEM_UNAVAILABLE",
      "VARIATION_UNAVAILABLE",
      "OPTION_UNAVAILABLE",
      "OPTION_COUNT",
      "DUPLICATE_OPTION",
      "INVALID_QTY",
      "MISSING_PRICE",
      "PAYMENT_METHOD_UNAVAILABLE",
      "VOUCHERS_DISABLED",
      "SHORT_CODE_COLLISION",
      "PICKUP_CODE_COLLISION",
      // Not from 0013. The Server Action raises this one, because the address
      // dimension of the rate limit is the piece Postgres cannot see.
      "RATE_LIMITED_ADDRESS",
    ];

    const generic = checkoutFailure("something we have never seen").error;
    for (const code of codes) {
      expect(checkoutFailure(code).error, code).not.toBe(generic);
    }
  });

  it("does not accuse a shared connection of being the customer's own traffic", () => {
    // The two limits refuse different people. RATE_LIMITED is the customer's
    // own number or account, so telling them they ordered a lot is fair.
    // RATE_LIMITED_ADDRESS can refuse somebody on office or mall wifi who has
    // done nothing at all, so it must not say "you", and it has to leave a way
    // to order right now.
    const address = checkoutFailure("RATE_LIMITED_ADDRESS");
    expect(address.error).not.toMatch(/this number/i);
    expect(address.error).toMatch(/connection/i);
    expect(address.error).toMatch(/call the branch/i);
    expect(address.error).not.toBe(checkoutFailure("RATE_LIMITED").error);
    // Neither is a field error: no input on the form caused it, so nothing
    // should be highlighted red for the customer to go and "fix".
    expect(address.field).toBeUndefined();
  });
});
