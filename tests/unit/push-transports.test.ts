import { afterEach, describe, expect, it, vi } from "vitest";
import { assertVapidKey } from "@/lib/push/vapid";
import { sendExpo } from "@/lib/push/expo";

const payload = {
  title: "Ready for collection",
  body: "It is up and waiting at the counter.",
  url: "/order/NY-ABC234?t=token",
  tag: "NY-ABC234",
  requireInteraction: true,
  renotify: true,
  vibrate: [120, 60, 120],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("assertVapidKey", () => {
  // A wrong key makes the opt-in button vanish with no error anywhere, which is
  // why spec section 15 makes this a hard rule rather than a nicety.
  it("accepts an 87 character key", () => {
    expect(() => assertVapidKey("k".repeat(87))).not.toThrow();
  });

  it("throws loudly on any other length", () => {
    expect(() => assertVapidKey("k".repeat(86))).toThrow(/87/);
    expect(() => assertVapidKey("")).toThrow(/87/);
  });

  it("says nothing when the key is absent, because that is a feature being off", () => {
    expect(() => assertVapidKey(undefined)).not.toThrow();
  });
});

describe("sendExpo", () => {
  it("reports a dead token so its row can be deleted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: [{ status: "error", details: { error: "DeviceNotRegistered" } }],
    }), { status: 200 })));

    const dead = await sendExpo([{ endpoint: "ExponentPushToken[gone]" }], payload);
    expect(dead).toEqual(["ExponentPushToken[gone]"]);
  });

  it("reports nothing dead on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: [{ status: "ok", id: "receipt-1" }],
    }), { status: 200 })));

    expect(await sendExpo([{ endpoint: "ExponentPushToken[live]" }], payload)).toEqual([]);
  });

  it("reports nothing dead on a server error, because a 500 is not a verdict", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    expect(await sendExpo([{ endpoint: "ExponentPushToken[live]" }], payload)).toEqual([]);
  });

  it("never rejects when the network is gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNRESET");
    }));
    await expect(sendExpo([{ endpoint: "ExponentPushToken[live]" }], payload)).resolves.toEqual([]);
  });

  it("sends nothing and calls nothing for an empty target list", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendExpo([], payload)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
