import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioural cover for the condition, not just the import.
 *
 * tests/unit/push-triggers.test.ts is a source-level tripwire: it proves
 * `after` and `notifyCustomer` are still wired into actions.ts at all. It
 * cannot catch someone moving the `if (status === "ready")` guard, or
 * flipping it to `"preparing"`, because the string "notifyCustomer" would
 * still appear in the file either way. This file drives the real exported
 * Server Actions with every network dependency mocked, and asserts on the
 * one thing a customer actually experiences: whether their phone buzzes.
 */

const after = vi.fn((promise: Promise<unknown>) => promise);
const revalidatePath = vi.fn();
const notifyCustomer = vi.fn(async () => {});
const rpc = vi.fn(async () => ({ data: null, error: null }));
const hasStaffPermission = vi.fn(() => true);
const getStaffProfile = vi.fn(async () => ({
  id: "22222222-2222-4222-8222-222222222222",
  role: "staff" as const,
  staffRole: "cashier" as const,
  displayName: "Test Cashier",
  branchId: null as string | null,
  permissions: [] as string[],
}));

vi.mock("next/server", () => ({
  after: (promise: Promise<unknown>) => after(promise),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));
vi.mock("@/lib/push/dispatch", () => ({
  notifyCustomer: (orderId: string) => notifyCustomer(orderId),
}));
vi.mock("@/lib/staff/session", () => ({
  getStaffProfile: () => getStaffProfile(),
  hasStaffPermission: (...args: unknown[]) => hasStaffPermission(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createStaffClient: async () => ({ rpc: (...args: unknown[]) => rpc(...args) }),
}));

const { claimOrder, markOrderReady, rejectOrder, startOrder } = await import(
  "@/app/(workspace)/workspace/orders/actions"
);

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: null, error: null });
  hasStaffPermission.mockReturnValue(true);
});

describe("who setStatus and rejectOrder tell", () => {
  it("notifies the customer exactly once when an order is marked ready", async () => {
    const result = await markOrderReady(ORDER_ID);
    expect(result.ok).toBe(true);
    expect(notifyCustomer).toHaveBeenCalledTimes(1);
    expect(notifyCustomer).toHaveBeenCalledWith(ORDER_ID);
    expect(after).toHaveBeenCalledTimes(1);
  });

  // preparing is something staff just did and the customer already knows
  // they placed the order; claimed is them standing at the counter for it.
  // Neither is worth a notification, and this is the test that would break
  // if that guard moved or flipped.
  it("stays silent when an order starts preparing", async () => {
    const result = await startOrder(ORDER_ID);
    expect(result.ok).toBe(true);
    expect(notifyCustomer).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("stays silent when an order is claimed at the counter", async () => {
    const result = await claimOrder(ORDER_ID, "1234");
    expect(result.ok).toBe(true);
    expect(notifyCustomer).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("notifies the customer exactly once when an order is refused", async () => {
    const result = await rejectOrder(ORDER_ID, "sold_out");
    expect(result.ok).toBe(true);
    expect(notifyCustomer).toHaveBeenCalledTimes(1);
    expect(notifyCustomer).toHaveBeenCalledWith(ORDER_ID);
    expect(after).toHaveBeenCalledTimes(1);
  });
});
