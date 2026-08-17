import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertVapidKey } from "@/lib/push/vapid";

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

  it("sends nothing and calls nothing when VAPID is unconfigured, even for a non-empty target list", async () => {
    // A non-empty target list is the point: an empty list already short-circuits
    // before the configure() guard, so it cannot prove this branch on its own.
    // vapidConfigured() re-reads process.env on every call, so overriding the
    // beforeEach's valid stubs here reaches the guard regardless of whether an
    // earlier test in this file already flipped the module-level `configured`
    // singleton to true.
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "");
    expect(await sendWeb([target], payload)).toEqual([]);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});
