import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The route, with the service mocked. It decides nothing, and that is the
 * property under test: a malformed body is refused before anything else, and
 * every refusal from the service becomes one shape of answer.
 */

const mocks = vi.hoisted(() => ({ register: vi.fn() }));

vi.mock("@/lib/customer/push", () => ({
  registerCustomerSubscription: (input: unknown, caller: unknown) =>
    mocks.register(input, caller),
}));
vi.mock("@/lib/customer/cookie-caller", () => ({
  cookieCaller: async () => ({ address: null, identity: async () => null }),
}));

import { POST } from "@/app/api/push/customer/subscribe/route";

function post(body: string): Request {
  return new Request("https://nybb.test/api/push/customer/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

beforeEach(() => {
  mocks.register.mockReset();
});

describe("POST /api/push/customer/subscribe", () => {
  it("answers 200 when the service accepts", async () => {
    mocks.register.mockResolvedValue({ ok: true });
    const response = await POST(post(JSON.stringify({ any: "shape" })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ registered: true });
  });

  it("answers 400 for a body that is not JSON, without calling the service", async () => {
    const response = await POST(post("{not json"));
    expect(response.status).toBe(400);
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("answers 409 with the service's sentence when it refuses", async () => {
    mocks.register.mockResolvedValue({ ok: false, error: "Nope." });
    const response = await POST(post(JSON.stringify({ any: "shape" })));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Nope." });
  });
});
