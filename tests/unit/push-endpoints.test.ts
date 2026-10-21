import { describe, expect, it } from "vitest";
import { isBrowserPushEndpoint } from "@/lib/push/endpoints";

/** The hosts a promo announcement is allowed to POST to (migration 0094). */
describe("isBrowserPushEndpoint", () => {
  it("accepts the push services browsers mint endpoints on", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QAbc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      expect(isBrowserPushEndpoint(endpoint), endpoint).toBe(true);
    }
  });

  it("refuses everything else, including look-alikes", () => {
    for (const endpoint of [
      "https://169.254.169.254/latest/meta-data",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evil.example/fcm.googleapis.com/",
      "https://fcm.googleapis.com:8443/x",
      "https://user:pass@fcm.googleapis.com/x",
      "not a url",
    ]) {
      expect(isBrowserPushEndpoint(endpoint), endpoint).toBe(false);
    }
  });
});
