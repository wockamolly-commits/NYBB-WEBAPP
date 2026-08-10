"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ORDER_TRACKING_EVENT,
  orderTrackingTopic,
} from "@/lib/orders/tracking";
import { createStorefrontBrowserClient } from "@/lib/supabase/browser";

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
}: {
  shortCode: string;
  trackingToken: string | null;
}) {
  const router = useRouter();
  const refreshTimer = useRef<number | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current !== null) return;
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, REFRESH_DELAY_MS);
  }, [router]);

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
