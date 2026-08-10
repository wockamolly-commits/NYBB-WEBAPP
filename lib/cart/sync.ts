import { z } from "zod";
import { clampQuantity, lineKey, MAX_LINES } from "./lines";
import type { Cart, CartLine } from "./types";

export const CART_OWNER_KEY = "nybb.cart.owner.v1";

export type CartSyncResult =
  | { signedIn: false }
  | { signedIn: true; userId: string; cart: Cart };

export type CartSyncPlan =
  | { action: "none" }
  | { action: "clear" }
  | { action: "adopt"; owner: string; cart: Cart }
  | { action: "merge"; owner: string }
  | { action: "push"; owner: string };

const lineSchema = z.object({
  itemSlug: z.string().min(1).max(80),
  variationSlug: z.string().min(1).max(80),
  optionSlugs: z.record(z.string().max(80), z.array(z.string().max(80)).max(20)),
  quantity: z.number(),
  unitPriceCents: z.number().int().nonnegative().max(100_000_000),
});

export function sanitizeCart(value: unknown): Cart {
  const source =
    value && typeof value === "object" && "lines" in value
      ? (value as { lines?: unknown }).lines
      : value;
  if (!Array.isArray(source)) return { lines: [] };

  const lines: CartLine[] = [];
  for (const candidate of source.slice(0, MAX_LINES)) {
    const parsed = lineSchema.safeParse(candidate);
    if (!parsed.success) continue;
    lines.push({ ...parsed.data, quantity: clampQuantity(parsed.data.quantity) });
  }
  return { lines };
}

export function mergeCarts(local: Cart, account: Cart): Cart {
  const merged = account.lines.map((line) => ({ ...line }));
  for (const incoming of local.lines) {
    const index = merged.findIndex((line) => lineKey(line) === lineKey(incoming));
    if (index === -1) {
      if (merged.length < MAX_LINES) merged.push({ ...incoming });
      continue;
    }
    merged[index] = {
      ...incoming,
      quantity: clampQuantity(merged[index].quantity + incoming.quantity),
    };
  }
  return { lines: merged };
}

export function cartsEqual(a: Cart, b: Cart): boolean {
  if (a.lines.length !== b.lines.length) return false;
  const normalize = (cart: Cart) =>
    cart.lines
      .map((line) => ({ key: lineKey(line), quantity: line.quantity, price: line.unitPriceCents }))
      .sort((left, right) => left.key.localeCompare(right.key));
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

export function planCartSync({
  storedOwner,
  result,
  hasLocalLines,
  hasUnsavedEdits,
}: {
  storedOwner: string | null;
  result: CartSyncResult;
  hasLocalLines: boolean;
  hasUnsavedEdits: boolean;
}): CartSyncPlan {
  if (!result.signedIn) {
    return storedOwner === null ? { action: "none" } : { action: "clear" };
  }
  if (storedOwner !== null && storedOwner !== result.userId) {
    return { action: "adopt", owner: result.userId, cart: result.cart };
  }
  if (storedOwner === null && hasLocalLines) {
    return { action: "merge", owner: result.userId };
  }
  if (hasUnsavedEdits) return { action: "push", owner: result.userId };
  return { action: "adopt", owner: result.userId, cart: result.cart };
}

export function readCartOwner(): string | null {
  try {
    return window.localStorage.getItem(CART_OWNER_KEY);
  } catch {
    return null;
  }
}

export function writeCartOwner(owner: string | null): void {
  try {
    if (owner) window.localStorage.setItem(CART_OWNER_KEY, owner);
    else window.localStorage.removeItem(CART_OWNER_KEY);
  } catch {
    // A blocked storage API leaves the cart device-local.
  }
}
