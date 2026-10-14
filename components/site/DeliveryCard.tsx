"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowUpRight, X } from "lucide-react";
import { cartQuantity } from "@/lib/cart/lines";
import { useCart } from "@/lib/cart/use-cart";
import { LOGO_CLICK_EVENT } from "@/components/site/HomeLink";
import { DELIVERY_CARD_COPY, TABLEVIBE_URL, deliveryCardAllowedOn } from "@/lib/site/delivery-card";
import { cn } from "@/lib/utils";

/**
 * The floating delivery card, bottom right, pointing at Tablevibe.
 *
 * The old WordPress site's card brought back: a light plate with the offer,
 * an orange band that is the whole ORDER NOW target, and the yellow logo tile
 * on the band's left. The tile is the one piece of character here. It sits
 * proud of the band like a sticker slapped on a takeaway bag, tilted, and
 * it settles into place as the card rises.
 *
 * WHERE IT SITS. Bottom right, because bottom left belongs to PromoBar's
 * floating reminder. Below `lg` it also clears the cart bar, and on a phone
 * it stacks above the promo reminder when there is one, because at that
 * width the two cards are each nearly the width of the screen. It never
 * appears on the cart, checkout or order pages (see delivery-card.ts).
 *
 * CLOSING IT LASTS UNTIL THE NEXT ARRIVAL, and an arrival is a refresh or a
 * click on the logo (the owner's call, 2026-10-14). Moving between pages
 * keeps it closed, because this lives in the storefront layout and a layout
 * does not remount between the pages inside it. A refresh remounts it, and
 * the logo announces itself with LOGO_CLICK_EVENT, from home or from anywhere
 * else. Nothing is stored, so nothing outlives the tab.
 *
 * It rises a beat after the page, so it arrives after the page rather than
 * with it. Until then it is rendered but sunk out of view and inert.
 */

const ARRIVE_AFTER_MS = 1200;

export function DeliveryCard({ promoReminder }: { promoReminder: boolean }) {
  const pathname = usePathname();
  const { cart, loaded } = useCart();
  const [risen, setRisen] = useState(false);
  const [closed, setClosed] = useState(false);
  // The same fact for the logo listener, which is registered once.
  const closedRef = useRef(false);
  // Bumped by each arrival after the first, which replays the rise.
  const [arrival, setArrival] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setRisen(true), ARRIVE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [arrival]);

  useEffect(() => {
    // Only a closed card comes back; an open one is left where it is.
    const onLogo = () => {
      if (!closedRef.current) return;
      closedRef.current = false;
      setClosed(false);
      setRisen(false);
      setArrival((n) => n + 1);
    };
    window.addEventListener(LOGO_CLICK_EVENT, onLogo);
    return () => window.removeEventListener(LOGO_CLICK_EVENT, onLogo);
  }, []);

  const shown = risen && !closed && deliveryCardAllowedOn(pathname);

  function close() {
    closedRef.current = true;
    setClosed(true);
  }

  const cartBar = loaded && cartQuantity(cart) > 0;
  const { headline, line } = DELIVERY_CARD_COPY;

  return (
    <aside
      aria-label="Delivery"
      data-shown={shown}
      inert={!shown}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
      className={cn(
        "delivery-card fixed right-4 z-30 w-[min(21rem,calc(100vw-2rem))] sm:right-6",
        // Clear of the cart bar (5.75rem) and the promo reminder (4rem more)
        // below lg, where both exist. On a desktop neither is in the way.
        cartBar && promoReminder && "bottom-[calc(env(safe-area-inset-bottom)+9.75rem)]",
        cartBar && !promoReminder && "bottom-[calc(env(safe-area-inset-bottom)+5.75rem)]",
        !cartBar && promoReminder && "bottom-[calc(env(safe-area-inset-bottom)+5rem)]",
        !cartBar && !promoReminder && "bottom-[calc(env(safe-area-inset-bottom)+1rem)]",
        "lg:bottom-6",
      )}
    >
      <div className="bg-nybb-bone text-nybb-ink ring-nybb-ink/10 relative rounded-lg shadow-[0_18px_40px_-16px_rgba(11,11,12,0.6)] ring-1">
        <div className="px-4 pt-4 pr-12 pb-3.5">
          <p className="font-display text-xl leading-[1.1] tracking-[0.01em] text-balance">
            {headline}
          </p>
          <p className="text-nybb-ink/75 mt-1.5 text-sm leading-snug">{line}</p>
        </div>

        {/* The disc is 2rem; the button around it is the 2.75rem target. */}
        <button
          type="button"
          onClick={close}
          aria-label="Close the delivery offer"
          className="group absolute top-1 right-1 inline-flex size-11 items-center justify-center rounded-full"
        >
          <span
            aria-hidden
            className="text-nybb-ink/60 group-hover:bg-nybb-ink/8 group-hover:text-nybb-ink inline-flex size-8 items-center justify-center rounded-full transition-colors duration-200"
          >
            <X className="size-4" strokeWidth={2.5} />
          </span>
        </button>

        {/* The whole band is the link. Ink on orange, not the old site's
            white, which measured under 3:1. Same tab: the customer is going
            somewhere else to order, and a new tab hides where they went. */}
        <a
          href={TABLEVIBE_URL}
          className="delivery-card-band group bg-nybb-orange text-nybb-ink hover:bg-nybb-orange-lit relative flex min-h-14 items-center rounded-b-lg pr-4 pl-[4.75rem] transition-colors duration-200"
        >
          <span className="delivery-card-sticker absolute bottom-2 left-3 block">
            <Image
              src="/icon-192.png"
              alt=""
              width={52}
              height={52}
              className="ring-nybb-ink size-[3.25rem] rounded-md shadow-[0_6px_14px_-6px_rgba(11,11,12,0.7)] ring-2"
            />
          </span>
          <span className="font-display flex-1 text-center text-lg tracking-[0.08em] uppercase">
            Order now
            <span className="sr-only"> on Tablevibe</span>
          </span>
          <ArrowUpRight aria-hidden className="size-5 shrink-0" strokeWidth={2.5} />
        </a>
      </div>
    </aside>
  );
}
