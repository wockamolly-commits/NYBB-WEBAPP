import { beforeEach, describe, expect, it, vi } from "vitest";
import { paymentState } from "@/lib/orders/payment-state";

/**
 * The rule a waiting payment screen moves on by. Only a payment row the
 * webhook has marked paid is "paid"; anything that ended without one is
 * "closed", so the screen stops and never redirects on a failure.
 */

type Input = Parameters<typeof paymentState>[0];

function order(status: Input["status"], payment: { method: string; status: string } | null): Input {
  return {
    status,
    payment: payment && { ...payment, amountCents: 25_000, paidAt: null },
  };
}

describe("paymentState", () => {
  it("is paid only once the payment row says paid", () => {
    expect(paymentState(order("pending", { method: "qrph", status: "paid" }))).toBe("paid");
    expect(paymentState(order("accepted", { method: "qrph", status: "paid" }))).toBe("paid");
  });

  it("keeps waiting while the payment and the order are both pending", () => {
    expect(paymentState(order("pending", { method: "qrph", status: "pending" }))).toBe("waiting");
  });

  it("closes on a failed payment, without ever reading as paid", () => {
    expect(paymentState(order("pending", { method: "qrph", status: "failed" }))).toBe("closed");
    expect(paymentState(order("cancelled", { method: "qrph", status: "failed" }))).toBe("closed");
  });

  it("closes when the order ended before it was paid", () => {
    expect(paymentState(order("cancelled", { method: "qrph", status: "pending" }))).toBe("closed");
    expect(paymentState(order("rejected", { method: "qrph", status: "refunded" }))).toBe("closed");
  });

  it("never settles a counter order or an order with no payment row", () => {
    expect(paymentState(order("accepted", { method: "counter", status: "paid" }))).toBe("waiting");
    expect(paymentState(order("pending", null))).toBe("waiting");
  });
});

const mocks = vi.hoisted(() => ({ read: vi.fn() }));

vi.mock("@/lib/customer/payment", () => ({
  readPaymentState: (input: unknown, caller: unknown) => mocks.read(input, caller),
}));
vi.mock("@/lib/customer/cookie-caller", () => ({
  cookieCaller: async () => ({ address: null, identity: async () => null }),
}));

const { POST } = await import("@/app/api/orders/payment-state/route");

function post(body: string): Request {
  return new Request("https://nybb.test/api/orders/payment-state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

beforeEach(() => {
  mocks.read.mockReset();
});

describe("POST /api/orders/payment-state", () => {
  it("answers with the state and is never cached", async () => {
    mocks.read.mockResolvedValue("paid");
    const response = await POST(post(JSON.stringify({ shortCode: "NY-ABCDEF" })));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ state: "paid" });
  });

  it("answers 404 when the order cannot be read for this caller", async () => {
    mocks.read.mockResolvedValue(null);
    const response = await POST(post(JSON.stringify({ shortCode: "NY-ABCDEF" })));
    expect(response.status).toBe(404);
    expect(await response.json()).not.toHaveProperty("state");
  });

  it("answers 400 for a body that is not JSON, without reading anything", async () => {
    const response = await POST(post("{not json"));
    expect(response.status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
