"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cartQuantity, snapshotTotalCents } from "@/lib/cart/lines";
import { useCart } from "@/lib/cart/use-cart";
import { formatPeso } from "@/lib/format";

/**
 * The bottom-sticky cart bar, spec section 11.
 *
 * Small screens only. On a phone the header scrolls away and the cart with it,
 * so the count has to be pinned to the thumb; on a desktop the header is
 * always there and a full-width band across the bottom of the window would be
 * a lot of furniture for a number.
 *
 * The total is the stored snapshot rather than a resolved one, because this
 * renders on pages that never loaded a menu. `resolveCart` on the cart page is
 * the correction, and the customer is one tap away from it. See `lines.ts`.
 *
 * It hides itself on /cart. A sticky bar whose only action is "view cart" is
 * noise on the cart.
 */
export function CartBar() {
  const { cart, loaded } = useCart();
  const pathname = usePathname();
  const quantity = cartQuantity(cart);

  if (!loaded || quantity === 0 || pathname === "/cart") return null;

  return (
    <>
      {/* Real height in the flow, so the bar covers this and not the last line
          of the footer. */}
      <div aria-hidden className="h-20 lg:hidden" />

      <div className="bg-nybb-charcoal text-nybb-bone fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_28px_-14px_rgba(11,11,12,0.55)] lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <p className="min-w-0">
            <span className="font-display block text-sm leading-none">
              {quantity} {quantity === 1 ? "item" : "items"}
            </span>
            <span className="font-mono-tabular text-nybb-orange mt-1 block text-base leading-none">
              {formatPeso(snapshotTotalCents(cart))}
            </span>
          </p>

          <Link
            href="/cart"
            className="bg-nybb-orange text-nybb-ink hover:bg-nybb-orange-lit font-display inline-flex min-h-11 shrink-0 items-center rounded-md px-5 text-sm tracking-[0.06em] transition-colors duration-200"
          >
            View cart
          </Link>
        </div>
      </div>
    </>
  );
}
