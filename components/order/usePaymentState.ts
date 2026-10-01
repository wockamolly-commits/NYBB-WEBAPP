"use client";

import { useEffect, useState } from "react";
import type { PaymentState } from "@/lib/orders/payment-state";

const POLL_MS = 3_000;

/**
 * Asks the server whether an online payment has been confirmed, until it has
 * an answer worth acting on.
 *
 * It checks every few seconds while the tab is visible, and at once when the
 * tab comes back into view, because the usual way to pay from a phone is to
 * leave this page for a banking app (or, in test mode, PayMongo's simulation
 * tab) and come back. A hidden tab is not polled; it is checked on return.
 *
 * Settling a payment does not change the order's status, so the Realtime
 * signal the tracking page listens to never fires for it. That is why this
 * polls a route instead of waiting on a broadcast.
 *
 * Polling stops on `paid` or `closed`. A failed request is not an answer: it
 * is treated as "still waiting" and tried again on the next tick.
 */
export function usePaymentState({
  shortCode,
  trackingToken,
  active,
}: {
  shortCode: string;
  trackingToken: string | null;
  active: boolean;
}): PaymentState {
  const [state, setState] = useState<PaymentState>("waiting");
  const settled = state !== "waiting";

  useEffect(() => {
    if (!active || settled) return;
    let disposed = false;
    let inFlight = false;

    async function check() {
      if (disposed || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const response = await fetch("/api/orders/payment-state", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ shortCode, trackingToken }),
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = (await response.json()) as { state?: unknown };
        if (!disposed && (body.state === "paid" || body.state === "closed")) {
          setState(body.state);
        }
      } catch {
        // Offline for a moment. The next tick asks again.
      } finally {
        inFlight = false;
      }
    }

    void check();
    const poll = window.setInterval(check, POLL_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      disposed = true;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [active, settled, shortCode, trackingToken]);

  return state;
}
