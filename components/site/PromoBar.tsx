"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, X } from "lucide-react";
import { PromoStub } from "@/components/promos/PromoStub";
import { cartQuantity } from "@/lib/cart/lines";
import { useCart } from "@/lib/cart/use-cart";
import { promoHeadline, type Promo } from "@/lib/promos/schema";
import { cn } from "@/lib/utils";

/**
 * The line that says a promo is running, in two forms.
 *
 * THE BAND is an ink strip under the header, seen on arrival: the code as a
 * counter ticket stub, what it is worth in the display face, and what it
 * covers underneath.
 *
 * THE REMINDER is a small floating ticket in the bottom left corner, and it
 * only exists while the band is off screen. The owner asked on 2026-09-23 for
 * the promo to stay in view while somebody scrolls. Pinning the band inside
 * the sticky header would have done that by taking a strip of every screen for
 * the whole session, which is the difference between noticeable and
 * obtrusive. The reminder is the size of the code and its value and nothing
 * more, it sits above the cart bar rather than on it, and scrolling back up
 * hands the job back to the band.
 *
 * CLOSING IT LASTS AS LONG AS THE PAGE, AND NO LONGER. One X closes both
 * forms. A refresh or a step to another page brings the promo back, because a
 * promo running today is worth saying again (owner's call, 2026-09-23).
 *
 * WHY THAT NEEDED A PATHNAME. The bar lives in the storefront layout, and a
 * layout does not remount when you move between the pages inside it, so plain
 * `useState` would have survived exactly the navigation it is supposed to
 * reset on.
 *
 * WHAT IS PERMANENT is having spent the code. `list_customer_promos` (0076)
 * and the layout's `nybb_promos_used` filter both remove spent promos before
 * this component sees them, so anything here is a promo the customer could
 * still use.
 *
 * NEITHER FORM IS A LIVE REGION. The band is in the document from first paint,
 * and the reminder repeats it, so announcing either would read an advert aloud
 * on every page. Both are labelled landmarks somebody can skip, and the
 * reminder is `inert` while it is hidden so a keyboard never lands on it.
 */

/**
 * Where the bar would be repeating itself.
 *
 * `/checkout` already has the promo code field and its suggestions in front of
 * the customer, and `/promos` is the page the bar exists to point at. On
 * checkout a floating ticket would also sit over the order summary on a
 * phone, which is the one screen nothing is allowed to cover.
 */
const HIDDEN_ON = ["/checkout", "/promos"];

