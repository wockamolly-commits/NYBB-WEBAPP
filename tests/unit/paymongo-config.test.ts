import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * What a bad paste of a PayMongo credential does, and where it is caught.
 *
 * Every failure below authenticates somewhere. Swapped keys are both real
 * keys. A test secret beside a live public key is two working credentials for
 * two different accounts. A missing webhook secret is not a credential problem
 * at all until a customer pays, at which point the signed event that would
 * mark the order paid is rejected as forged, the counter never hears about the
 * order, the expiry sweep cancels it, and the money is already gone.
 *
 * None of that is visible at the pay button, so it is decided here instead:
 * the deployment declares itself unable to service the rail, and checkout does
 * not offer it. `startPayment` and `getCheckoutPaymentMethods` already refuse
 * on exactly that answer.
 */

const KEYS = [
  "PAYMONGO_SECRET_KEY",
  "NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY",
  "PAYMONGO_WEBHOOK_SECRET",
  "MOCK_PAYMENTS_ENABLED",
] as const;
const saved: Record<string, string | undefined> = {};

const { paymongoConfigurationProblem, paymongoConfigured, paymongoKeyMode, paymongoMode } =
  await import("@/lib/paymongo/config");

function configure(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const [name, value] of Object.entries(values)) process.env[name] = value;
}

const GOOD = {
  PAYMONGO_SECRET_KEY: "sk_test_aBcDeF123456",
  NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY: "pk_test_aBcDeF123456",
  PAYMONGO_WEBHOOK_SECRET: "whsk_aBcDeF123456",
} as const;

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
});

describe("PayMongo credentials", () => {
  it("treats no credentials at all as a decision rather than a mistake", () => {
    expect(paymongoConfigurationProblem()).toBeNull();
    expect(paymongoConfigured()).toBe(false);
    expect(paymongoMode()).toBeNull();
  });

  it("accepts a matched, complete pair", () => {
    configure(GOOD);
    expect(paymongoConfigurationProblem()).toBeNull();
    expect(paymongoConfigured()).toBe(true);
    expect(paymongoMode()).toBe("test");
  });

  it("refuses a secret key pasted into the public slot, and the reverse", () => {
    configure({ ...GOOD, NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY: "sk_test_aBcDeF123456" });
    expect(paymongoConfigurationProblem()).toContain("NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY");
    expect(paymongoConfigured()).toBe(false);

    configure({ ...GOOD, PAYMONGO_SECRET_KEY: "pk_test_aBcDeF123456" });
    expect(paymongoConfigurationProblem()).toContain("PAYMONGO_SECRET_KEY");
    expect(paymongoConfigured()).toBe(false);
  });

  it("refuses a test key beside a live one", () => {
    configure({ ...GOOD, NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY: "pk_live_aBcDeF123456" });
    expect(paymongoConfigurationProblem()).toContain("different modes");
    expect(paymongoConfigured()).toBe(false);
  });

  it("refuses keys with no way to confirm what they charge", () => {
    configure({
      PAYMONGO_SECRET_KEY: GOOD.PAYMONGO_SECRET_KEY,
      NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY: GOOD.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY,
    });
    expect(paymongoConfigurationProblem()).toContain("PAYMONGO_WEBHOOK_SECRET");
    expect(paymongoConfigured()).toBe(false);
  });

  it("names a half-configured deployment before it can offer anything", () => {
    configure({ NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY: GOOD.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY });
    expect(paymongoConfigurationProblem()).toContain("PAYMONGO_SECRET_KEY is not set");
  });

  it("reads the mode out of the prefix, which is the only place it is written", () => {
    expect(paymongoKeyMode("sk_live_x")).toBe("live");
    expect(paymongoKeyMode("pk_test_x")).toBe("test");
    expect(paymongoKeyMode("whsk_x")).toBeNull();
  });
});
