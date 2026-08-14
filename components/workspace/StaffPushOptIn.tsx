"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * The counter tablet's one-tap opt-in for new-order alerts.
 *
 * WHY THIS CANNOT DISAPPEAR WHEN IT FAILS.
 * ================================================================
 * Every failure here is invisible by nature. A VAPID key of the wrong length,
 * a browser that refused permission months ago, a tablet whose push service is
 * unreachable: all of them end with no notification arriving and nobody able to
 * say why. The reference project's version of this control removed itself from
 * the page on error, which turned a fixable configuration problem into a
 * mystery. So this one stays put and says what happened, and `lib/push/vapid.ts`
 * shouts at startup about the one cause that is invisible even here.
 *
 * WHY PERMISSION IS ONLY ASKED FOR ON A TAP.
 * ================================================================
 * A permission prompt on page load is the one a person dismisses without
 * reading, and a browser only offers it once. Spec section 15.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type State =
  | { kind: "checking" }
  | { kind: "unsupported" }
  | { kind: "unconfigured" }
  | { kind: "off" }
  | { kind: "working" }
  | { kind: "on" }
  | { kind: "failed"; message: string };

/**
 * `applicationServerKey` takes bytes, and a VAPID key is distributed as
 * base64url text. The browser rejects the string form with a DOMException that
 * names neither the key nor the encoding.
 */
function vapidKeyBytes(key: string): Uint8Array<ArrayBuffer> {
  const padded = key.padEnd(key.length + ((4 - (key.length % 4)) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  // Backed by an explicit ArrayBuffer: `new Uint8Array(length)` types as
  // ArrayBufferLike, which includes SharedArrayBuffer, and BufferSource does
  // not accept that.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function StaffPushOptIn() {
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    let live = true;

    async function look() {
      if (!supported()) return { kind: "unsupported" } as const;
      if (!VAPID_PUBLIC_KEY) return { kind: "unconfigured" } as const;

      // Deliberately `getRegistration` rather than `register`: this runs on
      // every load of the board, including for staff who will never opt in,
      // and it should not install a worker on their behalf.
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      const granted = Notification.permission === "granted";
      return subscription && granted ? ({ kind: "on" } as const) : ({ kind: "off" } as const);
    }

    look()
      .then((next) => {
        if (live) setState(next);
      })
      .catch(() => {
        if (live) setState({ kind: "off" });
      });

    return () => {
      live = false;
    };
  }, []);

  async function turnOn() {
    setState({ kind: "working" });

    try {
      // `updateViaCache: "none"` stops the browser serving this worker from its
      // own HTTP cache on the update check it makes independently of the
      // no-store header `next.config.ts` sets. A counter tablet runs one
      // browser session for weeks, so both halves matter.
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState({
          kind: "failed",
          message:
            "This browser has blocked notifications for the site. Allow them in the browser's site settings, then tap again.",
        });
        return;
      }
      if (permission !== "granted") {
        setState({ kind: "failed", message: "Notifications were not allowed, so nothing was turned on." });
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes(VAPID_PUBLIC_KEY),
      });

      const response = await fetch("/api/push/staff/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        // The browser now holds a subscription the server does not know about.
        // Dropping it keeps the two in step, so tapping again is a clean retry
        // rather than a resubscribe the browser answers from its own cache.
        await subscription.unsubscribe().catch(() => {});
        const body = await response.json().catch(() => null);
        setState({
          kind: "failed",
          message:
            (body && typeof body.error === "string" && body.error) ||
            "The server would not accept this tablet. Check that you are still signed in.",
        });
        return;
      }

      setState({ kind: "on" });
    } catch (error) {
      setState({
        kind: "failed",
        message: `Alerts could not be turned on: ${error instanceof Error ? error.message : "unknown error"}.`,
      });
    }
  }

  if (state.kind === "checking") return null;

  if (state.kind === "unsupported") {
    return <Note>This browser cannot receive order alerts. Chrome on the counter tablet can.</Note>;
  }

  if (state.kind === "unconfigured") {
    return <Note>Order alerts are not configured on this deployment.</Note>;
  }

  if (state.kind === "on") {
    return <Note>This tablet is being told about new orders.</Note>;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {state.kind === "failed" ? (
        <p role="alert" className="text-nybb-bone/75 max-w-md text-sm">
          {state.message}
        </p>
      ) : null}
      <Button
        type="button"
        tone="dark"
        variant="secondary"
        onClick={turnOn}
        disabled={state.kind === "working"}
      >
        {state.kind === "working" ? "Turning on alerts" : "Tell me about new orders"}
      </Button>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="text-nybb-bone/50 max-w-md text-sm">
      {children}
    </p>
  );
}
