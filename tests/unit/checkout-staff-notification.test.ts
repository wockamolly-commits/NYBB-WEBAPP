import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaceOrderInput, PlaceOrderResult } from "@/lib/checkout/types";

/**
 * Behavioural cover for which orders reach the counter tablet.
 *
 * tests/unit/push-triggers.test.ts proves `notifyStaffOfNewOrder` and `after`
 * are still wired into the checkout action at all. It cannot catch the guard
 * being widened to every payment method, which is the mistake with a real
 * cost: an online order is placed unpaid, and announcing it would put a
 * kitchen to work on food nobody has paid for and that the expiry sweep may
 * yet cancel. Nor can it catch the guard being narrowed to nothing, which is
 * the state this project was actually in.
 *
 * So this drives the exported Server Action with every dependency mocked and
 * asserts on the one thing the counter experiences: whether the tablet rings.
 */

const after = vi.fn((promise: Promise<unknown>) => promise);
const notifyStaffOfNewOrder = vi.fn<(orderId: string) => Promise<void>>(async () => {});
const submitOrder = vi.fn<(...args: unknown[]) => Promise<PlaceOrderResult>>();

vi.mock("next/server", () => ({
  after: (promise: Promise<unknown>) => after(promise),
}));
vi.mock("@/lib/push/dispatch", () => ({
  notifyStaffOfNewOrder: (orderId: string) => notifyStaffOfNewOrder(orderId),
}));
vi.mock("@/lib/customer/orders", () => ({
  submitOrder: (...args: unknown[]) => submitOrder(...args),
}));
vi.mock("@/lib/customer/cookie-caller", () => ({
  cookieCaller: async () => ({ address: null }),
}));

const { placeOrder } = await import("@/app/actions/checkout");

const ORDER_ID = "33333333-3333-4333-8333-333333333333";

/** The parts of a placed order this action reads, and nothing else. */
function placed(paymentMethod: string): PlaceOrderResult {
  return {
    ok: true,
    order: {
      orderId: ORDER_ID,
      shortCode: "NY-ABC234",
      trackingToken: "44444444-4444-4444-8444-444444444444",
      pickupCode: "1234",
      status: "pending",
      paymentMethod,
      pickupSlotStart: "2026-08-19T10:00:00Z",
      pickupSlotEnd: "2026-08-19T10:15:00Z",
      subtotalCents: 32900,
      discountCents: 0,
      totalCents: 32900,
      branch: {
        slug: "central-bloc",
        name: "Central Bloc",
        shortName: "Central Bloc",
        timezone: "Asia/Manila",
      },
    },
  };
}

const input = {} as PlaceOrderInput;

afterEach(() => {
  vi.clearAllMocks();
});

describe("placing an order tells the counter", () => {
  it("announces a counter order, through after()", async () => {
    submitOrder.mockResolvedValue(placed("counter"));

    await placeOrder(input);

    expect(notifyStaffOfNewOrder).toHaveBeenCalledWith(ORDER_ID);
    // Not merely called: handed to after(). A detached promise is killed
    // mid-flight on Vercel and the ECONNRESET lands on an unrelated later
    // request. Spec section 15, hard rule 2.
    expect(after).toHaveBeenCalledTimes(1);
  });

  // The business rule this project has held throughout: the kitchen does not
  // start on an unpaid order. These four rails are placed unpaid and announced
  // from the PayMongo webhook instead, on `paid`.
  it.each(["qrph", "gcash", "maya", "card"])(
    "does not announce a %s order, which is not paid yet",
    async (method) => {
      submitOrder.mockResolvedValue(placed(method));

      await placeOrder(input);

      expect(notifyStaffOfNewOrder).not.toHaveBeenCalled();
      expect(after).not.toHaveBeenCalled();
    },
  );

  it("announces nothing when the order was refused", async () => {
    submitOrder.mockResolvedValue({ ok: false, error: "That window just filled up." });

    await placeOrder(input);

    expect(notifyStaffOfNewOrder).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("returns the service's answer unchanged", async () => {
    const result = placed("counter");
    submitOrder.mockResolvedValue(result);

    expect(await placeOrder(input)).toBe(result);
  });
});
