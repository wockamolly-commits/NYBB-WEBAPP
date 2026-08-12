import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getMenu } from "@/app/api/mobile/v1/menu/route";
import { GET as getSlots } from "@/app/api/mobile/v1/slots/route";
import { POST as postOrder } from "@/app/api/mobile/v1/orders/route";
import { GET as getOrder } from "@/app/api/mobile/v1/orders/[shortCode]/route";
import { POST as postArrival } from "@/app/api/mobile/v1/orders/[shortCode]/arrival/route";
import { POST as postPayment } from "@/app/api/mobile/v1/orders/[shortCode]/payment/route";
import { POST as postMockPayment } from "@/app/api/mobile/v1/orders/[shortCode]/payment/mock/route";
import { POST as postOtp } from "@/app/api/mobile/v1/auth/otp/route";
import { POST as postSession } from "@/app/api/mobile/v1/auth/session/route";
import { POST as postRefresh } from "@/app/api/mobile/v1/auth/refresh/route";
import { TRACKING_TOKEN_HEADER } from "@/lib/mobile/contract";

/**
 * The mobile routes, run against no database at all.
 *
 * This is a smaller test than it looks and a more useful one than it sounds.
 * Every route here is exercised in the state every environment starts in, which
 * is the state a phone will meet on the day a Supabase project is rotated or a
 * preview deployment is missing its variables. What is being asserted is that
 * each one degrades into a specific, honest answer rather than a 500, and that
 * the two answers which must never be confused stay separate: "no such order"
 * and "we cannot currently say".
 *
 * The paths that need a database are covered by the SQL suite, which runs
 * Postgres, and by the unit tests over the services these routes call.
 */

const ORDER = "NY-ABC234";
const TOKEN = "6f1b4f7c-1f6a-4e37-9f0e-9b0c2b3f5a11";

const VALID_ORDER = {
  attemptId: "6f1b4f7c-1f6a-4e37-9f0e-9b0c2b3f5a11",
  branchSlug: "central-bloc",
  pickupSlotStart: "2026-08-13T11:00:00+08:00",
  details: { name: "Steven Cruz", phone: "0906 440 5297", email: "", notes: "" },
  paymentMethod: "qrph",
  lines: [
    {
      itemSlug: "chicken-wings",
      variationSlug: "full",
      quantity: 1,
      options: [{ groupSlug: "wing-flavour", optionSlug: "classic-buffalo" }],
    },
  ],
};

function post(path: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://nybb.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function params(shortCode: string) {
  return { params: Promise.resolve({ shortCode }) };
}

beforeEach(() => {
  // Explicit rather than inherited. A machine with a real project in its shell
  // environment would otherwise run a different test than CI does.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubEnv("PAYMONGO_SECRET_KEY", "");
  vi.stubEnv("MOCK_PAYMENTS_ENABLED", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the menu endpoint", () => {
  it("serves the static catalog and says so", async () => {
    const response = await getMenu(new Request("https://nybb.test/api/mobile/v1/menu"));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    // The app has to be able to tell a published price list from a live one,
    // because an order placed against the first will be repriced by the RPC.
    expect(body.data.source).toBe("static");
    expect(Array.isArray(body.data.categories)).toBe(true);
    expect(body.data.categories.length).toBeGreaterThan(0);
  });

  it("refuses a branch that is not slug shaped", async () => {
    const response = await getMenu(
      new Request("https://nybb.test/api/mobile/v1/menu?branch=Central%20Bloc"),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
  });
});

describe("the pickup slot endpoint", () => {
  it("answers with no windows and the reason, rather than inventing one", async () => {
    const response = await getSlots(new Request("https://nybb.test/api/mobile/v1/slots"));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.slots).toEqual([]);
    expect(body.data.unavailableReason).toBe("no_branch");
    expect(body.data.branch).toBeNull();
  });
});

describe("placing an order", () => {
  it("refuses a request that is not an order, and points at the field", async () => {
    const response = await postOrder(
      post("/api/mobile/v1/orders", {
        ...VALID_ORDER,
        details: { ...VALID_ORDER.details, name: "  " },
      }),
    );
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.field).toBe("name");
  });

  it("refuses a body that is not JSON before anything tries to price it", async () => {
    const response = await postOrder(
      new Request("https://nybb.test/api/mobile/v1/orders", { method: "POST", body: "{oops" }),
    );
    expect(response.status).toBe(400);
  });

  it("says the ordering system is unreachable rather than that the order failed", async () => {
    const response = await postOrder(post("/api/mobile/v1/orders", VALID_ORDER));
    // 503, so the app retries later instead of telling a customer their order
    // was rejected by a shop that never heard about it.
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("unavailable");
  });
});

