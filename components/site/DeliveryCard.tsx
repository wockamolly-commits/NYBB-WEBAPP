"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowUpRight, X } from "lucide-react";
import { LOGO_CLICK_EVENT } from "@/components/site/HomeLink";
import { DELIVERY_CARD_COPY, TABLEVIBE_URL, deliveryCardAllowedOn } from "@/lib/site/delivery-card";

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
 * floating reminder. Below `lg` it stands on whatever is already floating at
 * the bottom of the screen, the cart bar and the promo reminder, and the CSS
 * works that out from what is actually showing (see `.delivery-card` in
 * globals.css), so it closes the gap when the reminder slides away instead of
 * holding a space for it. It never appears on the cart, checkout or order
 * pages (see delivery-card.ts).
 *
 * ON A PHONE IT IS ONE ROW. The full card is nearly a third of a small
 * screen, and stacked on the reminder it covered the menu it was sitting on.
 * Below `sm` the tile, the headline and the orange Order button share a
 * single line that is one link, it spans the same gutters as the reminder
 * beneath it so their edges line up, and the close button moves to the
 * corner so it takes no width from the headline.
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

export function DeliveryCard() {
  const pathname = usePathname();
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

  const { headline, line } = DELIVERY_CARD_COPY;

  return (
    <aside
      aria-label="Delivery"
      data-shown={shown}
      inert={!shown}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
      className="delivery-card fixed inset-x-4 z-30 sm:right-6 sm:left-auto sm:w-[21rem]"
    >
      <div className="bg-nybb-bone text-nybb-ink ring-nybb-ink/10 relative rounded-lg shadow-[0_18px_40px_-16px_rgba(11,11,12,0.6)] ring-1">
        {/* The phone row. The whole row is the link, so the target is the
            card's full width rather than the button alone. */}
        <a
          href={TABLEVIBE_URL}
          className="delivery-card-band group flex min-h-16 items-center gap-3 py-2 pr-2 pl-2.5 sm:hidden"
        >
          <span className="delivery-card-sticker block shrink-0">
            <Image
              src="/icon-192.png"
              alt=""
              width={44}
              height={44}
              className="ring-nybb-ink size-11 rounded-md shadow-[0_6px_14px_-6px_rgba(11,11,12,0.7)] ring-2"
            />
          </span>
          <span className="font-display min-w-0 flex-1 text-base leading-[1.1] tracking-[0.01em] text-balance">
            {headline}
          </span>
          <span className="font-display bg-nybb-orange group-hover:bg-nybb-orange-lit inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-3 text-sm tracking-[0.08em] uppercase transition-colors duration-200">
            Order
            <span className="sr-only"> now on Tablevibe</span>
            <ArrowUpRight aria-hidden className="size-4" strokeWidth={2.5} />
          </span>
        </a>

        <div className="hidden px-4 pt-4 pr-12 pb-3.5 sm:block">
          <p className="font-display text-xl leading-[1.1] tracking-[0.01em] text-balance">
            {headline}
          </p>
          <p className="text-nybb-ink/75 mt-1.5 text-sm leading-snug">{line}</p>
        </div>

        {/* The disc is 2rem (1.75rem on a phone); the button around it is the
            2.75rem target. On a phone it sits on the corner, half off the
            card, so it carries its own plate to read against the page. */}
        <button
          type="button"
          onClick={close}
          aria-label="Close the delivery offer"
          className="group absolute -top-4 -right-3 inline-flex size-11 items-center justify-center rounded-full sm:top-1 sm:right-1"
        >
          <span
            aria-hidden
            className="bg-nybb-bone text-nybb-ink/75 ring-nybb-ink/15 group-hover:text-nybb-ink sm:text-nybb-ink/60 sm:group-hover:bg-nybb-ink/8 inline-flex size-7 items-center justify-center rounded-full shadow-[0_4px_10px_-4px_rgba(11,11,12,0.6)] ring-1 transition-colors duration-200 sm:size-8 sm:bg-transparent sm:shadow-none sm:ring-0"
          >
            <X className="size-4" strokeWidth={2.5} />
          </span>
        </button>

        {/* The whole band is the link. Ink on orange, not the old site's
            white, which measured under 3:1. Same tab: the customer is going
            somewhere else to order, and a new tab hides where they went. */}
        <a
          href={TABLEVIBE_URL}
          className="delivery-card-band group bg-nybb-orange text-nybb-ink hover:bg-nybb-orange-lit relative hidden min-h-14 items-center rounded-b-lg pr-4 pl-[4.75rem] transition-colors duration-200 sm:flex"
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
