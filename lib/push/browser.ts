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
