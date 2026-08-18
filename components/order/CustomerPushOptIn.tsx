"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * One tap to be told when this order is ready, refused or cancelled.
 *
 * Modelled on `components/workspace/StaffPushOptIn.tsx` and inheriting both of
 * its rules.
 *
 * IT NEVER REMOVES ITSELF ON FAILURE. Every failure here is invisible by
 * nature: a VAPID key of the wrong length, a browser that refused permission
 * months ago, a push service that cannot be reached. The reference project's
 * control deleted itself on error, which turned a fixable configuration
 * problem into a mystery.
 *
 * PERMISSION IS ASKED FOR ON A TAP, NEVER ON LOAD. A prompt on page load is
 * the one a person dismisses without reading, and a browser only offers it
 * once. Spec section 15.
 *
 * WHAT IS HERE AND NOT IN THE STAFF VERSION.
 * ================================================================
 * iOS delivers Web Push only to a site added to the Home Screen, and
 * `pushManager.subscribe` fails outside standalone mode no matter what the
 * customer taps. So an iPhone in Safari is told to install the site rather
 * than offered a button that cannot work.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type State =
  | { kind: "checking" }
  | { kind: "unsupported" }
  | { kind: "unconfigured" }
  | { kind: "needs-install" }
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

/**
 * An iOS browser that is not running as an installed app.
 *
 * The display-mode query is the reliable half: iOS only exposes PushManager at
 * all in standalone mode, so a browser that has the API is already installed.
 * The platform check keeps this from mislabelling a desktop browser, which
 * needs no install and would be told to do something impossible.
 */
function needsHomeScreenInstall(): boolean {
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own, older, non-standard flag.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const isApple = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
  return isApple && !isStandalone;
}

export function CustomerPushOptIn({
  shortCode,
  trackingToken,
}: {
  shortCode: string;
  trackingToken: string | null;
}) {
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    let live = true;

    async function look() {
      if (typeof window === "undefined") return { kind: "checking" } as const;
      if (needsHomeScreenInstall()) return { kind: "needs-install" } as const;
      if (!supported()) return { kind: "unsupported" } as const;
      if (!VAPID_PUBLIC_KEY) return { kind: "unconfigured" } as const;

      // getRegistration rather than register: this runs for every customer who
      // opens their order, and it should not install a worker on behalf of
      // somebody who will never opt in.
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
            "This browser has blocked notifications for the site. Allow them in the browser's settings, then tap again.",
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

      const response = await fetch("/api/push/customer/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shortCode, trackingToken, subscription: subscription.toJSON() }),
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
            "We could not turn on alerts for this order.",
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

  if (state.kind === "needs-install") {
    return (
      <Note>
        To get an alert when this order is ready, add this page to your Home
        Screen first: tap Share, then Add to Home Screen, then open it from
        there. iPhones only send alerts from an added site.
      </Note>
    );
  }

  if (state.kind === "unsupported") {
    return <Note>This browser cannot send order alerts. Keep this page open to follow the order.</Note>;
  }

  if (state.kind === "unconfigured") return null;

  if (state.kind === "on") {
    return <Note>We will tell you when this order is ready.</Note>;
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Button type="button" tone="light" variant="secondary" onClick={turnOn} disabled={state.kind === "working"}>
        {state.kind === "working" ? "Turning on alerts" : "Tell me when it is ready"}
      </Button>
      {state.kind === "failed" ? (
        <p role="alert" className="text-nybb-ink/75 max-w-md text-sm">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="text-nybb-ink/60 mt-6 max-w-md text-sm leading-relaxed">
      {children}
    </p>
  );
}
