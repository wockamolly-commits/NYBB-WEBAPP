"use client";

import { useEffect, useState } from "react";
import { BellRing, CircleAlert, Share } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { needsHomeScreenInstall, pushSupported, subscribeForPush } from "@/lib/push/browser";

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
 * Since 0079 the page asks the server for that row on load, keyed by this
 * browser's endpoint. That is not an inference from the browser: it is the
 * consent itself, so the switch shows "on" after a reload exactly when the
 * person turned it on. Before 0079 every reload showed it as off, which read
 * as a control that had forgotten what it was told.
 *
 * WHAT THE CUSTOMER GETS IS SAID IN WORDS, because "alerts" alone does not say
 * whether that means an email, a text or a badge on this page. It is a browser
 * notification on this device, sent once per promo when staff announce it
 * (`announceVoucher`, which waits for the code's start since 0079), and
 * tapping it opens /promos.
 *
 * iOS delivers Web Push only to a site added to the Home Screen, so an iPhone
 * in Safari is told how to install rather than offered a button that cannot
 * work. That check is shared with the order opt-in through `lib/push/browser.ts`.
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

async function look(): Promise<State> {
  if (typeof window === "undefined") return { kind: "checking" };
  if (!VAPID_PUBLIC_KEY) return { kind: "unconfigured" };
  if (needsHomeScreenInstall()) return { kind: "needs-install" };
  if (!pushSupported()) return { kind: "unsupported" };

  // getRegistration rather than register: reading the page should not
  // install a worker for somebody who never taps the button.
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription || Notification.permission !== "granted") return { kind: "off" };

  const response = await fetch("/api/push/promos/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  const body = await response.json().catch(() => null);
  return body?.optedIn === true ? { kind: "on" } : { kind: "off" };
}

export function PromoPushOptIn() {
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    let live = true;
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
            "Notifications are blocked for this site. Allow them in your browser's site settings, then tap the button again.",
        });
        return;
      }
      if (permission !== "granted") {
        setState({
          kind: "failed",
          message: "Notifications were not allowed, so promo alerts are still off.",
        });
        return;
      }

      const subscription = await subscribeForPush(registration.pushManager, VAPID_PUBLIC_KEY);

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
            "We could not turn on promo alerts. Please try again.",
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
        const response = await fetch("/api/push/promos/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("unsubscribe refused");
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

  // No key means the deployment cannot send at all, so the whole section is
  // withheld rather than offering a button that can only fail.
  if (state.kind === "unconfigured") return null;

  return (
    <section
      aria-labelledby="promo-alerts-heading"
      className="bg-nybb-charcoal text-nybb-bone rounded-md p-5 sm:p-8"
    >
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_17rem] md:gap-10">
        <div>
          <p className="type-caps text-nybb-yellow flex items-center gap-2">
            <BellRing aria-hidden className="size-4" />
            Promo alerts
          </p>
          <h2 id="promo-alerts-heading" className="font-display heading-minor mt-3 uppercase">
            Hear about the next promo first
          </h2>
          <p className="text-nybb-bone/75 mt-4 max-w-md text-base leading-relaxed">
            When we launch a new promo code, your browser shows a notification
            on this device. It arrives even when this site is closed. No email,
            no text messages.
          </p>

          <ul className="mt-6 max-w-md space-y-3 text-sm leading-relaxed">
            <Fact lead="One alert per new code.">We never send the same promo twice.</Fact>
            <Fact lead="Tap it to open this page,">
              with the code ready to carry into checkout.
            </Fact>
            <Fact lead="Order alerts are separate.">
              Turning this on or off never changes them.
            </Fact>
          </ul>
        </div>

        <div className="border-nybb-bone/15 flex flex-col justify-center border-t pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-10">
          <Action state={state} onTurnOn={turnOn} onTurnOff={turnOff} />
        </div>
      </div>
    </section>
  );
}

function Fact({ lead, children }: { lead: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="bg-nybb-orange mt-[0.55em] size-1.5 shrink-0 rounded-full" />
      <span className="text-nybb-bone/75">
        <strong className="text-nybb-bone font-semibold">{lead}</strong> {children}
      </span>
    </li>
  );
}

function Action({
  state,
  onTurnOn,
  onTurnOff,
}: {
  state: State;
  onTurnOn: () => void;
  onTurnOff: () => void;
}) {
  if (state.kind === "needs-install") {
    return (
      <div>
        <p className="font-display heading-panel uppercase">On iPhone, add the site first</p>
        <ol className="text-nybb-bone/75 mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
          <li>
            Tap Share <Share aria-hidden className="inline size-4 align-[-0.15em]" /> in Safari.
          </li>
          <li>Choose Add to Home Screen.</li>
          <li>Open the site from your Home Screen and come back here.</li>
        </ol>
        <p className="text-nybb-bone/60 mt-3 text-xs leading-relaxed">
          iPhones only show notifications from a site added to the Home Screen.
        </p>
      </div>
    );
  }

  if (state.kind === "unsupported") {
    return (
      <p className="text-nybb-bone/75 text-sm leading-relaxed">
        This browser cannot show notifications. New codes always appear on this
        page and in the bar at the top of the site.
      </p>
    );
  }

  if (state.kind === "on") {
    return (
      <div>
        <p role="status" className="flex items-center gap-2.5">
          <span aria-hidden className="bg-nybb-yellow size-2.5 rounded-full" />
          <span className="font-display heading-panel uppercase">Promo alerts are on</span>
        </p>
        <p className="text-nybb-bone/70 mt-2 text-sm leading-relaxed">
          For this browser on this device. The next new code will show up as a
          notification.
        </p>
        <Button
          type="button"
          tone="dark"
          variant="secondary"
          block
          className="mt-5"
          onClick={onTurnOff}
        >
          Turn promo alerts off
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Button
        type="button"
        tone="dark"
        variant="primary"
        size="lg"
        block
        onClick={onTurnOn}
        disabled={state.kind === "working" || state.kind === "checking"}
        aria-busy={state.kind === "working"}
      >
        <BellRing aria-hidden className="size-4" />
        {state.kind === "working" ? "Turning on" : "Turn on promo alerts"}
      </Button>
      <p className="text-nybb-bone/60 mt-3 text-xs leading-relaxed">
        Your browser will ask to allow notifications. You can turn this off
        here at any time.
      </p>
      {state.kind === "failed" ? (
        <p role="alert" className="mt-4 flex gap-2 text-sm leading-relaxed">
          <CircleAlert aria-hidden className="text-nybb-orange mt-0.5 size-4 shrink-0" />
          <span>{state.message}</span>
        </p>
      ) : null}
    </div>
  );
}
