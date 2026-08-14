/**
 * The counter tablet's service worker.
 *
 * This is the only code in the project that runs with the workspace closed,
 * which is the entire reason staff notifications are Web Push and not a
 * websocket on the orders board. Its whole job is to turn one JSON payload
 * from `lib/push/payload.ts` into a notification, and to put the person who
 * taps that notification on the orders board.
 *
 * WHY IT TAKES OVER IMMEDIATELY.
 * ================================================================
 * A counter tablet is never closed. Without `skipWaiting` and `claim`, a
 * deployed worker sits in the waiting state until every workspace tab is
 * closed, which on that device is never, so the tablet would keep running the
 * worker it installed on the day it was set up. `next.config.ts` refuses to
 * cache this file for the same reason.
 *
 * WHY THERE IS NO FETCH HANDLER.
 * ================================================================
 * Nothing here is offline-first. The orders board reads live data and a stale
 * cached board is worse than an error, so this worker deliberately does not
 * intercept a single request.
 */

const FALLBACK_URL = "/workspace/orders";
const ICON = "/icon-192.png";
const BADGE = "/badge.png";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil(show(read(event.data)));
});

/**
 * The payload, or something safe when it is not one.
 *
 * A push that arrives and shows nothing is worse than a vague one: Chrome
 * shows its own "This site has been updated in the background" notice in that
 * case, which tells the counter nothing and looks like a fault. So a payload
 * this worker cannot read still becomes a notification that opens the board.
 */
function read(data) {
  try {
    const payload = data ? data.json() : null;
    if (payload && typeof payload.title === "string" && typeof payload.body === "string") {
      return payload;
    }
  } catch {
    // Falls through to the notice below.
  }

  return {
    title: "New order",
    body: "Open the orders board to see it.",
    url: FALLBACK_URL,
    tag: "orders-fallback",
    requireInteraction: true,
    renotify: true,
    vibrate: null,
  };
}

function show(payload) {
  const options = {
    body: payload.body,
    icon: ICON,
    badge: BADGE,
    // `renotify` is only legal alongside a tag, and Chrome throws a TypeError
    // rather than ignoring it when the tag is missing. Both payload builders
    // set one; this keeps a hand-sent test payload from killing the handler.
    tag: payload.tag || "orders",
    renotify: Boolean(payload.renotify),
    requireInteraction: Boolean(payload.requireInteraction),
    data: { url: typeof payload.url === "string" ? payload.url : FALLBACK_URL },
  };

  // `vibrate: null` is not the same as leaving it out. The payload type allows
  // null for the events that should arrive quietly.
  if (Array.isArray(payload.vibrate)) options.vibrate = payload.vibrate;

  return self.registration.showNotification(payload.title, options);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || FALLBACK_URL;
  event.waitUntil(open(url));
});

/**
 * Bring the workspace forward rather than opening a second copy of it.
 *
 * A tablet that ends the shift with nine workspace tabs is a tablet somebody
 * signs out of by accident. `includeUncontrolled` matters: a tab loaded before
 * this worker activated is not controlled by it, and on the tablet that just
 * installed the worker that is every tab already open.
 */
async function open(url) {
  const target = new URL(url, self.location.origin);
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

  for (const client of windows) {
    if (new URL(client.url).origin !== target.origin) continue;
    if ("focus" in client) {
      const focused = await client.focus();
      if (focused && "navigate" in focused && new URL(client.url).pathname !== target.pathname) {
        await focused.navigate(target.href);
      }
      return;
    }
  }

  await self.clients.openWindow(target.href);
}
