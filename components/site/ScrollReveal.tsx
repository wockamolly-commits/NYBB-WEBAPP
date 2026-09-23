"use client";

import { useEffect, useLayoutEffect } from "react";
import { isAlreadySeen, revealDelayMs } from "@/lib/site/reveal";

/**
 * The scroll reveals, and the one place on the site that decides whether they
 * happen at all.
 *
 * DESIGN.md banned blanket section entrances, and the ban still stands in its
 * narrowed form: what is not allowed is one identical fade applied to every
 * section in turn, because seven of those say nothing about any of them. What
 * is allowed is a list arriving as a list. So this component animates nothing
 * by itself. It finds the two markers the markup carries, `.reveal` for a
 * single element and `.reveal-stagger` for a container whose children are a
 * sequence, and it is the markup that decides which passages are sequences.
 * The prose sections carry neither and are never touched.
 *
 * NOTHING IS HIDDEN BY THE STYLESHEET, WHICH IS THE WHOLE DESIGN HERE.
 * ================================================================
 * `.reveal` and `.reveal-stagger` have no declarations against them. The
 * hidden state keys on `[data-reveal]`, and the only thing in the codebase
 * that writes that attribute is the effect below. So the page ships drawn:
 * a reader with JavaScript off, a crawler, a browser without
 * IntersectionObserver and a reader with reduced motion set all get the
 * finished page, and none of them is relying on a script to give the content
 * back. This is the same rule the heat meter follows, and it is the reason
 * that meter draws a complete still fire rather than an empty box.
 *
 * WHY IT RUNS BEFORE PAINT.
 * ================================================================
 * The server sends the content visible, so hiding it is a change, and a change
 * made in `useEffect` lands after the browser has painted: the reader sees the
 * tiles, then sees them vanish, then sees them fade back. `useLayoutEffect`
 * runs in the same frame as hydration and the hide is never painted. The
 * groups already on screen at that moment are left alone entirely, so the one
 * case where a flash would have been visible is also the case that is never
 * touched.
 */

// `useLayoutEffect` warns when React renders it on the server, which Next does
// for every client component. The swap is the documented way around it and
// costs nothing: the effect body needs a DOM and there is no DOM to need.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * How far into the viewport a group has to come before its wave starts.
 *
 * Negative, so the trigger line sits a tenth of the viewport above the bottom
 * edge rather than on it. On the edge, a tile begins fading up at the instant
 * its first pixel appears, which on a fast scroll means the reader meets it
 * mid-transition every time. A tenth of a screen of lead means the wave has
 * usually finished by the time the group is properly in front of them.
 */
const REVEAL_ROOT_MARGIN = "0px 0px -10% 0px";

export function ScrollReveal() {
  useIsomorphicLayoutEffect(() => {
    // Read once, and do not subscribe to changes. Somebody who turns reduced
    // motion on halfway down the page is served by the stylesheet's own
    // reduced-motion block, which flattens anything already hidden; re-running
    // this would mean tearing observers down mid-scroll for no gain.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;

    // A group is a trigger element plus the items whose arrival it drives.
    // A `.reveal` drives itself; a `.reveal-stagger` drives its own children,
    // so the wave keys on the grid entering the viewport rather than on each
    // tile entering separately. Per-tile observation looks correct in a
    // description and wrong on a screen: in a five column grid the top row
    // would cross the line together and fire five identical transitions at
    // once, which is not a stagger, and on a phone the second column would
    // start a beat after the first for no reason a reader could name.
    const groups: { trigger: HTMLElement; items: HTMLElement[] }[] = [];

    for (const el of document.querySelectorAll<HTMLElement>(".reveal")) {
      groups.push({ trigger: el, items: [el] });
    }

    for (const el of document.querySelectorAll<HTMLElement>(
      ".reveal-stagger",
    )) {
      const items = Array.from(el.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      );
      if (items.length === 0) continue;
      groups.push({ trigger: el, items });
    }

    const observers: IntersectionObserver[] = [];
    const listeners: (() => void)[] = [];
    const hidden: HTMLElement[] = [];

    for (const { trigger, items } of groups) {
      // Already in front of the reader when the script came up. Leave it
      // drawn: an entrance nobody watches from the start is an entrance that
      // did not happen, and hiding it now would be the only way to produce a
      // flash on this page.
      if (
        isAlreadySeen(trigger.getBoundingClientRect().top, window.innerHeight)
      )
        continue;

      items.forEach((item, index) => {
        item.style.setProperty("--reveal-delay", `${revealDelayMs(index)}ms`);
        item.setAttribute("data-reveal", "");
        hidden.push(item);
      });

      // Once only. A group that fades back out on the way up would be telling
      // the reader something about scroll position rather than about the
      // content, and it would run the whole wave again every time somebody
      // scrolled past it.
      const settle = (state: "in" | "shown") => {
        for (const item of items) item.setAttribute("data-reveal", state);
        observer.disconnect();
      };

      // `shown` rather than `in`: the same end state with the transition taken
      // off, because somebody who has tabbed here is waiting for the focus
      // ring rather than watching the group arrive.
      //
      // This stays attached after the observer has fired, and that is the
      // point. A wave is up to 280ms of stagger, so a group can be `in` and
      // still hold an item at zero opacity: the eighth flavour tile is waiting
      // out its delay while the first has already landed. A reader tabbing
      // quickly reaches that item before it starts. Focus ends the wave rather
      // than joining it.
      const onFocus = () => {
        if (items[0]?.getAttribute("data-reveal") === "shown") return;
        settle("shown");
      };

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) settle("in");
        },
        { rootMargin: REVEAL_ROOT_MARGIN },
      );

      observer.observe(trigger);
      observers.push(observer);

      // THE KEYBOARD GETS THERE BEFORE THE SCROLL DOES.
      // ================================================================
      // Every group on this page contains something focusable: the headers
      // carry their section's text link, the flavour tiles are links, the
      // counters are `tel:` numbers, and the heat scale is a range input. A
      // reader tabbing down the page reaches one of those while it is still
      // at zero opacity. The browser then scrolls it into view, which does
      // eventually trip the observer, but an observer is asynchronous and the
      // focus ring is not: there is a frame or two where the focused control
      // is invisible, and on a slow device rather more than that.
      //
      // So focus reveals the group outright. It also covers the case the
      // observer cannot see at all, which is a control scrolled into view
      // inside a container the root observer is not watching.
      trigger.addEventListener("focusin", onFocus);
      listeners.push(() => trigger.removeEventListener("focusin", onFocus));
    }

    return () => {
      for (const observer of observers) observer.disconnect();
      for (const off of listeners) off();
      // Hand the content back rather than leaving it at whatever opacity the
      // teardown caught it in. This runs on a route change, where the nodes
      // are going anyway, and on React's development double-invoke, where the
      // effect is about to re-run and re-decide from a clean state.
      for (const item of hidden) {
        item.removeAttribute("data-reveal");
        item.style.removeProperty("--reveal-delay");
      }
    };
  }, []);

  return null;
}
