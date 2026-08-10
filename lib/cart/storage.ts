import { z } from "zod";
import { MAX_LINES, clampQuantity, emptyCart } from "./lines";
import type { Cart } from "./types";

/**
 * The cart on disk.
 *
 * Spec section 11: the cart lives in localStorage and syncs to `customer_carts`
 * when signed in. Only the first half of that is built, because the sync target
 * is keyed by `auth.users(id)` and customer sign-in is the last step of Phase 1.
 * Nothing here needs to change when it arrives: this stays the local copy and
 * the sync becomes a second writer of the same `Cart`.
 *
 * Everything read back is parsed, not trusted. localStorage is writable by
 * anything running on the origin, it survives a deploy that changed the shape,
 * and a customer with a corrupt cart must land on an empty one rather than on
 * a stack trace.
 */

/** Bumping this is how the shape changes: an old key is dropped, not migrated. */
export const CART_STORAGE_KEY = "nybb.cart.v1";
export const CART_UPDATED_EVENT = "nybb:cart-updated";

const lineSchema = z.object({
  itemSlug: z.string().min(1),
  variationSlug: z.string().min(1),
  optionSlugs: z.record(z.string(), z.array(z.string())),
  quantity: z.number(),
  unitPriceCents: z.number().int().nonnegative(),
});

const storedSchema = z.object({
  version: z.literal(1),
  lines: z.array(lineSchema),
});

/**
 * Read the cart, or an empty one.
 *
 * Storage itself can throw rather than return null: Safari in private mode
 * throws on write, and a browser with site data blocked throws on the property
 * access. The cart is not worth taking a page down for, so every path here
 * ends in a usable cart.
 */
export function readCart(storage: Storage | null): Cart {
  if (!storage) return emptyCart;

  let raw: string | null;
  try {
    raw = storage.getItem(CART_STORAGE_KEY);
  } catch {
    return emptyCart;
  }
  if (!raw) return emptyCart;

  const parsed = storedSchema.safeParse(safeJson(raw));
  if (!parsed.success) {
    // Not ours, or not this version. Drop it rather than leaving something
    // unreadable in place to fail again on the next page load.
    try {
      storage.removeItem(CART_STORAGE_KEY);
    } catch {
      // Nothing to do. The read already failed safe.
    }
    return emptyCart;
  }

  return {
    lines: parsed.data.lines
      .slice(0, MAX_LINES)
      .map((line) => ({ ...line, quantity: clampQuantity(line.quantity) })),
  };
}

export function writeCart(storage: Storage | null, cart: Cart): void {
  if (!storage) return;
  try {
    storage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: 1, lines: cart.lines }));
    window.dispatchEvent(new Event(CART_UPDATED_EVENT));
  } catch {
    // Quota, or private mode. The in-memory cart is still correct for this
    // tab, which is the part the customer can see.
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