export function PromoBar({ promos }: { promos: readonly Promo[] }) {
  const pathname = usePathname();
  const { cart, loaded } = useCart();
  const [closed, setClosed] = useState(false);
  const [closedOn, setClosedOn] = useState(pathname);
  const [bandInView, setBandInView] = useState(true);
  // Which promo both forms are showing. One index for the band and the
  // reminder, so stepping in one is stepping in the other: they are two views
  // of the same message, never two different promos at once.
  const [current, setCurrent] = useState(0);
  // Set only by pressing Next, so the status below speaks in answer to the
  // customer's own action and never on page load (see NEITHER FORM IS A LIVE
  // REGION above).
  const [announcement, setAnnouncement] = useState("");
  const band = useRef<HTMLElement>(null);

  // REOPEN ON EVERY NAVIGATION, adjusted during render rather than in an
  // effect, which is React's documented shape for "reset state when something
  // changes": no flash of the closed bar, and no cascading render.
  //
  // It tracks the last path SEEN rather than the path the close happened on.
  // Closing on the home page, stepping to the menu and coming back is a
  // return to a stored path, and the owner asked for that to bring it back.
  if (closedOn !== pathname) {
    setClosedOn(pathname);
    setClosed(false);
  }

  const hiddenHere = HIDDEN_ON.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  const showing = promos.length > 0 && !hiddenHere && !closed;

  // Watches the band rather than a scroll offset, so "off screen" means off
  // screen whatever the header's height is at this breakpoint. The top margin
  // is the sticky header's taller height (88px from sm), because a band slid
  // under the header is hidden from the customer even though it is still
  // inside the viewport.
  useEffect(() => {
    const node = band.current;
    if (!showing || !node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setBandInView(entry.isIntersecting),
      { rootMargin: "-88px 0px 0px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [showing, pathname]);

  if (!showing) return null;

  // Starts on the one the reader sorted first, which is the one expiring
  // soonest. With more than one, Next steps through them and wraps, so there
  // is no dead end at the last. The modulo keeps the index valid if a refresh
  // hands over a shorter list.
  const many = promos.length > 1;
  const at = current % promos.length;
  const promo = promos[at];
  const { value, scope } = promoHeadline(promo);

  function next() {
    const following = (at + 1) % promos.length;
    setCurrent(following);
    const upcoming = promoHeadline(promos[following]);
    setAnnouncement(
      `Promo ${following + 1} of ${promos.length}: ${promos[following].code}` +
        (upcoming.value ? `, ${upcoming.value}` : ""),
    );
  }

  // The cart bar is pinned to the bottom below `lg` whenever the cart has
  // something in it, except on the cart page itself. The reminder sits on top
  // of it rather than behind it.
  const cartBarShowing = loaded && cartQuantity(cart) > 0 && pathname !== "/cart";
  const floatShown = !bandInView;

  return (
    <>
      <aside
        ref={band}
        aria-label="Promo"
        className="band-ink text-nybb-bone border-nybb-bone/10 border-b"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:gap-3 sm:px-6">
          {/* The whole message is one link. At 320px a second inline target
              is what pushes this into two rows and crowds the close button. */}
          <Link
            href="/promos"
            className="group flex min-h-11 min-w-0 flex-1 items-center gap-3 sm:gap-4"
          >
            <PromoStub key={`stub-${promo.code}`} code={promo.code} className={many ? "promo-swap" : undefined} />
            <span key={`copy-${promo.code}`} className={cn("min-w-0 flex-1", many && "promo-swap")}>
              {value ? (
                <span className="font-display block text-lg leading-tight tracking-wide uppercase sm:text-xl">
                  {value}
                </span>
              ) : null}
              {/* bone/70, above this system's bone/55 floor, because this is
                  a sentence and not a caption. */}
              <span className="text-nybb-bone/70 block truncate text-xs leading-snug sm:text-sm">
                {scope}

              </span>
            </span>
            {/* Styled as the dark primary, but it is the same link rather
                than a second target, so it adds a place to aim without adding
                a tab stop. Hidden on a phone, where the whole band is already
                a thumb-sized target. */}
            <span
              aria-hidden
              className="font-display bg-nybb-orange text-nybb-ink group-hover:bg-nybb-orange-lit hidden min-h-11 shrink-0 items-center rounded-md px-4 text-sm tracking-[0.06em] uppercase transition-colors duration-200 sm:inline-flex"
            >
              {many ? "See promos" : "See the promo"}
            </span>
          </Link>

          {many ? (
            <NextButton
              onNext={next}
              position={at + 1}
              total={promos.length}
              showCount
            />
          ) : null}
          <CloseButton code={promo.code} onClose={() => setClosed(true)} />
        </div>
      </aside>

      <aside
        aria-label="Promo reminder"
        data-shown={floatShown}
        inert={!floatShown}
        className={cn(
          "promo-float fixed left-4 z-30 sm:left-6",
          // Clear of the cart bar and the home indicator on a phone. The cart
          // bar is below `lg` only, so on a desktop it is one fixed inset.
          cartBarShowing
            ? "bottom-[calc(env(safe-area-inset-bottom)+5.75rem)]"
            : "bottom-[calc(env(safe-area-inset-bottom)+1rem)]",
          "lg:bottom-6",
        )}
      >
        <div className="bg-nybb-charcoal text-nybb-bone border-nybb-bone/15 flex max-w-[calc(100vw-2rem)] items-center rounded-md border shadow-[0_14px_32px_-12px_rgba(11,11,12,0.6)]">
          <Link
            href="/promos"
            className="group flex min-h-12 min-w-0 items-center gap-3 py-1.5 pl-1.5"
          >
            <PromoStub
              key={`float-stub-${promo.code}`}
              code={promo.code}
              size="sm"
              className={many ? "promo-swap" : undefined}
            />
            {value ? (
              <span
                key={`float-value-${promo.code}`}
                className={cn(
                  "font-display group-hover:text-nybb-orange truncate text-base tracking-wide uppercase transition-colors duration-200",
                  many && "promo-swap",
                )}
              >
                {value}
              </span>
            ) : (
              <span className="truncate text-sm">See the promo</span>
            )}
          </Link>
          {many ? (
            <NextButton onNext={next} position={at + 1} total={promos.length} />
          ) : null}
          <CloseButton code={promo.code} onClose={() => setClosed(true)} />
        </div>
      </aside>

      {/* Outside both landmarks, so it is the same one message whichever
          form the Next was pressed in, and empty until somebody presses it. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

/**
 * The step to the following promo, offered only when there is one.
 *
 * Next and not a pair of arrows. The band has the width of a phone and
 * already holds the ticket, the offer and the close button, and the promos
 * wrap, so one direction reaches every one of them. The count sits beside it
 * on the band, in the same muted bone as the scope line, so "there are three"
 * is said once, where the control that walks them is.
 */
function NextButton({
  onNext,
  position,
  total,
  showCount = false,
}: {
  onNext: () => void;
  position: number;
  total: number;
  showCount?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onNext}
      aria-label={`Next promo, ${position} of ${total} showing`}
      className="text-nybb-bone/70 hover:text-nybb-bone flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-md transition-colors duration-200"
    >
      {showCount ? (
        <span
          aria-hidden
          className="font-mono-tabular text-xs"
        >
          {position}/{total}
        </span>
      ) : null}
      <ChevronRight aria-hidden className="size-5" />
    </button>
  );
}

function CloseButton({ code, onClose }: { code: string; onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      // 2.75rem square, the floor this system uses everywhere, and it has to
      // hold at 320px where everything else is being squeezed.
      className="text-nybb-bone/55 hover:text-nybb-bone flex min-h-11 min-w-11 shrink-0 items-center justify-center transition-colors duration-200"
      // "Hide" rather than "Dismiss", because it comes back on the next page
      // and a label promising otherwise would be a small lie.
      aria-label={`Hide the ${code} promo on this page`}
    >
      <X aria-hidden className="h-4 w-4" />
    </button>
  );
}
