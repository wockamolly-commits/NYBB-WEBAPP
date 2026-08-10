"use client";

import { useEffect } from "react";
import { fetchAccountCart, mergeAccountCart, saveAccountCart } from "@/app/actions/cart";
import { emptyCart } from "@/lib/cart/lines";
import { getSnapshot, replaceCart } from "@/lib/cart/store";
import { CART_UPDATED_EVENT, readCart } from "@/lib/cart/storage";
import {
  cartsEqual,
  planCartSync,
  readCartOwner,
  writeCartOwner,
} from "@/lib/cart/sync";
import type { Cart } from "@/lib/cart/types";

const PUSH_DELAY_MS = 600;
const PULL_THROTTLE_MS = 1200;

let listenersInstalled = false;
let applying = false;
let revision = 0;
let syncedRevision = 0;
let timer: number | null = null;
let pushInFlight = false;
let lastPullAt = 0;

function currentCart(): Cart {
  const snapshot = getSnapshot();
  return snapshot.loaded ? snapshot.cart : readCart(window.localStorage);
}

function unsaved(): boolean {
  return revision !== syncedRevision;
}

function apply(cart: Cart): void {
  if (cartsEqual(currentCart(), cart)) {
    syncedRevision = revision;
    return;
  }
  applying = true;
  try {
    replaceCart(cart);
  } finally {
    applying = false;
  }
  syncedRevision = revision;
}

function schedulePush(): void {
  if (timer !== null) return;
  timer = window.setTimeout(() => {
    timer = null;
    if (unsaved()) void push();
  }, PUSH_DELAY_MS);
}

async function push(): Promise<void> {
  if (pushInFlight) {
    schedulePush();
    return;
  }
  if (readCartOwner() === null) {
    await pull(true);
    return;
  }

  const startedAt = revision;
  pushInFlight = true;
  try {
    const result = await saveAccountCart(currentCart());
    if (!result.signedIn) {
      writeCartOwner(null);
      return;
    }
    syncedRevision = startedAt;
    if (revision === startedAt) apply(result.cart);
  } catch {
    // Keep the local edit. Focus, visibility, or the next edit retries it.
  } finally {
    pushInFlight = false;
    if (unsaved()) schedulePush();
  }
}

async function pull(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastPullAt < PULL_THROTTLE_MS) return;
  lastPullAt = now;

  let result;
  try {
    result = await fetchAccountCart();
  } catch {
    return;
  }

  const local = currentCart();
  const plan = planCartSync({
    storedOwner: readCartOwner(),
    result,
    hasLocalLines: local.lines.length > 0,
    hasUnsavedEdits: unsaved(),
  });

  switch (plan.action) {
    case "none":
      return;
    case "clear":
      writeCartOwner(null);
      apply(emptyCart);
      return;
    case "adopt":
      writeCartOwner(plan.owner);
      apply(plan.cart);
      return;
    case "push":
      writeCartOwner(plan.owner);
      await push();
      return;
    case "merge": {
      const startedAt = revision;
      try {
        const merged = await mergeAccountCart(local);
        if (!merged.signedIn) return;
        writeCartOwner(merged.userId);
        if (revision === startedAt) apply(merged.cart);
        else void push();
      } catch {
        // Leaving the owner unset makes the next pull retry the merge.
      }
    }
  }
}

function onCartUpdated(): void {
  if (applying) return;
  revision += 1;
  if (!pushInFlight) void push();
  schedulePush();
}

function installListeners(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;
  window.addEventListener(CART_UPDATED_EVENT, onCartUpdated);
  window.addEventListener("focus", () => void pull());
  window.addEventListener("pagehide", () => {
    if (unsaved()) void push();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void pull();
    else if (unsaved()) void push();
  });
}

/** Keeps a signed-in cart synchronized while guests remain device-local. */
export function CartSync() {
  useEffect(() => {
    installListeners();
    void pull();
  }, []);
  return null;
}
