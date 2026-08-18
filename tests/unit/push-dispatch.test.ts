import { afterEach, describe, expect, it, vi } from "vitest";
import type { PushPayload } from "@/lib/push/payload";
import type { WebTarget } from "@/lib/push/web";

/**
 * Carries the real signature as a type parameter. Without it the mock types
 * as taking no arguments, `mock.calls[0]` types as `[]`, and reading what the
 * dispatcher actually sent needs a cast that TypeScript rejects outright.
 */
const sendWeb = vi.fn<(targets: WebTarget[], payload: PushPayload) => Promise<string[]>>(
  async () => [],
);
const rpc = vi.fn();
const from = vi.fn();
const adminConfiguredMock = vi.fn(() => true);

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
  it("sends to the order's web endpoints and deletes what comes back dead", async () => {
    const { notifyCustomer } = await import("@/lib/push/dispatch");

    const order = {
      short_code: "NY-ABC234",
      tracking_token: "11111111-1111-4111-8111-111111111111",
      status: "ready",
      accepted_at: null, preparing_at: null, ready_at: null, claimed_at: null,
      rejected_at: null, rejected_reason: null, cancelled_at: null,
      cancelled_reason: null, customer_arrived_at: null, no_show_at: null,
      payments: { method: "qrph", status: "paid", amount_cents: 45000, paid_at: null },
    };
    const subscriptions = [
      { endpoint: "https://push.example/live", p256dh: "a", auth_key: "b" },
      { endpoint: "https://push.example/dead", p256dh: "c", auth_key: "d" },
    ];

    const deleted: string[][] = [];
    // Records every `.eq()` rather than counting them, so this survives a
    // filter being added and, more to the point, FAILS if one is removed. The
    // first version of this mock hard-coded a two-link chain and asserted only
    // `targets.length`, which meant it would have passed just the same if the
    // query had dropped a filter or a keypair column.
    const filters: [string, unknown][] = [];
    from.mockImplementation((table: string) => {
      if (table === "orders") return makeSelectBuilder({ data: order, error: null });
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        delete: () => ({
          in: (_column: string, values: string[]) => {
            deleted.push(values);
            return Promise.resolve({ error: null });
          },
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: subscriptions, error: null }).then(resolve),
      };
      return builder;
    });
    sendWeb.mockResolvedValue(["https://push.example/dead"]);

    const result = await notifyCustomer(orderId);

    expect(result).toEqual({ ok: true, delivered: 1 });

    // The staff tablet and a customer's phone are both `transport = 'web'` rows
    // in one table, so `audience` is the only thing standing between a counter
    // tablet and a stranger's order status. Asserted by name, not by count.
    expect(filters).toContainEqual(["audience", "customer"]);
    expect(filters).toContainEqual(["transport", "web"]);
    expect(filters).toContainEqual(["push_subscription_orders.order_code", "NY-ABC234"]);

    // The whole target, not its length. `sendWeb` cannot encrypt without both
    // keys, so a mapping that silently dropped one would be a send that never
    // arrives, and the old length-only assertion could not see it.
    expect(sendWeb.mock.calls[0]?.[0]).toEqual([
      { endpoint: "https://push.example/live", p256dh: "a", auth_key: "b" },
      { endpoint: "https://push.example/dead", p256dh: "c", auth_key: "d" },
    ]);
    expect(sendWeb.mock.calls[0]?.[1].audience).toBe("customer");
    expect(deleted).toEqual([["https://push.example/dead"]]);
  });

  it("resolves rather than throwing when the lookup fails", async () => {
    const { notifyCustomer } = await import("@/lib/push/dispatch");
    vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockImplementation(() =>
      makeSelectBuilder({ data: null, error: { message: "boom" } }),
    );

    await expect(notifyCustomer(orderId)).resolves.toEqual({
      ok: false,
      reason: "order_lookup_failed",
    });
  });

  it("does not touch the database when the admin client is unavailable", async () => {
    const { notifyCustomer } = await import("@/lib/push/dispatch");
    adminConfiguredMock.mockReturnValue(false);

    await expect(notifyCustomer(orderId)).resolves.toEqual({
      ok: false,
      reason: "admin_unconfigured",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("never logs the tracking token when it has to log an unreadable row", async () => {
    const { notifyCustomer } = await import("@/lib/push/dispatch");
    const token = "11111111-1111-4111-8111-111111111111";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockImplementation(() =>
      makeSelectBuilder({
        data: { short_code: "NY-ABC234", tracking_token: token, status: "nonsense" },
        error: null,
      }),
    );

    const result = await notifyCustomer(orderId);

    expect(result).toEqual({ ok: false, reason: "order_unreadable" });
    const logged = spy.mock.calls.flat().map((v) => JSON.stringify(v)).join(" ");
    expect(logged).not.toContain(token);
    spy.mockRestore();
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
