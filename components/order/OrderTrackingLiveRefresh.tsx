"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ORDER_TRACKING_EVENT,
  orderTrackingTopic,
} from "@/lib/orders/tracking";
import { createStorefrontBrowserClient } from "@/lib/supabase/browser";
import { usePaymentState } from "./usePaymentState";

const POLL_MS = 20_000;
const REFRESH_DELAY_MS = 100;

/**
 * Keeps the server-rendered tracking screen current without moving customer
 * order data into the client. Realtime carries only a change signal. The
 * refresh re-runs get_order_by_tracking(), so the tracking token or signed-in
 * owner remains the authority for every payload shown on screen.
 */
export function OrderTrackingLiveRefresh({
  shortCode,
  trackingToken,
  awaitingPayment = false,
}: {
  shortCode: string;
  trackingToken: string | null;
  /** An online payment is still open, so watch it more closely than the order. */
  awaitingPayment?: boolean;
}) {
  const router = useRouter();
  // A payment settling does not change the order's status, so the broadcast
  // below stays silent for it. This is where PayMongo returns a customer, often
  // before its webhook has landed, so the payment is watched on its own and the
  // page re-renders the moment the server has an answer.
  const payment = usePaymentState({ shortCode, trackingToken, active: awaitingPayment });
  const refreshTimer = useRef<number | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current !== null) return;
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, REFRESH_DELAY_MS);
  }, [router]);

  useEffect(() => {
    if (payment !== "waiting") scheduleRefresh();
  }, [payment, scheduleRefresh]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => Promise<unknown>) | null = null;

    void createStorefrontBrowserClient().then((supabase) => {
      if (disposed) return;
      const topic = orderTrackingTopic(trackingToken);
      const channel = topic
        ? supabase
            .channel(topic, { config: { private: false } })
            .on("broadcast", { event: ORDER_TRACKING_EVENT }, scheduleRefresh)
        : supabase.channel(`order-tracking-account:${shortCode}`).on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "orders",
              filter: `short_code=eq.${shortCode}`,
            },
            scheduleRefresh,
          );

      channel.subscribe();
      cleanup = () => supabase.removeChannel(channel);
    });

    return () => {
      disposed = true;
      if (cleanup) void cleanup();
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
  }, [scheduleRefresh, shortCode, trackingToken]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    const poll = window.setInterval(refreshWhenVisible, POLL_MS);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [scheduleRefresh]);

  return null;
}
