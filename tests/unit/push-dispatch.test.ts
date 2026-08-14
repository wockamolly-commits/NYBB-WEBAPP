import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExpoTarget } from "@/lib/push/expo";
import type { PushPayload } from "@/lib/push/payload";
import type { WebTarget } from "@/lib/push/web";

/**
 * Both carry the real signature as a type parameter. Without it the mock types
 * as taking no arguments, `mock.calls[0]` types as `[]`, and reading what the
 * dispatcher actually sent needs a cast that TypeScript rejects outright.
 */
const sendExpo = vi.fn<(targets: ExpoTarget[], payload: PushPayload) => Promise<string[]>>(
  async () => [],
);
const sendWeb = vi.fn<(targets: WebTarget[], payload: PushPayload) => Promise<string[]>>(
  async () => [],
);
const rpc = vi.fn();
const from = vi.fn();
const adminConfiguredMock = vi.fn(() => true);

vi.mock("@/lib/push/expo", () => ({ sendExpo }));
vi.mock("@/lib/push/web", () => ({ sendWeb }));
vi.mock("@/lib/supabase/admin-client", () => ({
  adminConfigured: () => adminConfiguredMock(),
  createAdminClient: () => ({ rpc, from }),
}));

afterEach(() => {
  // restoreAllMocks (not clearAllMocks) so a console.error spy from a failed
  // assertion earlier in the file cannot outlive its test: clearAllMocks
  // resets call history but leaves an installed spy's implementation in
  // place, which would silence every console.error after the first failure.
  vi.restoreAllMocks();
  adminConfiguredMock.mockReturnValue(true);
});

const orderId = "11111111-1111-4111-8111-111111111111";

/**
 * A stand-in for the Postgrest query builder. Every method returns the
 * builder itself so chains of arbitrary length type-check, and the builder is
 * thenable so `await` works whether the caller stops at `.maybeSingle()` or
 * just awaits the builder directly, matching how supabase-js resolves a query.
 */
function makeSelectBuilder(result: unknown) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return builder;
}

/**
 * `push_subscriptions` is both read from (to find who to notify) and written
 * to (to delete dead endpoints), through the same `.from("push_subscriptions")`
 * call. This tracks which verb was chained so one mock can stand in for both,
 * and records what `.delete().in(...)` was called with.
 */
function makeSubscriptionsBuilder(
  selectRows: { endpoint: string }[],
  deleteSpy: (endpoints: string[]) => void,
) {
  let mode: "select" | "delete" = "select";
  const builder: Record<string, unknown> = {
    select: () => {
      mode = "select";
      return builder;
    },
    delete: () => {
      mode = "delete";
      return builder;
    },
    eq: () => builder,
    in: (_column: string, values: string[]) => {
      deleteSpy(values);
      return builder;
    },
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(
        mode === "select"
          ? { data: selectRows, error: null }
          : { data: null, error: null },
      ).then(resolve),
  };
  return builder;
}

