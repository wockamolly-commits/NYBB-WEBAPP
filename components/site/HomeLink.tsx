"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The way back to the hero, from the logo and from a refresh.
 *
 * The hero is the first thing on `/`, directly under the header, so "the hero"
 * and "the top of the home page" are the same position. Scrolling the window
 * to 0 reaches it exactly; scrolling an element into view would put its top
 * under the sticky header instead.
 */

function prefersStillness(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function toHero(behavior: ScrollBehavior) {
  window.scrollTo({ top: 0, left: 0, behavior });
}

/**
 * The logo link.
 *
 * ALREADY HOME: the click is taken over and the page glides back to the hero.
 * A plain Link to the current URL would do nothing visible from halfway down
 * the page, which reads as a dead logo. Any `#section` in the URL is cleared
 * with it, so a later refresh does not jump back down to that anchor.
 *
 * ANYWHERE ELSE: an ordinary client navigation to `/`. The App Router lands a
 * new page at the top already, which is the hero.
 *
 * Modified clicks (a new tab, a new window) are left to the browser.
 */
export function HomeLink({
  className,
  children,
  "aria-label": ariaLabel,
}: {
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  const pathname = usePathname();

  return (
    <Link
      href="/"
      className={className}
      aria-label={ariaLabel}
      onClick={(event) => {
        if (pathname !== "/") return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
          return;
        }
        event.preventDefault();
        if (window.location.hash) {
          window.history.replaceState(window.history.state, "", "/");
        }
        // A behavior passed to scrollTo outranks the global reduced-motion
        // rule in globals.css, so the preference is asked for here.
        toHero(prefersStillness() ? "auto" : "smooth");
      }}
    >
      {children}
    </Link>
  );
}

/**
 * A refresh of the home page starts at the hero.
 *
 * Browsers restore the scroll position on reload, so a refresh from the
 * flavours section came back to the flavours section. Two halves:
 *
 *  - On the way out of a full page unload (a reload, or leaving the site),
 *    scrollRestoration is set to manual, so the browser has nothing to put
 *    back when this document loads again. `pagehide` and not a client
 *    navigation: moving to /menu inside the app never unloads the document,
 *    so Back and Forward between pages keep their native scroll memory.
 *  - On the way in, after a reload, the window goes to the top regardless,
 *    for a browser that restored before this ran. Then restoration is handed
 *    back to the browser for the rest of the visit.
 *
 * Instant rather than smooth: a page that loads and then visibly scrolls
 * itself reads as a glitch, not a gesture.
 */
export function HomeTopOnReload() {
  useEffect(() => {
    const entry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (entry?.type === "reload") toHero("auto");
    window.history.scrollRestoration = "auto";

    const leaving = () => {
      window.history.scrollRestoration = "manual";
    };
    window.addEventListener("pagehide", leaving);
    return () => window.removeEventListener("pagehide", leaving);
  }, []);

  return null;
}
