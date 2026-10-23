/**
 * The three things every push opt-in has to ask the browser.
 *
 * Extracted from `components/order/CustomerPushOptIn.tsx` when the promos page
 * gained an opt-in of its own. Two copies of `needsHomeScreenInstall` would be
 * two chances to get the iOS rule wrong, and the one that drifted would offer
 * an iPhone a button that cannot work no matter what is tapped.
 *
 * Not a `"use client"` module, deliberately. Nothing here is a component and
 * nothing holds state, so it is ordinary code that happens to touch `window`,
 * which is also what makes it unit testable. It was never testable while it
 * lived inside a client component.
 */

/**
 * `applicationServerKey` takes bytes, and a VAPID key is distributed as
 * base64url text. The browser rejects the string form with a DOMException that
 * names neither the key nor the encoding.
 */
export function vapidKeyBytes(key: string): Uint8Array<ArrayBuffer> {
  const padded = key.padEnd(key.length + ((4 - (key.length % 4)) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * An iOS browser that is not running as an installed app.
 *
 * The display-mode query is the reliable half: iOS only exposes PushManager at
 * all in standalone mode, so a browser that has the API is already installed.
 * The platform check keeps this from mislabelling a desktop browser, which
 * needs no install and would be told to do something impossible.
 */
export function needsHomeScreenInstall(): boolean {
  if (typeof window === "undefined") return false;
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own, older, non-standard flag.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const isApple = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
  return isApple && !isStandalone;
}

/**
 * Subscribe this browser for push, replacing a subscription made with a
 * different VAPID key.
 *
 * A browser holds one subscription per service worker, tied to the key it was
 * made with. When the key changes (rotated, or a different environment served
 * from the same origin), `subscribe` with the new key throws an
 * InvalidStateError and the customer sees "a subscription with a different
 * applicationServerKey already exists". Dropping the old one costs nothing:
 * our server signs with the current key, so the push service already rejects
 * everything sent to that stale endpoint. It was carrying no alerts.
 *
 * Two checks, because `options.applicationServerKey` is not readable in every
 * browser. Where it is, a mismatch is replaced before subscribing. Where it is
 * not, the InvalidStateError itself is the signal, and the subscribe is
 * retried once after unsubscribing.
 */
export async function subscribeForPush(
  pushManager: PushManager,
  key: string,
): Promise<PushSubscription> {
  const wanted = vapidKeyBytes(key);
  const options = { userVisibleOnly: true, applicationServerKey: wanted };

  const existing = await pushManager.getSubscription();
  const held = existing?.options?.applicationServerKey;
  if (existing && held && !sameBytes(new Uint8Array(held), wanted)) {
    await existing.unsubscribe();
  }

  try {
    return await pushManager.subscribe(options);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "InvalidStateError")) throw error;
    const stale = await pushManager.getSubscription();
    if (!stale) throw error;
    await stale.unsubscribe();
    return pushManager.subscribe(options);
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}
