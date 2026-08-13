import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertVapidKey } from "@/lib/push/vapid";
import { sendExpo } from "@/lib/push/expo";

// web-push is a CommonJS module without named exports here, so the mock
// shape has to work whether the interop resolves to `.default` or to the
// module namespace directly.
vi.mock("web-push", () => {
  const sendNotification = vi.fn();
  const setVapidDetails = vi.fn();
  const webpushExports = { sendNotification, setVapidDetails };
  return { default: webpushExports, ...webpushExports };
});

import webpush from "web-push";
import { sendWeb } from "@/lib/push/web";

const VALID_VAPID_KEY = "k".repeat(87);

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
  });

  it("says nothing when the key is absent or empty, because that is a feature being off", () => {
    expect(() => assertVapidKey(undefined)).not.toThrow();
    expect(() => assertVapidKey("")).not.toThrow();
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

describe("sendWeb", () => {
  const target = { endpoint: "https://push.example/abc", p256dh: "p256dh-key", auth_key: "auth-key" };

  beforeEach(() => {
    vi.mocked(webpush.sendNotification).mockReset();
    vi.mocked(webpush.setVapidDetails).mockReset();
    // A valid-length key here is incidental: sendWeb only checks that the
    // three VAPID variables are set, not their length. assertVapidKey is a
    // separate, startup-only concern.
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", VALID_VAPID_KEY);
    vi.stubEnv("VAPID_PRIVATE_KEY", "private-key");
    vi.stubEnv("VAPID_SUBJECT", "mailto:you@example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports a 410 endpoint as dead, so its row can be deleted", async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(
      Object.assign(new Error("gone"), { statusCode: 410 }),
    );
    expect(await sendWeb([target], payload)).toEqual([target.endpoint]);
  });

  it("reports a 404 endpoint as dead, the same as a 410", async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(
      Object.assign(new Error("not found"), { statusCode: 404 }),
    );
    expect(await sendWeb([target], payload)).toEqual([target.endpoint]);
  });

  it("reports nothing dead on a server error, because a 500 is not a verdict", async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(
      Object.assign(new Error("boom"), { statusCode: 500 }),
    );
    expect(await sendWeb([target], payload)).toEqual([]);
  });

  it("never rejects when the network is gone", async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(sendWeb([target], payload)).resolves.toEqual([]);
  });

  it("sends nothing and calls nothing for an empty target list", async () => {
    expect(await sendWeb([], payload)).toEqual([]);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});
