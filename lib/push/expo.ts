import "server-only";
import type { PushPayload } from "./payload";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

export type ExpoTarget = { endpoint: string };

type ExpoTicket = {
  status?: string;
  details?: { error?: string };
};

/**
 * Expo's push relay, which forwards to FCM on Android and APNs on iOS.
 *
 * Resolves to the tokens Expo says are dead, for the caller to delete. It never
 * rejects: a notification failing must not fail the order that triggered it, and
 * this is the last place that could still throw into a mutation.
 *
 * A 500 from Expo is deliberately not a verdict on any token. Treating it as one
 * would delete live registrations during an outage and silently stop notifying
 * customers who did nothing wrong.
 */
export async function sendExpo(
  targets: ExpoTarget[],
  payload: PushPayload,
): Promise<string[]> {
  if (targets.length === 0) return [];

  const dead: string[] = [];

  for (let i = 0; i < targets.length; i += EXPO_BATCH_SIZE) {
    const batch = targets.slice(i, i + EXPO_BATCH_SIZE);
    const messages = batch.map((target) => ({
      to: target.endpoint,
      title: payload.title,
      body: payload.body,
      data: { url: payload.url },
      sound: "default",
      priority: "high",
      channelId: "orders",
    }));

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(messages),
      });
      if (!response.ok) continue;

      const parsed = (await response.json()) as { data?: ExpoTicket[] };
      const tickets = parsed.data ?? [];
      tickets.forEach((ticket, index) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          const target = batch[index];
          if (target) dead.push(target.endpoint);
        }
      });
    } catch (error) {
      // Logged without the payload, which carries a tracking token.
      console.error(
        "[push] expo send failed",
        error instanceof Error ? error.message : "unknown",
      );
    }
  }

  return dead;
}
