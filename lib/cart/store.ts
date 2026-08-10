"use client";

import type { MenuCategory } from "@/lib/menu/types";
import { addLine, emptyCart, removeLine, resolveCart, setLineQuantity } from "./lines";
import { CART_STORAGE_KEY, readCart, writeCart } from "./storage";
import type { Cart, CartLine, DroppedLine } from "./types";

/**
 * One cart, shared by every component that shows it, backed by localStorage.
 *
 * A module store rather than a React context, for two reasons. The header, the
 * sticky bar and the cart page all need the same cart, and threading a provider
 * through a layout that is otherwise entirely server components would turn the
 * whole storefront into a client tree. And `useSyncExternalStore` gives the
 * hydration behaviour this needs for free: the server has no localStorage, so
 * it renders zero, and so does the client's first pass.
 *
 * `loaded` is part of the snapshot on purpose. Without it "the cart is empty"
 * and "the cart has not been read yet" are the same state, and the cart page
 * flashes its empty message before showing the order that was there all along.
 */

/** What the last reconciliation against the menu had to change. */
export type CartChanges = {
  dropped: DroppedLine[];
  /** Item names whose price moved under the stored snapshot. */
  repriced: string[];
};

export type CartState = {
  cart: Cart;
  /** localStorage has been read. False on the server and on the first paint. */
  loaded: boolean;
  /** Null once there is nothing left to tell the customer about. */
  changes: CartChanges | null;
};

/**
 * The pre-hydration snapshot, as one constant.
 *
 * useSyncExternalStore compares snapshots by reference and will loop if this
 * is rebuilt per call.
 */
const INITIAL: CartState = { cart: emptyCart, loaded: false, changes: null };

let state: CartState = INITIAL;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function handleStorage(event: StorageEvent): void {
  // Another tab. Same customer, same cart, so take theirs: the alternative is
  // two tabs quietly disagreeing about what is being ordered.
  if (event.key !== null && event.key !== CART_STORAGE_KEY) return;
  state = { ...state, cart: readCart(storage()), loaded: true };
  emit();
}

function load(): void {
  if (state.loaded) return;
  state = { ...state, cart: readCart(storage()), loaded: true };
  window.addEventListener("storage", handleStorage);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // React re-reads the snapshot after subscribing and re-renders if it moved,
  // so loading here is what turns the empty first paint into the real cart
  // with no effect and no mismatch.
  load();
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): CartState {
  return state;
}

export function getServerSnapshot(): CartState {
  return INITIAL;
}

function commit(cart: Cart): void {
  state = { ...state, cart, loaded: true };
  writeCart(storage(), cart);
  emit();
}

/** Replace the local cart with a server-synchronized copy. */
export function replaceCart(cart: Cart): void {
  load();
  commit(cart);
}

export function addToCart(line: CartLine): { ok: boolean } {
  load();
  const result = addLine(state.cart, line);
  if (result.ok) commit(result.cart);
  return { ok: result.ok };
}

export function setCartLineQuantity(key: string, quantity: number): void {
  load();
  commit(setLineQuantity(state.cart, key, quantity));
}

export function removeCartLine(key: string): void {
  load();
  commit(removeLine(state.cart, key));
}

/**
 * Empty the cart, and hand back what was in it.
 *
 * The return value is the whole undo feature. Emptying a cart is the one
 * irreversible thing on this screen, and the usual guard is a dialog asking
 * whether you meant it, which interrupts every customer who did mean it in
 * order to catch the rare one who did not. Handing the old cart back to the
 * caller lets the screen offer to put it back instead, so the action stays
 * one tap and stops being irreversible.
 *
 * It is deliberately not stored. Undo is the moment after the press, not a
 * bin that fills up: a cart restored on the next visit is a cart the customer
 * has already forgotten throwing away.
 */
export function clearCart(): Cart {
  load();
  const emptied = state.cart;
  commit(emptyCart);
  return emptied;
}

/** Put a cart back exactly as it was. The other half of `clearCart`. */
export function restoreCart(cart: Cart): void {
  load();
  commit(cart);
}

/**
 * Match the stored cart to a menu, keep what the menu says, and remember what
 * had to change.
 *
 * This lives in the store rather than in the cart page because the correction
 * and the explanation of it are one event. Writing the corrected cart back is
 * what destroys the evidence: once the stored price agrees with the menu,
 * nothing is repriced any more and the notice would vanish in the same frame
 * it appeared.
 *
 * It settles. A second call with nothing left to correct clears `changes`, so
 * the notice is shown on the visit that earned it and not on the next one, and
 * a third call returns without touching anything.
 */
export function reconcileCart(categories: MenuCategory[]): void {
  load();

  const resolved = resolveCart(categories, state.cart);
  const repriced = resolved.lines.filter((line) => line.repriced).map((line) => line.item.name);
  const changes =
    resolved.dropped.length > 0 || repriced.length > 0
      ? { dropped: resolved.dropped, repriced }
      : null;

  if (!resolved.corrected && state.changes === null) return;

  if (resolved.corrected) writeCart(storage(), resolved.corrected);
  state = { cart: resolved.corrected ?? state.cart, loaded: true, changes };
  emit();
}
