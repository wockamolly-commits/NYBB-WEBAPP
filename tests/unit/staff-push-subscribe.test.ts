import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const createStaffClient = vi.fn(async () => ({ rpc }));
const supabaseConfigured = vi.fn(() => true);

vi.mock("@/lib/supabase/server", () => ({
  createStaffClient: () => createStaffClient(),
  supabaseConfigured: () => supabaseConfigured(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  rpc.mockReset();
  createStaffClient.mockClear();
  supabaseConfigured.mockReturnValue(true);
});

const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
};

/**
 * The counter tablet's half of the staff subscription, on the server's side.
 *
 * The interesting claims are not "does it work". They are that the three
 * parameter names this sends match `register_staff_push_subscription`'s
 * signature in `0038_push_registration.sql` (a rename on either side is
 * silent, and the symptom is a tablet that never rings), that a refusal from
 * the database is a refusal here, and that nothing reaches the database until
 * the body has been read as a real subscription.
 */
async function register(input: unknown) {
  const { registerStaffSubscription } = await import("@/lib/staff/push");
  return registerStaffSubscription(input);
}

describe("registerStaffSubscription", () => {
  it("hands the database exactly the three parameters its signature names", async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    expect(await register(subscription)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("register_staff_push_subscription", {
      p_endpoint: subscription.endpoint,
      p_p256dh: subscription.p256dh,
      p_auth_key: subscription.auth,
    });
  });

  it("speaks as the staff member, never as the admin client", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await register(subscription);

    // The permission check inside the function reads auth.uid(). An admin
    // client would hand it a null uid and the check would be decided here
    // instead of in the database.
    expect(createStaffClient).toHaveBeenCalledTimes(1);
  });

  it("treats a false from the function as a refusal, not a success", async () => {
    // false is what the function returns for a signed-out caller and for a
    // staff member without orders:view. Neither is an error row.
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await register(subscription)).toEqual({
      ok: false,
      error: "We could not turn on alerts on this device. Please try again.",
    });
  });

  it("refuses a body that is not a subscription without asking the database", async () => {
    for (const bad of [
      null,
      {},
      { ...subscription, endpoint: "not-a-url" },
      { ...subscription, p256dh: "" },
      { endpoint: subscription.endpoint, p256dh: subscription.p256dh },
    ]) {
      expect((await register(bad)).ok).toBe(false);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never prints the keys that let anyone send to this device", async () => {
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied for schema public" } });

    expect((await register(subscription)).ok).toBe(false);
    // Forces the log to actually happen, so this is not passing because
    // nothing was written at all.
    expect(logged.length).toBeGreaterThan(0);
    for (const line of logged) {
      expect(line).not.toContain(subscription.p256dh);
      expect(line).not.toContain(subscription.auth);
      expect(line).not.toContain(subscription.endpoint);
    }
  });

  it("says the same thing when Supabase is not configured at all", async () => {
    supabaseConfigured.mockReturnValue(false);
    expect((await register(subscription)).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
