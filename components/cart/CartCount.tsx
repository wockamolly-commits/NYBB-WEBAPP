"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { cartQuantity } from "@/lib/cart/lines";
import { useCart } from "@/lib/cart/use-cart";

/**
 * The cart in the header bar.
 *
 * A client island inside an otherwise server-rendered header. The count comes
 * from localStorage, so it cannot be known while the page is being generated,
 * and the badge is absolutely positioned precisely so that it appearing after
 * hydration moves nothing: a header that reflows a moment after it paints is
 * the kind of thing that gets tapped by accident.
 *
 * Orange is a graphic here, not type. On this parchment bar orange text
 * measures 2.6:1, but ink on an orange badge is legible and is what the brand
 * has always used for an accent.
 */
export function CartCount() {
  const { cart, loaded } = useCart();
  const quantity = cartQuantity(cart);
  const showing = loaded && quantity > 0;

  return (
    <Link
      href="/cart"
      aria-label={showing ? `Cart, ${quantity} ${quantity === 1 ? "item" : "items"}` : "Cart"}
      className="text-nybb-ink/70 hover:text-nybb-ink relative inline-flex min-h-11 min-w-11 items-center justify-center transition-colors duration-200"
    >
      <ShoppingBag aria-hidden className="h-5 w-5" strokeWidth={2} />
      {showing ? (
        <span
          aria-hidden
          className="bg-nybb-orange text-nybb-ink font-mono-tabular absolute top-1 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] leading-none"
        >
          {quantity}
        </span>
      ) : null}
    </Link>
  );
}
