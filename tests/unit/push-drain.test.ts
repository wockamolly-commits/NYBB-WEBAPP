import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomerNotifyResult } from "@/lib/push/dispatch";

const delivered = (count: number): CustomerNotifyResult => ({ ok: true, delivered: count });

const notifyCustomer = vi.fn<(orderId: string) => Promise<CustomerNotifyResult>>(
  async () => delivered(1),
);
const rpc = vi.fn();
const from = vi.fn();
const adminConfiguredMock = vi.fn(() => true);

vi.mock("@/lib/push/dispatch", () => ({ notifyCustomer }));
vi.mock("@/lib/supabase/admin-client", () => ({
  adminConfigured: () => adminConfiguredMock(),
  createAdminClient: () => ({ rpc, from }),
}));

afterEach(() => {
  // restoreAllMocks (not clearAllMocks), matching tests/unit/push-dispatch.test.ts:
  // a console.error spy installed by a failed assertion must not silence a
  // later test's real console.error calls.
  vi.restoreAllMocks();
  adminConfiguredMock.mockReturnValue(true);
});

/**
 * Stands in for `.from("notifications").update(...).eq("id", id)`. Records
 * every update call so a test can assert what was actually written back,
 * rather than trusting drain.ts's own account of it.
 */
function makeUpdateBuilder(spy: (values: Record<string, unknown>, id: number) => void) {
  let pendingValues: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {
    update: (values: Record<string, unknown>) => {
      pendingValues = values;
      return builder;
    },
    eq: (_column: string, id: number) => {
      spy(pendingValues, id);
      return Promise.resolve({ data: null, error: null });
    },
  };
  return builder;
}

