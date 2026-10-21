import "server-only";
import webpush from "web-push";
import type { PushPayload } from "./payload";
import { isBrowserPushEndpoint } from "./endpoints";
import { vapidConfigured } from "./vapid";

export type WebTarget = { endpoint: string; p256dh: string; auth_key: string };

/** How many pushes are in flight at once. */
const SEND_CONCURRENCY = 20;

let configured = false;

function configure(): boolean {
  if (!vapidConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string,
    );
    configured = true;
  }
  return true;
}

/**
 * Web Push to the counter tablet.
 *
 * Resolves to the endpoints that are gone for good, for the caller to delete.
 * 404 and 410 are the push service saying a subscription no longer exists;
 * everything else, including a 500, is a transient failure and deletes nothing.
 *
 * `urgency: high` and a short TTL matter here. Mobile push services throttle
 * anything they read as background traffic, and a new order alert that arrives
 * ten minutes late has told the counter nothing it did not already know.
 */
export async function sendWeb(
  targets: WebTarget[],
  payload: PushPayload,
): Promise<string[]> {
  if (targets.length === 0 || !configure()) return [];

  const dead: string[] = [];
  const body = JSON.stringify(payload);

  // Only real push services, and at most SEND_CONCURRENCY at a time. A promo
  // announcement goes to every subscriber, and firing them all at once let a
  // flood of registered endpoints run the function out of time before the real
  // subscribers were reached. The host check drops any endpoint stored before
  // 0094 refused non-push hosts at registration.
  const reachable = targets.filter((target) => isBrowserPushEndpoint(target.endpoint));

  const sendOne = async (target: WebTarget) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth_key },
        },
        body,
        { urgency: "high", TTL: 600 },
      );
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        dead.push(target.endpoint);
        return;
      }
      console.error("[push] web send failed", status ?? "unknown");
    }
  };

  let next = 0;
  const worker = async () => {
    while (next < reachable.length) {
      const target = reachable[next];
      next += 1;
      await sendOne(target);
    }
  };

  await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, reachable.length) }, worker));

  return dead;
}
