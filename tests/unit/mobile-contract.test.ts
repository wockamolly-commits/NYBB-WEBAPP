import { describe, expect, it } from "vitest";
import { bearerCaller, guestCaller, normalizeAccessToken } from "@/lib/customer/caller";
import { mobileAppScheme, paymentReturnUrl } from "@/lib/customer/payment";
import {
  MAX_MOBILE_BODY_BYTES,
  MOBILE_API_BASE_PATH,
  MOBILE_ERROR_CODES,
  MOBILE_ERROR_STATUS,
  TRACKING_TOKEN_HEADER,
} from "@/lib/mobile/contract";
import {
  bearerToken,
  branchSlugParam,
  mobileError,
  mobileOk,
  mobileCaller,
  readMobileBody,
  trackingToken,
} from "@/lib/mobile/http";

/**
 * The mobile boundary, on the TypeScript side.
 *
 * These are the claims that a phone which cannot be redeployed depends on. Not
 * "does the route work", which needs a database, but the smaller and more
 * dangerous things: that a credential is read from the place the contract says,
 * that an oversized or unreadable body is refused before anything parses it,
 * that a status code means what the app was built to expect, and that a return
 * URL is one this server chose.
 */

function request(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

describe("the app's copy of the contract", () => {
  it("still agrees with the server's", async () => {
    // Two copies of anything drift, and this one drifts onto a phone that
    // cannot be redeployed. Metro cannot follow the Next project's `@/` alias
    // out of the Expo workspace, so the app carries its own file and this test
    // is what keeps the two honest.
    const app = await import("../../apps/customer/src/api/contract");

    expect(app.MOBILE_API_BASE_PATH).toBe(MOBILE_API_BASE_PATH);
    expect(app.TRACKING_TOKEN_HEADER).toBe(TRACKING_TOKEN_HEADER);
    expect(app.MAX_MOBILE_BODY_BYTES).toBe(MAX_MOBILE_BODY_BYTES);
    expect([...app.MOBILE_ERROR_CODES].sort()).toEqual([...MOBILE_ERROR_CODES].sort());
    expect(app.MOBILE_ERROR_STATUS).toEqual(MOBILE_ERROR_STATUS);
  });
});

describe("the envelope", () => {
  it("wraps success and refusal in one shape the app can always parse", async () => {
    const ok = mobileOk({ shortCode: "NY-ABC234" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, data: { shortCode: "NY-ABC234" } });

    const failed = mobileError("conflict", "This order is no longer waiting for payment.");
    expect(await failed.json()).toEqual({
      ok: false,
      error: { code: "conflict", message: "This order is no longer waiting for payment." },
    });
  });

  it("never lets a response be cached", () => {
    // Prices, availability and order state are the three things a stale answer
    // gets wrong in a way somebody pays for.
    expect(mobileOk({}).headers.get("cache-control")).toBe("no-store");
    expect(mobileError("not_found", "gone").headers.get("cache-control")).toBe("no-store");
  });

  it("gives every code exactly one status, and one the app can act on", () => {
    for (const code of MOBILE_ERROR_CODES) {
      expect(MOBILE_ERROR_STATUS[code], code).toBeGreaterThanOrEqual(400);
    }
    // A client backs off on 429 and retries on 503. Collapsing either into 409
    // is how an app either hammers a limit or gives up on an outage.
    expect(MOBILE_ERROR_STATUS.rate_limited).toBe(429);
    expect(MOBILE_ERROR_STATUS.unavailable).toBe(503);
    expect(MOBILE_ERROR_STATUS.invalid_request).toBe(400);
    expect(MOBILE_ERROR_STATUS.conflict).toBe(409);
  });

  it("carries the checkout hints the app needs to recover", async () => {
    const failed = mobileError("conflict", "Somebody took the last place.", {
      field: "slot",
      staleSlots: true,
    });
    expect(await failed.json()).toMatchObject({
      error: { field: "slot", staleSlots: true },
    });
  });

  it("keeps the version in the path, because an installed app cannot be redeployed", () => {
    expect(MOBILE_API_BASE_PATH).toBe("/api/mobile/v1");
  });
});

describe("reading a credential off a request", () => {
  it("accepts the bearer scheme in any casing", () => {
    expect(bearerToken(new Headers({ authorization: "Bearer abc.def" }))).toBe("abc.def");
    expect(bearerToken(new Headers({ authorization: "bearer abc.def" }))).toBe("abc.def");
    expect(bearerToken(new Headers({ authorization: "  BEARER   abc.def  " }))).toBe("abc.def");
  });

  it("treats anything else as no credential at all", () => {
    expect(bearerToken(new Headers())).toBeNull();
    expect(bearerToken(new Headers({ authorization: "Basic abc" }))).toBeNull();
    expect(bearerToken(new Headers({ authorization: "Bearer" }))).toBeNull();
    expect(bearerToken(new Headers({ authorization: "Bearer    " }))).toBeNull();
  });

  it("takes the tracking token from a header rather than a query string", () => {
    const headers = new Headers({ [TRACKING_TOKEN_HEADER]: " 6f1b4f7c-1f6a-4e37-9f0e-9b0c2b3f5a11 " });
    expect(trackingToken(headers)).toBe("6f1b4f7c-1f6a-4e37-9f0e-9b0c2b3f5a11");
    expect(trackingToken(new Headers())).toBeNull();
  });

  it("ignores cookies completely", async () => {
    // The mobile API has no cookie surface, and this is the test that says so.
    // If a caller could authenticate with a cookie, any web page could make a
    // customer's browser place an order on their behalf.
    const withCookie = mobileCaller(
      request("https://nybb.test/api/mobile/v1/orders", {
        headers: { cookie: "sb-access-token=pretend; sb-refresh-token=pretend" },
      }),
    );
    expect(await withCookie.identity()).toBeNull();
  });

  it("builds a guest caller when the token is not usable", async () => {
    expect(await guestCaller("203.0.113.5").identity()).toBeNull();
    expect(await bearerCaller("", "203.0.113.5").identity()).toBeNull();
    expect(await bearerCaller("   ", null).identity()).toBeNull();
    expect(await bearerCaller("x".repeat(5000), null).identity()).toBeNull();
  });

  it("normalizes an access token, or refuses to hold one", () => {
    expect(normalizeAccessToken(" abc.def.ghi ")).toBe("abc.def.ghi");
    expect(normalizeAccessToken(123)).toBeNull();
    expect(normalizeAccessToken(null)).toBeNull();
    expect(normalizeAccessToken("x".repeat(4097))).toBeNull();
  });
});

describe("the branch filter", () => {
  it("reads a slug, and treats a missing one as whichever branch is live", () => {
    expect(branchSlugParam(request("https://nybb.test/api/mobile/v1/menu"))).toEqual({
      ok: true,
      value: undefined,
    });
    expect(
      branchSlugParam(request("https://nybb.test/api/mobile/v1/menu?branch=central-bloc")),
    ).toEqual({ ok: true, value: "central-bloc" });
  });

  it("refuses anything that is not slug shaped rather than serving the default", () => {
    for (const bad of ["Central Bloc", "central_bloc", "../admin", "a".repeat(81), "-lead"]) {
      const parsed = branchSlugParam(
        request(`https://nybb.test/api/mobile/v1/menu?branch=${encodeURIComponent(bad)}`),
      );
      expect(parsed.ok, bad).toBe(false);
    }
  });
});

describe("reading a body", () => {
  async function body(init: RequestInit) {
    return readMobileBody(request("https://nybb.test/api/mobile/v1/orders", init));
  }

  it("parses JSON", async () => {
    const parsed = await body({ method: "POST", body: JSON.stringify({ method: "qrph" }) });
    expect(parsed).toEqual({ ok: true, value: { method: "qrph" } });
  });

  it("treats an empty body as an empty request, not a failure", async () => {
    // The arrival endpoint carries everything in the path and a header, so a
    // client that sends no body at all is behaving correctly.
    expect(await body({ method: "POST" })).toEqual({ ok: true, value: {} });
    expect(await body({ method: "POST", body: "   " })).toEqual({ ok: true, value: {} });
  });

  it("refuses a body that is not JSON", async () => {
    const parsed = await body({ method: "POST", body: "{not json" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.response.status).toBe(400);
  });

  it("refuses an oversized body on the claim, and again on the measurement", async () => {
    const lie = await body({
      method: "POST",
      body: "{}",
      headers: { "content-length": String(MAX_MOBILE_BODY_BYTES + 1) },
    });
    expect(lie.ok).toBe(false);

    const real = await body({
      method: "POST",
      body: JSON.stringify({ padding: "x".repeat(MAX_MOBILE_BODY_BYTES) }),
    });
    expect(real.ok).toBe(false);
    if (real.ok) return;
    expect(real.response.status).toBe(400);
  });
});

describe("where a payment sends the customer back to", () => {
  it("builds a deep link for the app, without a bearer token in it", () => {
    // The app already holds its tracking token. Putting a second copy through a
    // payment provider's redirect chain buys nothing and can be logged.
    const url = paymentReturnUrl("app", "NY-ABC234", "6f1b4f7c-1f6a-4e37-9f0e-9b0c2b3f5a11");
    expect(url).toBe("nybb-order://order/NY-ABC234");
    expect(url).not.toMatch(/6f1b4f7c/);
  });

  it("keeps the browser's existing return URL untouched", () => {
    const url = new URL(
      paymentReturnUrl("web", "NY-ABC234", "6f1b4f7c-1f6a-4e37-9f0e-9b0c2b3f5a11"),
    );
    expect(url.pathname).toBe("/order/NY-ABC234");
    expect(url.searchParams.get("t")).toBe("6f1b4f7c-1f6a-4e37-9f0e-9b0c2b3f5a11");
  });

  it("will not let an environment variable become an arbitrary scheme", () => {
    expect(mobileAppScheme(undefined)).toBe("nybb-order");
    expect(mobileAppScheme("nybb-staff")).toBe("nybb-staff");
    expect(mobileAppScheme("javascript:alert(1)//")).toBe("nybb-order");
    expect(mobileAppScheme("has space")).toBe("nybb-order");
    expect(mobileAppScheme("")).toBe("nybb-order");
  });
});
