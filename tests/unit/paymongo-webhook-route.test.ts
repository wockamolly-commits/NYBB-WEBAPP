import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the PayMongo webhook answers when this deployment cannot record the
 * event.
 *
 * PayMongo retries any delivery that does not get a 2xx back, and stops for
 * good once it does. So a 2xx is a promise that the event has been dealt with.
 * Without a service role key the handler cannot write to the payment row, and
 * before this it still answered `received`, which turned a fixable deployment
 * mistake into a paid order that never reached the counter.
 */

const admin = vi.hoisted(() => ({
  configured: false,
  rpc: vi.fn(),
}));

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/paymongo/config", () => ({ getPaymongoWebhookSecret: () => "whsk_test" }));
vi.mock("@/lib/paymongo/webhook", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paymongo/webhook")>()),
  verifyPaymongoSignature: () => true,
}));
vi.mock("@/lib/push/dispatch", () => ({
  notifyCustomer: vi.fn(),
  notifyCustomerOfRefund: vi.fn(),
  notifyStaffOfNewOrder: vi.fn(),
}));
vi.mock("@/lib/supabase/admin-client", () => ({
  adminConfigured: () => admin.configured,
  createAdminClient: () => ({ rpc: admin.rpc }),
}));

const { POST } = await import("@/app/api/paymongo/webhook/route");

function deliver(event: unknown): Promise<Response> {
  return POST(
    new Request("https://shop.test/api/paymongo/webhook", {
      method: "POST",
      headers: { "paymongo-signature": "t=1,te=sig" },
      body: JSON.stringify(event),
    }),
  );
}

const PAID = {
  data: {
    attributes: {
      type: "payment.paid",
      data: { id: "pay_1", attributes: { payment_intent_id: "pi_1" } },
    },
  },
};

const REFUNDED = {
  data: {
    attributes: {
      type: "payment.refund.updated",
      data: { id: "ref_1", attributes: { status: "succeeded", metadata: { refund_id: "r1" } } },
    },
  },
};

describe("the PayMongo webhook without a service role key", () => {
  beforeEach(() => {
    admin.configured = false;
    admin.rpc.mockReset();
  });

  it("asks PayMongo to retry a paid event rather than dropping it", async () => {
    const response = await deliver(PAID);
    expect(response.status).toBe(503);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("asks PayMongo to retry a refund event rather than dropping it", async () => {
    const response = await deliver(REFUNDED);
    expect(response.status).toBe(503);
  });

  it("still acknowledges an event it has no use for", async () => {
    const response = await deliver({ data: { attributes: { type: "source.chargeable" } } });
    expect(response.status).toBe(200);
  });
});

describe("the PayMongo webhook with a service role key", () => {
  beforeEach(() => {
    admin.configured = true;
    admin.rpc.mockReset();
    admin.rpc.mockResolvedValue({ data: null, error: null });
  });

  it("records a paid event and acknowledges it", async () => {
    const response = await deliver(PAID);
    expect(response.status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledWith(
      "apply_paymongo_payment",
      expect.objectContaining({ p_intent_id: "pi_1", p_status: "paid" }),
    );
  });
});
