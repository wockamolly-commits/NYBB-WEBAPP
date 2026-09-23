"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { needsHomeScreenInstall, pushSupported, vapidKeyBytes } from "@/lib/push/browser";

/**
 * Asking to be told when a new promo starts.
 *
 * THE RULE THIS COMPONENT EXISTS TO HOLD: an existing push subscription is not
 * consent to marketing. A customer who turned on order alerts last week has a
 * subscription and a granted permission, and reading either of those as "promo
 * alerts are on" would enrol them in something they never agreed to. So the
 * browser's own state is only ever used to decide whether subscribing is
 * POSSIBLE. Whether they said yes to promos is a row in `push_promo_optins`
 * that only this control writes.
 *
 * The consequence is deliberate and slightly unusual: reopening this page on a
 * device that already opted in shows the switch as off until it is used again,
 * because the page does not ask the server who this endpoint is. Re-subscribing
 * is idempotent and keeps the original consent date, so the cost of that is one
 * redundant tap and the alternative is a screen that could lie about consent.
 *
 * iOS delivers Web Push only to a site added to the Home Screen, so an iPhone
 * in Safari is told to install rather than offered a button that cannot work.
 * That check is shared with the order opt-in through `lib/push/browser.ts`.
 *
 * Permission is requested on a tap and never on load, the same rule the order
 * opt-in follows. A permission prompt nobody asked for is how a site loses the
 * permission permanently.
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

export function PromoPushOptIn() {
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    let live = true;

    // Resolved through a promise rather than set straight from the effect
    // body, the shape CustomerPushOptIn uses. A synchronous setState here is a
    // cascading render, and the lint rule that says so is right even though
    // every branch below is a cheap capability check.
    function look(): State {
      if (typeof window === "undefined") return { kind: "checking" };
      if (needsHomeScreenInstall()) return { kind: "needs-install" };
      if (!pushSupported()) return { kind: "unsupported" };
      if (!VAPID_PUBLIC_KEY) return { kind: "unconfigured" };
      // Deliberately not inspecting getSubscription(). See the note above: a
      // subscription proves the device can be written to, never that this
      // person agreed to hear about promos.
      return { kind: "off" };
    }

    Promise.resolve()
      .then(look)
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
        setState({
          kind: "failed",
          message: "Notifications were not allowed, so nothing was turned on.",
        });
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes(VAPID_PUBLIC_KEY),
      });

      const response = await fetch("/api/push/promos/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      if (!response.ok) {
        // NOT unsubscribed on failure, which is the opposite of what the order
        // opt-in does, and the difference is the point. There the browser's
        // subscription exists only for that order, so dropping it keeps the two
        // sides in step. Here the same subscription may already be carrying
        // somebody's order alerts, and tearing it down because a marketing
        // request failed would silence the notification they actually care
        // about. The unclaimed subscription is harmless: nothing sends to an
        // endpoint with no row.
        const body = await response.json().catch(() => null);
        setState({
          kind: "failed",
          message:
            (body && typeof body.error === "string" && body.error) ||
            "We could not turn on promo alerts.",
        });
        return;
      }

      setState({ kind: "on" });
    } catch (error) {
      setState({
        kind: "failed",
        message: `Promo alerts could not be turned on: ${
          error instanceof Error ? error.message : "unknown error"
        }.`,
      });
    }
  }

  async function turnOff() {
    setState({ kind: "working" });
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/promos/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }
      // The browser subscription is deliberately left alone. It may still be
      // following an order, and turning off adverts is not asking to stop
      // being told when the food is ready.
      setState({ kind: "off" });
    } catch {
      setState({
        kind: "failed",
        message: "We could not turn promo alerts off. Please try again.",
      });
    }
  }

  if (state.kind === "checking" || state.kind === "unconfigured") return null;

  if (state.kind === "needs-install") {
    return (
      <Note>
        To get an alert when a new promo starts, add this site to your Home
        Screen first: tap Share, then Add to Home Screen, then open it from
        there. iPhones only send alerts from an added site.
      </Note>
    );
  }

  if (state.kind === "unsupported") {
    return <Note>This browser cannot send promo alerts. Check this page for new codes.</Note>;
  }

  if (state.kind === "on") {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <p role="status" className="text-nybb-ink/60 max-w-md text-sm leading-relaxed">
          We will tell you when a new promo starts. Order updates are separate
          and are not affected by this.
        </p>
        <Button type="button" tone="light" variant="ghost" onClick={turnOff}>
          Turn promo alerts off
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Button
        type="button"
        tone="light"
        variant="secondary"
        onClick={turnOn}
        disabled={state.kind === "working"}
      >
        {state.kind === "working" ? "Turning on" : "Tell me about new promos"}
      </Button>
      <p className="text-nybb-ink/55 max-w-md text-sm leading-relaxed">
        Only when a new code starts. Nothing about your orders changes.
      </p>
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
