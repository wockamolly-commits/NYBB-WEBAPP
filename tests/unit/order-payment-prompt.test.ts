import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { onlinePaymentPrompt } from "@/lib/orders/status";

describe("what a customer waiting on an online payment is shown", () => {
  it("offers the pay button when this deployment can carry the payment", () => {
    expect(onlinePaymentPrompt(true)).toEqual({ kind: "payable" });
  });

  // An order can outlive its rail. The flag that opens QR Ph lives in a
  // database every environment shares, so orders were placed on it against a
  // deployment holding no keys. Those orders are real and unpayable here.
  it("replaces the button with something true when it cannot", () => {
    const prompt = onlinePaymentPrompt(false);
    expect(prompt.kind).toBe("unavailable");
    if (prompt.kind !== "unavailable") return;

    // It must NOT claim the pickup window is held. An unpaid online order is
    // cancelled by expire_unpaid_online_orders() after
    // `online_payment_expiry_minutes` and its slot is released, so telling a
    // customer their window is safe is a promise this system actively breaks
    // minutes later. The first version of this copy said exactly that.
    expect(prompt.body).not.toMatch(/held|reserved|saved for you/i);
    expect(prompt.body).toMatch(/released automatically/i);

    // Says no money moved, because "payment failed" reads as "I may have been
    // charged" to anybody who has ever used a card online.
    expect(prompt.body).toMatch(/nothing has been charged/i);

    // And names something that works instead of a button that does not.
    expect(prompt.body).toMatch(/pay at the counter/i);
  });
});

describe("the payment surfaces keep themselves current", () => {
  // A source tripwire, in the spirit of tests/unit/push-triggers.test.ts.
  // Settling a payment does not change the order's STATUS (a paid online order
  // stays `pending`), so the tracking page's Realtime signal never fires for
  // it and nothing else will bring the screen up to date.
  it("refreshes the server tree after the simulator settles a payment", () => {
    const source = readFileSync("components/checkout/MockPayment.tsx", "utf8");
    expect(source).toContain('from "next/navigation"');
    expect(source).toContain("router.refresh()");
  });

  // The button is offered from a server-decided fact, never from a guess made
  // in the browser, which cannot see whether the deployment holds keys.
  it("decides payability on the server and hands it to the client", () => {
    expect(readFileSync("components/order/OrderTracker.tsx", "utf8"))
      .toContain("serviceable={onlinePaymentsServiceable()}");
    expect(readFileSync("components/order/PaymentResume.tsx", "utf8"))
      .toContain("onlinePaymentPrompt(serviceable)");
  });
});
