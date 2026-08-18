import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The registration service, with a mocked RPC rather than a database.
 *
 * The database decides who may register (tests/sql/customer-push-registration
 * .test.ts covers that). What is worth asserting here is what this file does
 * on its own: that it flattens the browser's nested keys into the shape the
 * function takes, and that neither the subscription keys nor the tracking
 * token reach a log line.
 */

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/public-client", () => ({
  supabaseConfigured: () => true,
  createPublicClient: () => ({ rpc: mocks.rpc }),
}));

import { registerCustomerSubscription } from "@/lib/customer/push";
import { guestCaller } from "@/lib/customer/caller";

const TOKEN = "6f1b4f7c-1f6a-4e37-9f0e-9b0c2b3f5a11";
const ENDPOINT = "https://push.example/abc";
const P256DH = "p256dh-secret-value";
const AUTH = "auth-secret-value";

// The shape a browser actually sends: PushSubscription.toJSON() nests the keys
// and adds an expirationTime nothing here wants.
function browserBody() {
  return {
    shortCode: "NY-ABC234",
    trackingToken: TOKEN,
    subscription: {
      endpoint: ENDPOINT,
      expirationTime: null,
      keys: { p256dh: P256DH, auth: AUTH },
    },
  };
}

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});

describe("registerCustomerSubscription", () => {
  it("flattens the browser's nested keys into the arguments the function takes", async () => {
    const result = await registerCustomerSubscription(browserBody(), guestCaller());

    expect(result).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("register_customer_push_subscription", {
      p_short_code: "NY-ABC234",
      p_tracking_token: TOKEN,
      p_endpoint: ENDPOINT,
      p_p256dh: P256DH,
      p_auth_key: AUTH,
    });
  });

  it("refuses a body whose keys sit at the top level rather than under keys", async () => {
    const flat = {
      shortCode: "NY-ABC234",
      trackingToken: TOKEN,
      subscription: { endpoint: ENDPOINT, p256dh: P256DH, auth: AUTH },
    };
    const result = await registerCustomerSubscription(flat, guestCaller());

    expect(result.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("treats the function returning false as a refusal", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const result = await registerCustomerSubscription(browserBody(), guestCaller());
    expect(result.ok).toBe(false);
  });

  it("never logs the subscription keys or the tracking token", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    await registerCustomerSubscription(browserBody(), guestCaller());

    const logged = spy.mock.calls.flat().map((v) => JSON.stringify(v)).join(" ");
    expect(logged).not.toContain(P256DH);
    expect(logged).not.toContain(AUTH);
    expect(logged).not.toContain(TOKEN);
    spy.mockRestore();
  });
});
