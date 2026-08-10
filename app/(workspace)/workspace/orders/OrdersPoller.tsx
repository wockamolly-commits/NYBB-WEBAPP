"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createStaffBrowserClient } from "@/lib/supabase/browser";

const POLL_MS = 20_000;

export function OrdersPoller({ branchId }: { branchId: string | null }) {
  const router = useRouter();
  const refreshTimer = useRef<number | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current !== null) return;
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, 250);
  }, [router]);

  useEffect(() => {
    const supabase = createStaffBrowserClient();
    const filter = branchId ? `branch_id=eq.${branchId}` : undefined;
    const channel = supabase.channel("nybb-orders-board").on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders", filter },
      scheduleRefresh,
    ).subscribe();
    return () => {
      void supabase.removeChannel(channel);
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    };
  }, [branchId, scheduleRefresh]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return null;
}
