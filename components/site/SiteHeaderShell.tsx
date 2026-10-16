"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The header's own element, and the only part of it that has to run in the
 * browser: it slides away while the customer scrolls down and comes back the
 * moment they scroll up. Everything inside it stays server rendered, passed
 * through as children, so the session reads in Header.tsx are untouched.
 *
 * WHY IT COMES BACK ON ANY UPWARD SCROLL rather than only at the top. Scrolling
 * up is the gesture of somebody looking for a way out of the page, and the
 * header is the way out. Making them travel the whole page to reach it is
 * what the back to top button is for, not the default.
 *
 * It stays put while keyboard focus is inside it, so somebody tabbing through
 * the nav never has it slide out from under the focus ring. Keyboard focus
 * only, by way of `:focus-visible`: a mouse click on a nav link leaves that
 * link focused too, and the header persists across navigations, so plain
 * focus would pin it open for the rest of the visit.
 *
 * The state is mirrored onto `<html data-header-hidden>` so the menu page's
 * category rail, which is pinned directly under the header, can move up into
 * the space instead of leaving a strip of page showing above it. See
 * `.category-rail` in globals.css.
 */

/** Below this the header is always shown: the promo band and the top of the hero. */
const REVEAL_ZONE = 120;
/** Ignore jitter from trackpads and the address bar resizing on a phone. */
const MIN_DELTA = 6;

export function SiteHeaderShell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;

    function update() {
      frame = 0;
      const y = window.scrollY;
      const delta = y - lastY;
      const focusInside = Boolean(ref.current?.querySelector(":focus-visible"));

      if (y <= REVEAL_ZONE || focusInside) {
        setHidden(false);
        lastY = y;
      } else if (Math.abs(delta) >= MIN_DELTA) {
        setHidden(delta > 0);
        lastY = y;
      }
    }

    function onScroll() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (hidden) root.dataset.headerHidden = "";
    else delete root.dataset.headerHidden;
    return () => {
      delete root.dataset.headerHidden;
    };
  }, [hidden]);

  return (
    <header
      ref={ref}
      data-hidden={hidden}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) setHidden(false);
      }}
      className={cn("site-header", className)}
    >
      {children}
    </header>
  );
}