describe("drainPushQueue", () => {
  it("does not touch the database when the admin client is unavailable", async () => {
    adminConfiguredMock.mockReturnValue(false);
    const { drainPushQueue } = await import("@/lib/push/drain");
    await expect(drainPushQueue()).resolves.toEqual({ sent: 0, failed: 0, delivered: 0 });
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("resolves with zero counts when the claim rpc rejects (database unreachable)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockRejectedValueOnce(new Error("connection refused"));
    const { drainPushQueue } = await import("@/lib/push/drain");
    await expect(drainPushQueue()).resolves.toEqual({ sent: 0, failed: 0, delivered: 0 });
    expect(notifyCustomer).not.toHaveBeenCalled();
  });

  it("resolves with zero counts when the claim rpc returns an error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: null, error: new Error("denied") });
    const { drainPushQueue } = await import("@/lib/push/drain");
    await expect(drainPushQueue()).resolves.toEqual({ sent: 0, failed: 0, delivered: 0 });
    expect(notifyCustomer).not.toHaveBeenCalled();
  });

  it("marks a queued row sent after notifyCustomer resolves", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ id: 7, payload: { order_id: "order-7" } }],
      error: null,
    });
    const updateSpy = vi.fn();
    from.mockImplementation((table: string) => {
      if (table === "notifications") return makeUpdateBuilder(updateSpy);
      throw new Error(`unexpected table ${table}`);
    });

    const { drainPushQueue } = await import("@/lib/push/drain");
    const result = await drainPushQueue();

    expect(result).toEqual({ sent: 1, failed: 0, delivered: 1 });
    expect(notifyCustomer).toHaveBeenCalledWith("order-7");
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [values, id] = updateSpy.mock.calls[0] as [Record<string, unknown>, number];
    expect(id).toBe(7);
    expect(values.status).toBe("sent");
    expect(typeof values.sent_at).toBe("string");
  });

  it("marks a row failed with last_error when notifyCustomer rejects", async () => {
    // notifyCustomer never rejects in production (Task 6's contract), but
    // drain.ts's own try/catch around the call is the last line before that
    // contract, the same defensive shape lib/push/dispatch.ts itself uses
    // around sendExpo/sendWeb. This proves that line actually does something,
    // not just that it exists.
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({
      data: [{ id: 9, payload: { order_id: "order-9" } }],
      error: null,
    });
    notifyCustomer.mockRejectedValueOnce(new Error("boom"));
    const updateSpy = vi.fn();
    from.mockImplementation((table: string) => {
      if (table === "notifications") return makeUpdateBuilder(updateSpy);
      throw new Error(`unexpected table ${table}`);
    });

    const { drainPushQueue } = await import("@/lib/push/drain");
    const result = await drainPushQueue();

    expect(result).toEqual({ sent: 0, failed: 1, delivered: 0 });
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [values, id] = updateSpy.mock.calls[0] as [Record<string, unknown>, number];
    expect(id).toBe(9);
    expect(values.status).toBe("failed");
    expect(values.last_error).toBe("boom");
  });

  it("marks a row failed when notifyCustomer says it could not send, without any throw", async () => {
    // The case the whole result type exists for, and the one that used to be
    // counted `sent`. notifyCustomer resolves here, as it always does; the only
    // thing saying nobody was told is its answer. If drain.ts stops reading
    // that answer, this test fails and the one below it does not.
    rpc.mockResolvedValueOnce({
      data: [{ id: 21, payload: { order_id: "order-21" } }],
      error: null,
    });
    notifyCustomer.mockResolvedValueOnce({ ok: false, reason: "subscription_lookup_failed" });
    const updateSpy = vi.fn();
    from.mockImplementation((table: string) => {
      if (table === "notifications") return makeUpdateBuilder(updateSpy);
      throw new Error(`unexpected table ${table}`);
    });

    const { drainPushQueue } = await import("@/lib/push/drain");
    const result = await drainPushQueue();

    expect(result).toEqual({ sent: 0, failed: 1, delivered: 0 });
    const [values, id] = updateSpy.mock.calls[0] as [Record<string, unknown>, number];
    expect(id).toBe(21);
    expect(values.status).toBe("failed");
    // The reason, not a generic string: it is what somebody reading
    // notifications.last_error has to work from a week later.
    expect(values.last_error).toBe("subscription_lookup_failed");
  });

  it("counts a row with no registered device as sent, and as nobody reached", async () => {
    // A customer who never turned notifications on. Not a failure, because no
    // retry could ever fix it, and not a delivery either. Reporting it as
    // `sent: 1, delivered: 0` is the distinction that makes "failed: 0" in the
    // cron response stop meaning "everybody was told".
    rpc.mockResolvedValueOnce({
      data: [{ id: 23, payload: { order_id: "order-23" } }],
      error: null,
    });
    notifyCustomer.mockResolvedValueOnce(delivered(0));
    const updateSpy = vi.fn();
    from.mockImplementation((table: string) => {
      if (table === "notifications") return makeUpdateBuilder(updateSpy);
      throw new Error(`unexpected table ${table}`);
    });

    const { drainPushQueue } = await import("@/lib/push/drain");
    const result = await drainPushQueue();

    expect(result).toEqual({ sent: 1, failed: 0, delivered: 0 });
    const [values] = updateSpy.mock.calls[0] as [Record<string, unknown>, number];
    expect(values.status).toBe("sent");
  });

  it("sums delivered across a batch rather than counting rows", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        { id: 31, payload: { order_id: "a" } },
        { id: 32, payload: { order_id: "b" } },
      ],
      error: null,
    });
    notifyCustomer.mockResolvedValueOnce(delivered(2));
    notifyCustomer.mockResolvedValueOnce(delivered(1));
    from.mockImplementation((table: string) => {
      if (table === "notifications") return makeUpdateBuilder(() => {});
      throw new Error(`unexpected table ${table}`);
    });

    const { drainPushQueue } = await import("@/lib/push/drain");
    // Two orders, three phones. Somebody is tracking one of these on two
    // devices, which push_subscription_orders exists to allow.
    expect(await drainPushQueue()).toEqual({ sent: 2, failed: 0, delivered: 3 });
  });

  it("marks a row failed without calling notifyCustomer when the payload has no order_id", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ id: 11, payload: { not_order_id: "x" } }],
      error: null,
    });
    const updateSpy = vi.fn();
    from.mockImplementation((table: string) => {
      if (table === "notifications") return makeUpdateBuilder(updateSpy);
      throw new Error(`unexpected table ${table}`);
    });

    const { drainPushQueue } = await import("@/lib/push/drain");
    const result = await drainPushQueue();

    expect(result).toEqual({ sent: 0, failed: 1, delivered: 0 });
    expect(notifyCustomer).not.toHaveBeenCalled();
    const [values] = updateSpy.mock.calls[0] as [Record<string, unknown>, number];
    expect(values.status).toBe("failed");
    expect(typeof values.last_error).toBe("string");
  });

  it("passes the requested limit to the claim rpc, defaulting to 50", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const { drainPushQueue } = await import("@/lib/push/drain");
    await drainPushQueue();
    expect(rpc).toHaveBeenCalledWith("claim_queued_push_notifications", { p_limit: 50 });

    rpc.mockResolvedValueOnce({ data: [], error: null });
    await drainPushQueue(5);
    expect(rpc).toHaveBeenCalledWith("claim_queued_push_notifications", { p_limit: 5 });
  });

  it("processes multiple claimed rows and tallies sent and failed independently", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        { id: 1, payload: { order_id: "a" } },
        { id: 2, payload: { order_id: "b" } },
      ],
      error: null,
    });
    const updateSpy = vi.fn();
    from.mockImplementation((table: string) => {
      if (table === "notifications") return makeUpdateBuilder(updateSpy);
      throw new Error(`unexpected table ${table}`);
    });
    notifyCustomer.mockImplementationOnce(async () => delivered(1));
    notifyCustomer.mockImplementationOnce(async () => {
      throw new Error("transport down");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { drainPushQueue } = await import("@/lib/push/drain");
    const result = await drainPushQueue();

    expect(result).toEqual({ sent: 1, failed: 1, delivered: 1 });
  });

  it("never logs the notification payload, only static error messages", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({
      data: [{ id: 13, payload: { order_id: "13333333-3333-4333-8333-333333333333" } }],
      error: null,
    });
    notifyCustomer.mockRejectedValueOnce(new Error("boom"));
    from.mockImplementation((table: string) => {
      if (table === "notifications") return makeUpdateBuilder(() => {});
      throw new Error(`unexpected table ${table}`);
    });

    const { drainPushQueue } = await import("@/lib/push/drain");
    await drainPushQueue();

    for (const call of errorSpy.mock.calls) {
      const joined = call
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ");
      expect(joined).not.toContain("13333333-3333-4333-8333-333333333333");
    }
  });
});