describe("reading an order back", () => {
  it("cannot tell a wrong short code from a missing order", async () => {
    const response = await getOrder(
      new Request("https://nybb.test/api/mobile/v1/orders/nonsense"),
      params("nonsense"),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });

  it("separates an outage from a missing order", async () => {
    const response = await getOrder(
      new Request(`https://nybb.test/api/mobile/v1/orders/${ORDER}`, {
        headers: { [TRACKING_TOKEN_HEADER]: TOKEN },
      }),
      params(ORDER),
    );
    expect(response.status).toBe(503);
  });
});

describe("the arrival signal", () => {
  it("accepts a request with no body, because the path carries everything", async () => {
    const response = await postArrival(
      post(`/api/mobile/v1/orders/${ORDER}/arrival`, undefined, {
        [TRACKING_TOKEN_HEADER]: TOKEN,
      }),
      params(ORDER),
    );
    // Refused for want of a database, not for want of a readable request.
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toMatch(/counter you are here/i);
  });
});

describe("starting a payment", () => {
  it("will not start one it cannot back with a provider", async () => {
    const response = await postPayment(
      post(
        `/api/mobile/v1/orders/${ORDER}/payment`,
        { method: "qrph", paymentAttemptId: TOKEN },
        { [TRACKING_TOKEN_HEADER]: TOKEN },
      ),
      params(ORDER),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toMatch(/could not start that payment/i);
  });

  it("hides the development simulator when it is switched off", async () => {
    const response = await postMockPayment(
      post(`/api/mobile/v1/orders/${ORDER}/payment/mock`, {
        method: "qrph",
        paymentAttemptId: TOKEN,
        outcome: "paid",
      }),
      params(ORDER),
    );
    // 404 rather than 403. An endpoint that does not exist gives nothing away.
    expect(response.status).toBe(404);
  });

  it("still refuses to settle a payment it cannot verify when it is switched on", async () => {
    vi.stubEnv("MOCK_PAYMENTS_ENABLED", "true");
    const response = await postMockPayment(
      post(`/api/mobile/v1/orders/${ORDER}/payment/mock`, {
        method: "qrph",
        paymentAttemptId: TOKEN,
        outcome: "paid",
      }),
      params(ORDER),
    );
    expect(response.status).toBe(409);
  });
});

describe("signing in", () => {
  it("refuses an address that is not an address, and points at the field", async () => {
    const response = await postOtp(post("/api/mobile/v1/auth/otp", { email: "not-an-address" }));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.field).toBe("email");
  });

  it("refuses a request with no address at all before it reaches a limiter", async () => {
    const response = await postOtp(post("/api/mobile/v1/auth/otp", {}));
    expect(response.status).toBe(400);
    expect((await response.json()).error.field).toBe("email");
  });

  it("says sign-in is unreachable rather than that the address was rejected", async () => {
    const response = await postOtp(post("/api/mobile/v1/auth/otp", { email: "sam@example.com" }));
    // 503 and not 401. With no project configured this says nothing about
    // whether the address has an account, which is the property that keeps this
    // unauthenticated endpoint from being an account prober.
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("unavailable");
  });

  it("refuses a code that is not six digits without asking Supabase", async () => {
    const response = await postSession(
      post("/api/mobile/v1/auth/session", { email: "sam@example.com", token: "12ab" }),
    );
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.field).toBe("code");
  });

  it("treats a missing refresh token as a finished session, not as a bad request", async () => {
    const response = await postRefresh(post("/api/mobile/v1/auth/refresh", {}));
    // 401, because the app's rule is "sign in again" on 401 and "retry later" on
    // 503. A 400 here would leave a device with an unusable token retrying it.
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("unauthorized");
  });

  it("does not hand back a session, or anything else, from an unconfigured server", async () => {
    const response = await postSession(
      post("/api/mobile/v1/auth/session", { email: "sam@example.com", token: "123456" }),
    );
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.data).toBeUndefined();
  });

  it("never lets a sign-in response be cached", async () => {
    const response = await postSession(
      post("/api/mobile/v1/auth/session", { email: "sam@example.com", token: "123456" }),
    );
    // The one response in this API that would hand a caller a credential. A
    // shared cache holding it would serve one customer's session to the next
    // request for the same URL.
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
