"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { MENU_EVENT, MENU_TOPIC } from "@/lib/menu/live";
import { createStorefrontBrowserClient } from "@/lib/supabase/browser";

/** A fallback, not the mechanism. The signal below is what makes it instant. */
const POLL_MS = 60_000;
/** A workspace Save touches several tables, each signalling once; one refresh. */
const REFRESH_DELAY_MS = 250;

/**
 * Keeps a menu page current while it is open, so an item marked sold out in
 * the workspace leaves the page without the customer reloading it.
 *
 * The same shape as `BranchesLiveRefresh`, for the same reason: Realtime
 * carries only a change signal (0106), and `router.refresh()` re-renders the
 * Server Component, which reads the menu again through
 * `get_storefront_menu()`. So availability reaches the browser from nowhere
 * but the function every visitor reads, and the cart page re-resolves its
 * lines against it in the same pass, flagging one that can no longer be sold.
 *
 * A refresh keeps client state: a half-built order in the configurator stays
 * as it is unless the item itself has gone, in which case the page says so
 * rather than letting it reach checkout.
 *
 * THE FALLBACKS. A socket can drop without saying so, on a phone that slept or
 * a network that changed. So the page also refreshes when the tab becomes
 * visible again, and on a slow poll while visible, which also lets a timed
 * hold that has just run out bring its item back.
 *
 * Not on checkout. place_order checks availability itself, and a background
 * re-render in the middle of a payment is a risk with nothing to gain.
 */
export function MenuLiveRefresh() {
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
        .channel(MENU_TOPIC, { config: { private: false } })
        .on("broadcast", { event: MENU_EVENT }, scheduleRefresh)
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
