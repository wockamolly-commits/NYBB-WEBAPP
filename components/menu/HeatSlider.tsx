"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { HotnessMeter, type HotnessMeterEnergy } from "@/components/menu/HotnessMeter";
import {
  heatSliderState,
  heatSweepSteps,
  heatSwatch,
  restingIndex,
  stopAt,
  type HeatStop,
} from "@/lib/menu/heat-slider";
import { isAlreadySeen } from "@/lib/site/reveal";
import { cn } from "@/lib/utils";

// Same swap, and for the same reason, as components/site/ScrollReveal.tsx:
// React renders every client component on the server once, and the effect
// below needs a DOM it will not find there.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Where the sweep's observer puts its trigger line, matching the page's other
 * reveals so the scale's block lands and the scale then starts.
 */
const SWEEP_ROOT_MARGIN = "0px 0px -10% 0px";

/**
 * The Level of Hotness, as one bar you slide.
 *
 * NYBB sells heat as a priced product and the scale is the brand's best visual
 * hook. It used to be drawn as a static ramp saying all five stops at once,
 * which is a price list of a thing rather than the thing. This is the same
 * five swatches, but you move along them and the bar burns to where you are.
 *
 * The control is a real `<input type="range">` lying invisible over the
 * artwork. Everything painted below it is `aria-hidden` decoration. That is
 * deliberate: drag, tap, arrow keys, Home and End, and a screen reader
 * announcing "Wild, 80 percent" all come from the platform rather than from a
 * hand-rolled `role="slider"` that would get two of those wrong.
 *
 * The ramp stays five fixed swatches and never becomes a gradient, for the
 * reason globals.css gives: a level is the same colour on a product page, a
 * receipt and a kitchen ticket. The track is hard bands, like the heat rule.
 */

export type HeatSliderVariant = "band" | "inline";

