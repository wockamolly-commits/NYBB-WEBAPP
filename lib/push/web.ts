import "server-only";
import webpush from "web-push";
import type { PushPayload } from "./payload";
import { vapidConfigured } from "./vapid";

export type WebTarget = { endpoint: string; p256dh: string; auth_key: string };

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

  await Promise.all(
    targets.map(async (target) => {
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
    }),
  );

  return dead;
}