describe("notifyCustomer", () => {
  it("resolves rather than throwing when the lookup fails", async () => {
    // This deliberately drives the error-logging path, so stub console.error
    // the same way the token-logging test does: test output should be
    // pristine, not a stray "order lookup failed" line in the middle of a run.
    // afterEach restores it, so no assignment or restore call is needed here.
    vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockReturnValue(
      makeSelectBuilder({ data: null, error: new Error("down") }),
    );
    const { notifyCustomer } = await import("@/lib/push/dispatch");
    // Resolves, and says which failure it was. The drain writes that reason
    // into notifications.last_error, so "resolved" alone is not the contract.
    await expect(notifyCustomer(orderId)).resolves.toEqual({
      ok: false,
      reason: "order_lookup_failed",
    });
    expect(sendExpo).not.toHaveBeenCalled();
  });

  it("resolves rather than throwing when the transport throws", async () => {
    // sendExpo itself never rejects in production (Task 5's contract), but
    // this proves the dispatcher does not depend on that: if it somehow did,
    // the surrounding try/catch still has to keep the promise from rejecting.
    // The outer catch logs, so stub console.error to keep test output clean.
    // afterEach restores it, so no assignment or restore call is needed here.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const orderRow = {
      data: {
        short_code: "NY-ABC234",
        tracking_token: "55555555-5555-4555-8555-555555555555",
        status: "ready",
        accepted_at: null,
        preparing_at: null,
        ready_at: "2026-08-13T01:20:00Z",
        claimed_at: null,
        rejected_at: null,
        rejected_reason: null,
        cancelled_at: null,
        cancelled_reason: null,
        customer_arrived_at: null,
        no_show_at: null,
        payments: null,
      },
      error: null,
    };
    from.mockImplementation((table: string) => {
      if (table === "orders") return makeSelectBuilder(orderRow);
      if (table === "push_subscriptions") {
        return makeSubscriptionsBuilder(
          [{ endpoint: "ExponentPushToken[live]" }],
          vi.fn(),
        );
      }
      throw new Error(`unexpected table ${table}`);
    });
    sendExpo.mockRejectedValueOnce(new Error("boom"));

    const { notifyCustomer } = await import("@/lib/push/dispatch");
    await expect(notifyCustomer(orderId)).resolves.toEqual({
      ok: false,
      reason: "unexpected_error",
    });
    expect(sendExpo).toHaveBeenCalledTimes(1);
  });

  it("does not touch the database when the admin client is unavailable", async () => {
    adminConfiguredMock.mockReturnValue(false);
    const { notifyCustomer } = await import("@/lib/push/dispatch");
    await expect(notifyCustomer(orderId)).resolves.toEqual({
      ok: false,
      reason: "admin_unconfigured",
    });
    expect(from).not.toHaveBeenCalled();
    expect(sendExpo).not.toHaveBeenCalled();
  });

  it("sends the built payload to the order's expo endpoints and deletes what comes back dead", async () => {
    const orderRow = {
      data: {
        short_code: "NY-ABC234",
        tracking_token: "22222222-2222-4222-8222-222222222222",
        status: "ready",
        accepted_at: "2026-08-13T01:00:00Z",
        preparing_at: "2026-08-13T01:05:00Z",
        ready_at: "2026-08-13T01:20:00Z",
        claimed_at: null,
        rejected_at: null,
        rejected_reason: null,
        cancelled_at: null,
        cancelled_reason: null,
        customer_arrived_at: null,
        no_show_at: null,
        payments: {
          method: "counter",
          status: "due",
          amount_cents: "45000",
          paid_at: null,
        },
      },
      error: null,
    };
    const deleteSpy = vi.fn();
    from.mockImplementation((table: string) => {
      if (table === "orders") return makeSelectBuilder(orderRow);
      if (table === "push_subscriptions") {
        return makeSubscriptionsBuilder(
          [
            { endpoint: "ExponentPushToken[live]" },
            { endpoint: "ExponentPushToken[dead]" },
          ],
          deleteSpy,
        );
      }
      throw new Error(`unexpected table ${table}`);
    });
    sendExpo.mockResolvedValueOnce(["ExponentPushToken[dead]"]);

    const { notifyCustomer } = await import("@/lib/push/dispatch");
    // Two endpoints registered, one of them dead, so one device was actually
    // reached. `delivered` counting targets rather than survivors would report
    // 2 here and tell the drain a phone was rung that was not.
    await expect(notifyCustomer(orderId)).resolves.toEqual({ ok: true, delivered: 1 });

    expect(sendExpo).toHaveBeenCalledTimes(1);
    const [targets, payload] = sendExpo.mock.calls[0];
    expect(targets).toEqual([
      { endpoint: "ExponentPushToken[live]" },
      { endpoint: "ExponentPushToken[dead]" },
    ]);
    // The tracking token belongs in the url the customer's device receives,
    // never in a log line, so this is the one place the test is allowed to
    // read it back.
    expect(payload.url).toContain("22222222-2222-4222-8222-222222222222");
    expect(deleteSpy).toHaveBeenCalledWith(["ExponentPushToken[dead]"]);
  });

  it("never logs the tracking token, even when it has to log an error after reading the order", async () => {
    // The order read succeeds first, so the token is genuinely in hand (it is
    // part of the CustomerPayloadOrder built from this row) by the time the
    // next query fails and something gets logged. A scenario that fails
    // before the order is ever read would pass this assertion by proving
    // nothing, the same way the first version of this test did.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const orderRow = {
      data: {
        short_code: "NY-ABC234",
        tracking_token: "33333333-3333-4333-8333-333333333333",
        status: "ready",
        accepted_at: null,
        preparing_at: null,
        ready_at: "2026-08-13T01:20:00Z",
        claimed_at: null,
        rejected_at: null,
        rejected_reason: null,
        cancelled_at: null,
        cancelled_reason: null,
        customer_arrived_at: null,
        no_show_at: null,
        payments: null,
      },
      error: null,
    };
    from.mockImplementation((table: string) => {
      if (table === "orders") return makeSelectBuilder(orderRow);
      if (table === "push_subscriptions") {
        return makeSelectBuilder({
          data: null,
          error: new Error("subscriptions down"),
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const { notifyCustomer } = await import("@/lib/push/dispatch");
    await notifyCustomer(orderId);

    // Vacuous otherwise: a spy nothing ever calls proves nothing about what
    // it would have logged.
    expect(errorSpy).toHaveBeenCalled();
    for (const call of errorSpy.mock.calls) {
      // Object arguments (a payload, an order row, a zod issue list) render as
      // "[object Object]" under String(), which would hide a token nested in
      // one. JSON.stringify actually surfaces the content of anything that
      // isn't already a plain string.
      const joined = call
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ");
      expect(joined).not.toContain("33333333-3333-4333-8333-333333333333");
    }
  });
});

describe("notifyStaffOfNewOrder", () => {
  it("resolves rather than throwing when staff_push_targets fails", async () => {
    // Reaching staff_push_targets is the whole point of this test, so give
    // every table its own real shape (order_items included) instead of one
    // from.mockReturnValue() standing in for all of them. Before this fix the
    // order_items select got the order row's shape, failed to parse as an
    // array, and the function returned before rpc was ever called: the test
    // passed for a reason unrelated to its name.
    // afterEach restores the spy, so no assignment or restore call is needed
    // here; only failing to reach the rpc call would be a real regression.
    vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockImplementation((table: string) => {
      if (table === "orders") {
        return makeSelectBuilder({
          data: {
            short_code: "NY-ABC234",
            branch_id: "44444444-4444-4444-8444-444444444444",
            branches: { short_name: "Katipunan" },
            pickup_slots: null,
          },
          error: null,
        });
      }
      if (table === "order_items") {
        return makeSelectBuilder({ data: [{ qty: 1 }], error: null });
      }
      throw new Error(`unexpected table ${table}`);
    });
    rpc.mockResolvedValue({ data: null, error: new Error("denied") });
    const { notifyStaffOfNewOrder } = await import("@/lib/push/dispatch");
    await expect(notifyStaffOfNewOrder(orderId)).resolves.toBeUndefined();
    // Proves the targetsError branch (dispatch.ts:319-325) was actually
    // reached, not skipped on the way there.
    expect(rpc).toHaveBeenCalled();
    expect(sendWeb).not.toHaveBeenCalled();
  });

  it("does not touch the database when the admin client is unavailable", async () => {
    adminConfiguredMock.mockReturnValue(false);
    const { notifyStaffOfNewOrder } = await import("@/lib/push/dispatch");
    await expect(notifyStaffOfNewOrder(orderId)).resolves.toBeUndefined();
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(sendWeb).not.toHaveBeenCalled();
  });

  it("sums item quantities, calls staff_push_targets for the branch, and deletes dead endpoints", async () => {
    const orderRow = {
      data: {
        short_code: "NY-ABC234",
        branch_id: "44444444-4444-4444-8444-444444444444",
        branches: { short_name: "Katipunan" },
        pickup_slots: { slot_start: "2026-08-13T02:00:00Z" },
      },
      error: null,
    };
    const itemRows = { data: [{ qty: 2 }, { qty: 3 }], error: null };
    const deleteSpy = vi.fn();
    from.mockImplementation((table: string) => {
      if (table === "orders") return makeSelectBuilder(orderRow);
      if (table === "order_items") return makeSelectBuilder(itemRows);
      if (table === "push_subscriptions") {
        return makeSubscriptionsBuilder([], deleteSpy);
      }
      throw new Error(`unexpected table ${table}`);
    });
    rpc.mockResolvedValue({
      data: [{ endpoint: "https://web.push/live", p256dh: "p", auth_key: "a" }],
      error: null,
    });
    sendWeb.mockResolvedValueOnce(["https://web.push/live"]);

    const { notifyStaffOfNewOrder } = await import("@/lib/push/dispatch");
    await notifyStaffOfNewOrder(orderId);

    expect(rpc).toHaveBeenCalledWith("staff_push_targets", {
      p_branch_id: "44444444-4444-4444-8444-444444444444",
    });
    expect(sendWeb).toHaveBeenCalledTimes(1);
    const [targets, payload] = sendWeb.mock.calls[0];
    expect(targets).toEqual([
      { endpoint: "https://web.push/live", p256dh: "p", auth_key: "a" },
    ]);
    expect(payload.title).toContain("NY-ABC234");
    // itemCount is the sole derived value notifyStaffOfNewOrder computes (a
    // sum of qty across the two order_items rows, 2 + 3 = 5), and it lands in
    // body, not title. Asserting only the title, as this test previously did,
    // never checks the summing at all.
    expect(payload.body).toContain("5 items");
    expect(deleteSpy).toHaveBeenCalledWith(["https://web.push/live"]);
  });
});
