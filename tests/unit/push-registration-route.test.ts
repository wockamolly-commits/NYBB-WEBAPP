import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The push registration route, with a mocked RPC rather than a database.
 *
 * `register_customer_push_device` is the thing that actually decides who may
 * register a device against an order (`tests/sql/push-registration.test.ts`
 * covers that). What is worth asserting here is what this route and service
 * do on their own: that a bad platform never reaches the RPC at all, that an
 * oversized body is refused before it is parsed, and above everything that an
 * Expo push token and a tracking token, both device and order credentials,
 * never end up in a log line.
 */

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/public-client", () => ({
  supabaseConfigured: () => true,
  createPublicClient: () => ({ rpc: mocks.rpc }),
}));

import { POST as postPush } from "@/app/api/mobile/v1/orders/[shortCode]/push/route";
import { MAX_MOBILE_BODY_BYTES, TRACKING_TOKEN_HEADER } from "@/lib/mobile/contract";

const ORDER = "NY-ABC234";
const TOKEN = "6f1b4f7c-1f6a-4e37-9f0e-9b0c2b3f5a11";
const EXPO_TOKEN = "ExponentPushToken[a1b2c3d4e5f6g7h8]";

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://nybb.test/api/mobile/v1/orders/${ORDER}/push`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function params(shortCode: string = ORDER) {
  return { params: Promise.resolve({ shortCode }) };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  mocks.rpc.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("registering a phone for one order's alerts", () => {
  it("accepts a valid body and tracking token", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    const response = await postPush(
      post({ expoToken: EXPO_TOKEN, platform: "ios" }, { [TRACKING_TOKEN_HEADER]: TOKEN }),
      params(),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, data: { registered: true } });
    expect(mocks.rpc).toHaveBeenCalledWith("register_customer_push_device", {
      p_short_code: ORDER,
      p_tracking_token: TOKEN,
      p_expo_token: EXPO_TOKEN,
      p_platform: "ios",
    });
  });

  it("refuses a missing tracking token", async () => {
    // Nothing in the request authorizes this order: no header, no bearer
    // token, so this is exactly the shape register_customer_push_device
    // itself refuses (an empty p_tracking_token). The route has to carry that
    // refusal back rather than inventing an owner.
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    const response = await postPush(post({ expoToken: EXPO_TOKEN, platform: "ios" }), params());

    expect(response.status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "register_customer_push_device",
      expect.objectContaining({ p_tracking_token: null }),
    );
  });

  it("refuses a platform that is not ios or android, before the RPC is called", async () => {
    const response = await postPush(
      post({ expoToken: EXPO_TOKEN, platform: "web" }, { [TRACKING_TOKEN_HEADER]: TOKEN }),
      params(),
    );

    // The service collapses a schema failure into the same refusal as an RPC
    // refusal, the same as `signalArrival` does, so the load-bearing check is
    // that the RPC was never reached rather than the exact status.
    expect(response.status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuses a body over the mobile API's size limit, before it is parsed", async () => {
    const response = await postPush(
      post(
        { expoToken: EXPO_TOKEN, platform: "ios", padding: "x".repeat(MAX_MOBILE_BODY_BYTES) },
        { [TRACKING_TOKEN_HEADER]: TOKEN },
      ),
      params(),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("never puts the tracking token in a console.error call, even when the RPC fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "connection reset" } });

    const response = await postPush(
      post({ expoToken: EXPO_TOKEN, platform: "ios" }, { [TRACKING_TOKEN_HEADER]: TOKEN }),
      params(),
    );

    expect(response.status).toBe(409);
    // Forcing the failure path is the point: a passing assertion against a
    // spy nobody called proves nothing about what the code logs.
    expect(errorSpy).toHaveBeenCalled();
    for (const call of errorSpy.mock.calls) {
      const line = call.map((arg) => String(arg)).join(" ");
      expect(line).not.toContain(TOKEN);
      expect(line).not.toContain(EXPO_TOKEN);
    }

    errorSpy.mockRestore();
  });
});
