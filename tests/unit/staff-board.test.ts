import { describe, expect, it } from "vitest";
import { awaitsPayment, boardAction, describePayment, paymentLabel } from "@/lib/staff/board";
import type { WorkspaceOrder } from "@/lib/staff/order-types";

/**
 * What the orders board offers a counter, and when.
 *
 * The claim worth testing is narrow: under payment-first the New column fills
 * with orders that are real, correct, and not yet cookable, and the board must
 * not offer a Start button for them. `staff_set_order_status` already refuses
 * those with PAYMENT_REQUIRED, so this is not the control that keeps an unpaid
 * order out of the kitchen. It is the difference between a board that explains
 * itself and a button whose only outcome is a red message during a rush.
 */

function order(overrides: Partial<WorkspaceOrder> = {}): WorkspaceOrder {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    shortCode: "NY-ABC234",
    status: "pending",
    isTest: false,
    customerName: "Maria Santos",
    customerPhone: "0906-440-5297",
    totalCents: 45000,
    notes: null,
    placedAt: "2026-08-12T02:00:00.000Z",
    pickupAt: "2026-08-12T04:00:00.000Z",
    customerArrived: false,
    payment: { method: "qrph", provider: "paymongo", status: "paid" },
    items: [],
    heatLevels: [],
    ...overrides,
  };
}

describe("whether an order is waiting on a provider", () => {
  it("holds an online order that has not been paid", () => {
    for (const status of ["pending", "due", "failed", "expired"]) {
      expect(awaitsPayment(order({ payment: { method: "qrph", provider: "paymongo", status } })), status).toBe(true);
    }
  });

  it("releases it the moment the webhook says paid", () => {
    // The webhook is the only writer of that value. Nothing on the board, and
    // nothing in the app, may decide it.
    expect(awaitsPayment(order())).toBe(false);
  });

  it("never holds a counter order, whatever its payment says", () => {
    // The payment-first ruling took the counter rail out of customer checkout,
    // not out of the schema, and 0018 still captures a counter payment on
    // claim. Treating one as unpayable would strand the orders a branch is
    // most able to serve.
    expect(awaitsPayment(order({ payment: { method: "counter", provider: "none", status: "due" } }))).toBe(false);
  });

  it("does not invent a wait for an order with no payment row at all", () => {
    expect(awaitsPayment(order({ payment: null }))).toBe(false);
  });
});

describe("what the card offers", () => {
  it("offers nothing to start while the customer is still paying", () => {
    const unpaid = order({ payment: { method: "qrph", provider: "paymongo", status: "pending" } });
    expect(boardAction(unpaid)).toEqual({ kind: "awaiting_payment" });
    // And the same once accepted, because accepted and unpaid is still a thing
    // 0018 refuses to move into the kitchen.
    expect(boardAction({ ...unpaid, status: "accepted" })).toEqual({ kind: "awaiting_payment" });
  });

  it("walks a paid order through the three-tap path", () => {
    expect(boardAction(order({ status: "pending" }))).toEqual({ kind: "start" });
    expect(boardAction(order({ status: "accepted" }))).toEqual({ kind: "start" });
    expect(boardAction(order({ status: "preparing" }))).toEqual({ kind: "ready" });
    expect(boardAction(order({ status: "ready" }))).toEqual({ kind: "claim" });
    expect(boardAction(order({ status: "claimed" }))).toEqual({ kind: "done" });
  });

  it("keeps a counter order startable, so a manual order is not stranded", () => {
    const counter = order({ payment: { method: "counter", provider: "none", status: "due" } });
    expect(boardAction(counter)).toEqual({ kind: "start" });
  });

  it("never offers a claim before an order is ready", () => {
    // The pickup code is what proves the collector is the customer, and asking
    // for it early trains staff to type it while food is still in a fryer.
    for (const status of ["pending", "accepted", "preparing"] as const) {
      expect(boardAction(order({ status })).kind, status).not.toBe("claim");
    }
  });
});

describe("what the card says about money", () => {
  it("does not call a customer unpaid while they are paying", () => {
    const label = paymentLabel(order({ payment: { method: "qrph", provider: "paymongo", status: "pending" } }));
    expect(label).toBe("Awaiting payment");
    expect(label).not.toMatch(/unpaid/i);
  });

  it("separates money already taken from money still to take", () => {
    expect(paymentLabel(order())).toBe("Paid online");
    expect(paymentLabel(order({ payment: { method: "counter", provider: "none", status: "paid" } }))).toBe("Paid at counter");
    expect(paymentLabel(order({ payment: { method: "counter", provider: "none", status: "due" } }))).toBe("Collect at counter");
  });

  it("says so plainly when there is no payment row", () => {
    expect(paymentLabel(order({ payment: null }))).toBe("No payment on this order");
  });
});

describe("what a closed order says about money", () => {
  // History used to own a second function of the same name whose unpaid branch
  // returned the raw row, so a manager reading last Tuesday was shown
  // "paymongo · awaiting_payment". One function now answers both screens.
  it("stops telling a manager to wait for a payment that will never arrive", () => {
    const payment = { method: "qrph", status: "pending" };
    expect(describePayment(payment)).toBe("Awaiting payment");
    expect(describePayment(payment, { settled: true })).toBe("Never paid");
  });

  it("never prints a database enum at a person", () => {
    for (const settled of [false, true]) {
      for (const status of ["pending", "awaiting_payment", "failed", "expired"]) {
        const label = describePayment({ method: "qrph", status }, { settled });
        expect(label, status).not.toMatch(/_|qrph|paymongo/);
      }
    }
  });

  it("reads the same as the board once the money is in", () => {
    const paid = { method: "qrph", status: "paid" };
    expect(describePayment(paid, { settled: true })).toBe(describePayment(paid));
  });

  it("distinguishes a counter order never collected from one still to collect", () => {
    const due = { method: "counter", status: "due" };
    expect(describePayment(due)).toBe("Collect at counter");
    expect(describePayment(due, { settled: true })).toBe("Never paid at the counter");
  });
});
