"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { STORE_HOURS_EVENT, STORE_HOURS_TOPIC } from "@/lib/branches/live";
import { createStorefrontBrowserClient } from "@/lib/supabase/browser";

/** A fallback, not the mechanism. The signal below is what makes it instant. */
const POLL_MS = 60_000;
/** One Save sends up to two signals; they become one refresh. */
const REFRESH_DELAY_MS = 250;

/**
 * Keeps the branches page's hours current while it is open.
 *
 * The same shape as `OrderTrackingLiveRefresh`, for the same reason: Realtime
 * carries only a change signal, and `router.refresh()` re-renders the Server
 * Component, which reads the hours again through `get_store_hours()`. So the
 * browser never receives a schedule from anywhere but the function every other
 * visitor reads, and the formatting in `lib/branches/hours.ts` stays the only
 * formatting.
 *
 * A refresh keeps client state. An open branch sheet stays open, its map is not
 * reloaded, and the hours table under it simply changes.
 *
 * THE FALLBACKS. A socket can drop without saying so, on a phone that slept or
 * a network that changed. So the page also refreshes when the tab becomes
 * visible again, which covers the common case of editing in the workspace in
 * one tab and switching back, and on a slow poll while visible, which also
 * moves "Open now" to "Closed now" when closing time passes with nobody
 * editing anything.
 */
export function BranchesLiveRefresh() {
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
      const channel = supabase
        .channel(STORE_HOURS_TOPIC, { config: { private: false } })
        .on("broadcast", { event: STORE_HOURS_EVENT }, scheduleRefresh)
        .subscribe();
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
  }, [scheduleRefresh]);

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
