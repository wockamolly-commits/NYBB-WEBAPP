/**
 * The service worker for both the counter tablet and a customer's phone.
 *
 * One worker serves scope "/", so it is the only code in the project that
 * runs with either the workspace or the storefront closed, which is the
 * entire reason notifications are Web Push and not a websocket. Its whole
 * job is to turn one JSON payload from `lib/push/payload.ts` into a
 * notification, and to put the person who taps that notification on the
 * right screen for who they are: the orders board for staff, their order
 * for a customer.
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

/**
 * What to show when a payload cannot be read, per audience.
 *
 * A push that arrives and shows nothing is worse than a vague one: Chrome
 * shows its own "This site has been updated in the background" notice in
 * that case, which tells nobody anything and looks like a fault. So a
 * payload this worker cannot read still becomes a notification.
 *
 * There are two of these because one worker serves scope "/" and therefore
 * both audiences. Before customers had Web Push there was a single fallback
 * pointing at the orders board, which is what a customer would have been
 * shown.
 */
const FALLBACKS = {
  staff: {
    title: "New order",
    body: "Open the orders board to see it.",
    url: "/workspace/orders",
    tag: "orders-fallback",
    requireInteraction: true,
    renotify: true,
    vibrate: null,
    audience: "staff",
  },
  customer: {
    title: "Your order has an update",
    body: "Open your order to see what changed.",
    url: "/",
    tag: "order-fallback",
    requireInteraction: false,
    renotify: false,
    vibrate: null,
    audience: "customer",
  },
};

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
 * The audience check happens before the shape check: even a payload that
 * fails the shape check still tells us who it was for, and that is enough
 * to pick the right fallback below.
 */
function read(data) {
  let audience = "staff";
  try {
    const payload = data ? data.json() : null;
    if (payload && payload.audience === "customer") audience = "customer";
    if (payload && typeof payload.title === "string" && typeof payload.body === "string") {
      return payload;
    }
  } catch {
    // Falls through to the fallback below.
  }

  return FALLBACKS[audience];
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
    // A real payload always carries its own `url`. This default is only
    // reached for an unreadable one, which is why it points at the staff
    // fallback rather than anywhere a customer would land.
    data: { url: typeof payload.url === "string" ? payload.url : FALLBACKS.staff.url },
  };

  // `vibrate: null` is not the same as leaving it out. The payload type allows
  // null for the events that should arrive quietly.
  if (Array.isArray(payload.vibrate)) options.vibrate = payload.vibrate;

  return self.registration.showNotification(payload.title, options);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Again, a real payload always carries its own `url` by the time it gets
  // here, so this only matters for an unreadable payload.
  const url = (event.notification.data && event.notification.data.url) || FALLBACKS.staff.url;
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
