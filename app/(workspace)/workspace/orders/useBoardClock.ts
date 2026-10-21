"use client";

import { useSyncExternalStore } from "react";

/**
 * The time, for the order cards' countdowns, to the nearest half minute.
 *
 * An external store rather than state set in an effect: the server render and
 * the first client render both read null (getServerSnapshot), so the countdown
 * cannot disagree with itself across hydration, and the cards switch to live
 * figures on the next tick. Rounded so the snapshot is the same value between
 * ticks, which useSyncExternalStore requires.
 */
const TICK_MS = 30_000;

function subscribe(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, TICK_MS);
  return () => window.clearInterval(timer);
}

const snapshot = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;
const serverSnapshot = () => null;

export function useBoardClock(): number | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
