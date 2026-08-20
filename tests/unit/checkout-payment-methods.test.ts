import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Which payment rails checkout may offer, and the question that was never
 * asked: can this deployment actually service the rail it is about to show?
 *
 * `app_settings.paymongo_enabled` lives in one database that every environment
 * shares. Switching QR Ph on there switched it on for the production
 * deployment too, which holds no PayMongo keys and cannot run the simulator
 * (that is hard-disabled whenever NODE_ENV is production). So the screen
 * offered QR Ph, the customer placed a QR Ph order, and the pay button
 * answered "We could not start that payment. Please try again in a moment."
 * for a reason no amount of retrying could change.
 *
 * The flag is a business decision: the owner has switched this rail on.
 * Whether a deployment can honour it is a fact about that deployment. An offer
 * needs both, and this drives the real env-reading functions rather than
 * mocking them, because the environment is the thing that was wrong.
 */

const rpc = vi.fn();
const supabaseConfiguredMock = vi.fn(() => true);

vi.mock("@/lib/supabase/public-client", () => ({
  createPublicClient: () => ({ rpc }),
  supabaseConfigured: () => supabaseConfiguredMock(),
}));

const { getCheckoutPaymentMethods } = await import("@/lib/checkout/payment-settings");

const KEYS = [
  "PAYMONGO_SECRET_KEY",
  "NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY",
  "PAYMONGO_WEBHOOK_SECRET",
  "MOCK_PAYMENTS_ENABLED",
] as const;
const saved: Record<string, string | undefined> = {};

/**
 * Credentials present, so a real PayMongo call could be made AND its result
 * could be confirmed. All three matter: without the webhook secret the signed
 * paid event is rejected as forged, so the payment would be taken and the
 * order would never leave pending.
 */
function withPaymongoKeys() {
  process.env.PAYMONGO_SECRET_KEY = "sk_test_probe";
  process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY = "pk_test_probe";
  process.env.PAYMONGO_WEBHOOK_SECRET = "whsk_probe";
}

/** A development deployment running the simulator. NODE_ENV is "test" here. */
function withSimulator() {
  process.env.MOCK_PAYMENTS_ENABLED = "true";
}

/** The database saying yes to QR Ph, which is where this started. */
function databaseSaysQrphIsOn() {
  rpc.mockResolvedValue({
    data: { paymongo_enabled: true, paymongo_methods: { qrph: true, gcash: false } },
    error: null,
  });
}

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.clearAllMocks();
  supabaseConfiguredMock.mockReturnValue(true);
});

describe("the payment rails checkout may offer", () => {
  it("offers nothing online when the deployment has no keys and cannot simulate", async () => {
    databaseSaysQrphIsOn();

    // Production with the flag on: the exact state that produced the dead
    // button. Counter remains, so the customer can still place an order.
    expect(await getCheckoutPaymentMethods()).toEqual([]);
  });

  it("offers the enabled rail when real PayMongo keys are present", async () => {
    databaseSaysQrphIsOn();
    withPaymongoKeys();

    expect(await getCheckoutPaymentMethods()).toEqual(["qrph"]);
  });

  it("offers the enabled rail on a deployment running the simulator", async () => {
    databaseSaysQrphIsOn();
    withSimulator();

    expect(await getCheckoutPaymentMethods()).toEqual(["qrph"]);
  });

  it("still respects the owner's switch when the deployment is capable", async () => {
    withPaymongoKeys();
    rpc.mockResolvedValue({
      data: { paymongo_enabled: false, paymongo_methods: { qrph: true } },
      error: null,
    });

    // Keys alone do not open a rail. The owner's flag is still the decision.
    expect(await getCheckoutPaymentMethods()).toEqual([]);
  });

  it("offers nothing when the keys cannot confirm what they charge", async () => {
    databaseSaysQrphIsOn();
    withPaymongoKeys();
    delete process.env.PAYMONGO_WEBHOOK_SECRET;

    // Keys good enough to take a payment, and nothing able to prove one
    // arrived. That is the one failure worse than showing no rail at all.
    expect(await getCheckoutPaymentMethods()).toEqual([]);
  });

  it("offers nothing when there is no database to ask", async () => {
    supabaseConfiguredMock.mockReturnValue(false);
    withPaymongoKeys();

    expect(await getCheckoutPaymentMethods()).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