export function HeatSlider({
  stops,
  variant = "inline",
  label,
  value,
  onChange,
  prices,
  heading,
  className,
  sweepOnView = false,
}: {
  stops: HeatStop[];
  /** `band` is the landing page's full bleed moment. `inline` is everywhere else. */
  variant?: HeatSliderVariant;
  /** The accessible name of the control. */
  label: string;
  /**
   * The chosen slug, or null for "nothing chosen yet".
   *
   * Passing this makes the control controlled, which is what the wings
   * configurator does. Leaving it undefined makes it a showcase that keeps its
   * own position and commits nothing.
   */
  value?: string | null;
  onChange?: (slug: string) => void;
  /**
   * Play the scale once when it scrolls into view, stepping from the coldest
   * stop up to where an untouched showcase rests.
   *
   * Off everywhere but the landing page band. A controlled slider ignores it:
   * that one belongs to somebody's order, and moving a real choice on their
   * behalf is a different thing entirely from demonstrating a control that
   * commits nothing. See heatSweepSteps in lib/menu/heat-slider.ts for what
   * this does and does not take back from the rule it revives.
   */
  sweepOnView?: boolean;
  /**
   * Formatted upcharges keyed by stop slug, for the surfaces that show them.
   *
   * A map rather than a `(stop) => string` callback because the landing page
   * and the menu page are both server components, and a function cannot cross
   * that boundary. Pricing is formatted on the server either way.
   */
  prices?: Record<string, string | null>;
  /**
   * What the band sets opposite its readout, usually the section's own
   * heading and standfirst.
   *
   * A slot rather than a sibling, and the reason is the readout. The level
   * somebody is on is live, so it can only be drawn by the component holding
   * the value, and setting it beside the heading means the heading has to come
   * in here. Server rendered nodes cross into a client component as a prop
   * without becoming client code, so the heading stays a server component and
   * this file still owns nothing but the control.
   *
   * Left undefined everywhere but the landing band, where it turns the
   * showcase from a bar with a caption into a composed block: what heat is on
   * the left, what you are holding right now on the right, and the instrument
   * under both of them.
   */
  heading?: ReactNode;
  className?: string;
}) {
  const inputId = useId();

  /**
   * The showcase starts partway up the scale rather than at either end, so the
   * bar arrives already lit and the flame has something to do. A control that
   * opens empty reads as broken rather than as cold.
   */
  const resting = restingIndex(stops);
  const [ownIndex, setOwnIndex] = useState(resting);

  /**
   * How hard the fire burns under the hand: at rest, hovered or focused, and
   * being dragged. The meter idles on its own; this only turns it up.
   */
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const energy: HotnessMeterEnergy = dragging ? "drag" : hovered || focused ? "hover" : "idle";

  const controlled = value !== undefined;
  const state = heatSliderState(stops, value);
  const index = controlled ? state.index : ownIndex;
  const stop = stopAt(stops, index);

  // Untouched is not "No heat". An uncontrolled showcase commits nothing, so
  // it is never in the untouched state; a controlled one starts there and
  // leaves it on the first real interaction. See lib/menu/heat-slider.ts.
  const chosen = controlled ? state.chosen : true;

  /**
   * THE SHOWCASE PLAYS ITSELF ONCE, THEN GETS OUT OF THE WAY.
   * ================================================================
   * Everything about this is arranged so that the demonstration can never
   * outrank the hand. It only runs on the uncontrolled showcase, never on a
   * slider that belongs to somebody's order. It never runs for a reader who
   * asked for less motion, and it never runs for a reader who is already
   * looking at the scale, because a control that rearranges itself in front of
   * you is not a demonstration, it is a glitch. It cannot repeat: the observer
   * disconnects on the first crossing and there is no second schedule.
   *
   * And the first sign of a hand ends it. A pointer or a key stops it where it
   * stands, because a change event carrying the reader's own value is already
   * on its way. Focus stops it and lands on the resting stop instead, because
   * tabbing here brings no value with it, and the alternative is a reader who
   * pressed Tab being left holding the coldest stop the sweep happened to be
   * passing through.
   *
   * The opening state is never rendered on the server. `ownIndex` starts where
   * it has always started, so a reader with no JavaScript, a crawler and a
   * reduced motion reader all get the scale resting on Hot exactly as before.
   * Winding it back to the coldest stop happens in a layout effect, before
   * paint, on a block that is below the fold by the time we have agreed to do
   * it at all.
   */
  const root = useRef<HTMLDivElement>(null);
  /**
   * The scale itself, which is what the sweep's observer watches.
   *
   * Not the root. The root grew a heading slot above the bar, and an observer
   * on it would start the sweep when the section's headline crossed the line
   * rather than when the bar did: the scale would be performing to somebody
   * still reading the standfirst, several hundred pixels before it is on
   * screen. This element's top edge is where the root's top edge used to be,
   * so the trigger geometry the owner tuned is unchanged.
   */
  const scale = useRef<HTMLDivElement>(null);
  const sweepTimers = useRef<number[]>([]);
  const sweepRunning = useRef(false);

  function stopSweep() {
    for (const timer of sweepTimers.current) window.clearTimeout(timer);
    sweepTimers.current = [];
    sweepRunning.current = false;
  }

  /** A pointer or a key: stop, and let the change event say where to go. */
  function stopSweepForInput() {
    if (sweepRunning.current) stopSweep();
  }

  /** Focus: stop, and land on the stop the sweep was on its way to. */
  function stopSweepForFocus() {
    if (!sweepRunning.current) return;
    stopSweep();
    setOwnIndex(resting);
  }

  useIsomorphicLayoutEffect(() => {
    if (!sweepOnView || controlled) return;
    const node = scale.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (isAlreadySeen(node.getBoundingClientRect().top, window.innerHeight)) return;

    const steps = heatSweepSteps(resting);
    if (steps.length === 0) return;

    setOwnIndex(0);
    sweepRunning.current = true;

    const observer = new IntersectionObserver(
      (entries, self) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        self.disconnect();

        for (const step of steps) {
          sweepTimers.current.push(
            window.setTimeout(() => {
              if (!sweepRunning.current) return;
              setOwnIndex(step.index);
              if (step.index === resting) sweepRunning.current = false;
            }, step.at),
          );
        }
      },
      { rootMargin: SWEEP_ROOT_MARGIN },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      stopSweep();
    };
  }, [sweepOnView, controlled, resting]);

  if (!stop || stops.length === 0) return null;

  const percent = stop.percent;
  const price = prices?.[stop.slug] ?? null;

  function commit(next: number) {
    const target = stopAt(stops, next);
    if (!target) return;
    if (!controlled) setOwnIndex(Math.min(Math.max(next, 0), stops.length - 1));
    onChange?.(target.slug);
  }

  /**
   * Working an untouched control is itself a choice.
   *
   * Without this, the coldest stop is unreachable. An untouched slider parks
   * its thumb at index 0, so pressing Left or Home, or clicking the far end of
   * the track, leaves the input's value where it already was and fires no
   * change event at all. The customer who specifically wants "No heat" presses
   * the key, watches nothing happen, and is left on "Pick a level".
   *
   * So any deliberate interaction commits whatever the thumb is already on. A
   * press that does move the value still fires its own change afterwards and
   * wins, which is why this only ever commits the current index.
   */
  function commitIfUntouched() {
    if (!chosen) commit(index);
  }

  /**
   * The level, the percent and the upcharge, drawn once and placed in one of
   * two spots: beside the heading when the band passes one, and under the bar
   * otherwise.
   *
   * THE NAME TAKES ITS OWN SWATCH. DESIGN.md asks for the ramp's five fixed
   * colours wherever a heat level appears, and this is the largest place one
   * appears on the site. Bone said nothing; the swatch means the word changes
   * colour as the thumb climbs, so the band's second largest object is part of
   * the mechanism rather than a caption of it.
   *
   * The darkest of the five is Heat 5, at 4.60:1 on bare Char and 4.20:1 read
   * back off the lit ground the band's readout actually sits on. The name is
   * set between 48px and 88px, which is large text several times over, so the
   * bar it has to clear is 3:1 and the coldest stop clears 14.77:1. Heat 4 is
   * 4.84:1 and Heat 3, where the showcase rests, is 6.38:1. "Pick a level" is
   * not a level, so it stays bone.
   */
  const readout = (
    <p
      className="heat-slider__readout"
      aria-hidden
      style={
        {
          "--readout-swatch": chosen ? heatSwatch(percent) : "var(--color-nybb-bone)",
        } as React.CSSProperties
      }
    >
      <span className="heat-slider__name">{chosen ? stop.name : "Pick a level"}</span>
      {chosen ? <span className="heat-slider__percent">{percent}%</span> : null}
      {chosen && price ? <span className="heat-slider__price">{price}</span> : null}
    </p>
  );

  return (
    <div
      ref={root}
      className={cn("heat-slider", className)}
      data-variant={variant}
      data-chosen={chosen}
    >
      {heading ? (
        <div className="heat-slider__head">
          {heading}
          {readout}
        </div>
      ) : null}

      {/* The picture. The lit run covers whole segments, so the coldest stop
          still shows its own band rather than a hairline, and an untouched
          control draws a cold tube with a hollow pointer rather than claiming
          the first stop. */}
      <div ref={scale} className="heat-slider__scale">
        <HotnessMeter
          score={chosen ? percent : 0}
          fill={chosen ? (index + 1) / stops.length : 0}
          stops={stops}
          activeStop={chosen ? index : null}
          unset={!chosen}
          energy={energy}
          size={variant === "band" ? "large" : "medium"}
          decorative
        >
          <label className="sr-only" htmlFor={inputId}>
            {label}
          </label>
          <input
            id={inputId}
            className="heat-slider__input"
            type="range"
            min={0}
            max={stops.length - 1}
            step={1}
            value={index}
            // The percentage is the brand's own number and the name is what a
            // customer orders by, so the reader gets both rather than "3".
            aria-valuetext={`${stop.name}, ${percent} percent heat`}
            onChange={(event) => commit(Number(event.target.value))}
            onKeyDown={() => {
              stopSweepForInput();
              commitIfUntouched();
            }}
            onPointerDown={() => {
              stopSweepForInput();
              setDragging(true);
              commitIfUntouched();
            }}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            onFocus={() => {
              stopSweepForFocus();
              setFocused(true);
            }}
            onBlur={() => {
              setFocused(false);
              setDragging(false);
            }}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => {
              setHovered(false);
              setDragging(false);
            }}
          />
        </HotnessMeter>
      </div>

      {heading ? null : readout}
    </div>
  );
}
