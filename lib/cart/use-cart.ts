"use client";

import { useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, subscribe, type CartState } from "./store";

/**
 * The cart, and whether it has been read yet.
 *
 * Every consumer takes the whole state rather than a slice. The cart is small
 * and changes only when the customer touches it, so a selector would buy
 * nothing and cost a second snapshot cache to keep referentially stable.
 */
export function useCart(): CartState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
