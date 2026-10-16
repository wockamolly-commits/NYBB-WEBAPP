"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * The way back up once the header has slid away.
 *
 * It appears after most of a screen has been scrolled, which is the point
 * where reaching the top by hand stops being one flick.
 *
 * WHERE IT SITS. Bottom left, and above whatever else is floating there. The
 * corners of this storefront are already in use: the delivery card on the
 * right, the promo reminder on the left, and the cart bar across the bottom of
 * a phone. All three can be closed or can be absent, so instead of a fixed
 * offset per combination (which is how the delivery card does it, and it
 * already needs four), the button measures what is actually on screen in its
 * column and stands on top of the highest one.
 *
 * On click the page glides to the top, or jumps there under reduced motion,
 * and focus goes to the logo. The button itself disappears at the top, so
 * leaving focus on it would drop a keyboard user back at the start of the
 * document with nothing focused.
 */

const SHOW_AFTER = 0.8;
const GAP = 12;
const EDGE = 16;
const OBSTACLES = '.delivery-card[data-shown="true"], .promo-float[data-shown="true"], [data-cart-bar]';

export function BackToTop() {
  const [shown, setShown] = useState(false);
  // Null while nothing is in the way: the button then sits on the default
  // inset plus the home indicator. A measured value already includes it,
  // because whatever it is standing on was laid out clear of it.
  const [bottom, setBottom] = useState<number | null>(null);

  useEffect(() => {
    let frame = 0;

    function measure() {
      frame = 0;
      setShown(window.scrollY > window.innerHeight * SHOW_AFTER);

      // The button's column: the left edge, the inset plus its own width.
      const left = window.innerWidth >= 640 ? 24 : EDGE;
      const right = left + 48;
      let floor = window.innerHeight - EDGE;
      const boxes = Array.from(document.querySelectorAll<HTMLElement>(OBSTACLES))
        .map((element) => element.getBoundingClientRect())
        .filter((box) => box.height > 0 && box.left < right && box.right > left)
        .sort((a, b) => b.bottom - a.bottom);
      for (const box of boxes) {
        if (box.bottom > floor - GAP && box.top < floor) floor = box.top - GAP;
      }
      const lifted = window.innerHeight - floor;
      setBottom(lifted > EDGE ? lifted : null);
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(measure);
    }

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // The cards announce themselves through data-shown and slide in with a
    // transition, so watch for both rather than polling.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-shown"],
    });
    document.addEventListener("transitionend", schedule);

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("transitionend", schedule);
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  function toTop() {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, left: 0, behavior: still ? "auto" : "smooth" });
    document.querySelector<HTMLElement>(".site-header a")?.focus({ preventScroll: true });
  }

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      data-shown={shown}
      inert={!shown}
      style={{
        bottom: bottom === null ? `calc(env(safe-area-inset-bottom) + ${EDGE}px)` : `${bottom}px`,
      }}
      className="back-to-top bg-nybb-charcoal text-nybb-bone border-nybb-bone/15 hover:border-nybb-orange focus-visible:outline-nybb-orange fixed left-4 z-30 inline-flex size-12 items-center justify-center rounded-full border shadow-[0_14px_32px_-12px_rgba(11,11,12,0.6)] focus-visible:outline-2 focus-visible:outline-offset-2 sm:left-6"
    >
      <ArrowUp aria-hidden className="size-5" strokeWidth={2.25} />
    </button>
  );
}
