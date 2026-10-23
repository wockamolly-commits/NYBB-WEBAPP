import { describe, expect, it, vi } from "vitest";
import { subscribeForPush, vapidKeyBytes } from "@/lib/push/browser";

// Two distinct 65-byte P-256 public keys, base64url encoded.
const KEY = "B" + "A".repeat(86);
const OLD_KEY = "B" + "Q".repeat(86);

type FakeSub = { options: { applicationServerKey: ArrayBuffer | null }; unsubscribe: () => Promise<boolean> };

function fakeManager(held: { key: string | null; readable: boolean } | null) {
  let current: FakeSub | null = null;
  const make = (key: string | null, readable: boolean): FakeSub => {
    const sub: FakeSub = {
      options: { applicationServerKey: readable && key ? vapidKeyBytes(key).buffer : null },
      unsubscribe: vi.fn(async () => {
        current = null;
        return true;
      }),
    };
    (sub as FakeSub & { key: string | null }).key = key;
    return sub;
  };
  if (held) current = make(held.key, held.readable);

  const manager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async (options: { applicationServerKey: Uint8Array }) => {
      const asked = Buffer.from(options.applicationServerKey).toString("base64");
      if (current) {
        const heldKey = (current as FakeSub & { key: string | null }).key;
        const heldB64 = heldKey ? Buffer.from(vapidKeyBytes(heldKey)).toString("base64") : null;
        if (heldB64 !== asked) {
          throw new DOMException(
            "A subscription with a different applicationServerKey (or gcm_sender_id) already exists",
            "InvalidStateError",
          );
        }
        return current;
      }
      current = make(KEY, true);
      return current;
    }),
  };
  return { manager: manager as unknown as PushManager, raw: manager, initial: () => current };
}

describe("subscribeForPush", () => {
  it("subscribes a browser that holds nothing", async () => {
    const { manager, raw } = fakeManager(null);
    await expect(subscribeForPush(manager, KEY)).resolves.toBeTruthy();
    expect(raw.subscribe).toHaveBeenCalledTimes(1);
  });

  it("reuses a subscription made with the same key", async () => {
    const { manager, initial } = fakeManager({ key: KEY, readable: true });
    const before = initial();
    const result = await subscribeForPush(manager, KEY);
    expect(result).toBe(before);
    expect(before!.unsubscribe).not.toHaveBeenCalled();
  });

  it("replaces a subscription made with a different, readable key", async () => {
    const { manager, raw, initial } = fakeManager({ key: OLD_KEY, readable: true });
    const stale = initial();
    await expect(subscribeForPush(manager, KEY)).resolves.toBeTruthy();
    expect(stale!.unsubscribe).toHaveBeenCalledTimes(1);
    expect(raw.subscribe).toHaveBeenCalledTimes(1);
  });

  it("recovers from InvalidStateError when the held key cannot be read", async () => {
    const { manager, raw, initial } = fakeManager({ key: OLD_KEY, readable: false });
    const stale = initial();
    await expect(subscribeForPush(manager, KEY)).resolves.toBeTruthy();
    expect(stale!.unsubscribe).toHaveBeenCalledTimes(1);
    expect(raw.subscribe).toHaveBeenCalledTimes(2);
  });

  it("does not swallow other failures", async () => {
    const { manager, raw } = fakeManager(null);
    raw.subscribe.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    await expect(subscribeForPush(manager, KEY)).rejects.toThrow("denied");
  });
});
