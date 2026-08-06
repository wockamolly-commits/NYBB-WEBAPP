"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * What each level of heat costs.
 *
 * WHY THIS IS A PRICE LIST AND NOT A RAMP ANY MORE.
 * ================================================================
 * It used to be five tall bars ascending left to right, which was the right
 * object right up until the hero started doing exactly that. Two drawings of
 * one ramp inside two screens is not a statement and its restatement, it is a
 * repeat, and the second one arrives having already been seen. That cost the
 * page its only authored moment: five stops drawing themselves is a reveal, and
 * a reveal of something the visitor met a screen and a half ago reveals
 * nothing.
 *
 * So the two surfaces were split by job rather than by size. The hero strip
 * says heat is sold on a scale. This says what each stop costs, which is the
 * question somebody actually has once they believe the first part, and it is
 * the question the section's own heading has always asked ("Heat is on the
 * menu", "pay for the level, not for a different dish"). Prices lead now, in
 * the numeric face, aligned in a column so five upcharges can be compared at a
 * glance. That is a menu, and this is a restaurant.
 *
 * The measure survives as a row-length bar rather than a column-height one. It
 * is still the level's own fixed swatch, because a level is the same colour on
 * a product page, a receipt and a kitchen ticket, but it now reads as the data
 * bar in a priced row rather than as a second ramp. The authored moment lives
 * here, where it always did: the five bars extend in sequence as the section
 * arrives, and horizontally at every width now that the layout no longer
 * flips.
 */

/** Static class names, so Tailwind's scanner can see all five. */
const RAMP = [
  "bg-nybb-heat-1",
  "bg-nybb-heat-2",
  "bg-nybb-heat-3",
  "bg-nybb-heat-4",
  "bg-nybb-heat-5",
] as const;

export type HeatLevel = {
  slug: string;
  name: string;
  percent: number;
  /** Already formatted, because pricing lives on the server. */
  half: string;
  full: string;
};

export function HeatScale({
  levels,
  className,
}: {
  levels: HeatLevel[];
  className?: string;
}) {
  const ref = useRef<HTMLOListElement>(null);

  /**
   * True is the honest default. It is what the server renders, what a visitor
   * with no JavaScript keeps, and what anyone who asked for reduced motion
   * gets. The bars are only ever rewound on the client, and only for a section
   * still below the fold, so nothing already on screen collapses under the
   * reader.
   */
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Already in view at hydration means it has been seen. Animating it now
    // would be a flash of the wrong thing, not an entrance.
    if (element.getBoundingClientRect().top < window.innerHeight * 0.85) return;

    setShown(false);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <ol ref={ref} className={cn("w-full", className)}>
      {levels.map((level, index) => (
        <li
          key={level.slug}
          className={cn(
            "border-nybb-bone/15 grid items-baseline gap-x-5 gap-y-4 border-t py-5",
            // Phone: the name and the two prices on one line, the measure
            // spanning underneath. Desktop: the measure takes the middle,
            // where it is read against the prices on its right.
            "grid-cols-[minmax(0,1fr)_auto_auto]",
            "sm:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_5rem_5rem] sm:items-center sm:gap-x-8",
          )}
        >
          <div className="min-w-0">
            <p className="font-display text-lg leading-none sm:text-xl">
              {level.name}
            </p>
            <p className="font-mono-tabular text-nybb-bone/55 mt-2 text-xs leading-none">
              {level.percent}%
            </p>
          </div>

          {/* The measure. A fixed track so all five are read against one
              length, with the bar's real width set from the percentage and the
              reveal scaling it rather than resizing it, so nothing reflows. */}
          <div className="order-last col-span-3 h-2 w-full sm:order-none sm:col-span-1">
            <div
              aria-hidden
              data-shown={shown}
              className={cn(
                "heat-bar h-full rounded-full",
                RAMP[index] ?? RAMP[RAMP.length - 1],
              )}
              style={
                {
                  width: `${level.percent}%`,
                  transitionDelay: `${index * 70}ms`,
                } as React.CSSProperties
              }
            />
          </div>

          {/* Each price carries its own label at every width. A column heading
              would be cheaper, but the phone puts these two numbers beside a
              name rather than under a header, and two unlabelled peso amounts
              side by side is a puzzle. */}
          <p className="text-right">
            <span className="type-caps text-nybb-bone/50 block">Half</span>
            <span className="font-mono-tabular text-nybb-orange mt-1.5 block text-sm sm:text-base">
              +{level.half}
            </span>
          </p>

          <p className="text-right">
            <span className="type-caps text-nybb-bone/50 block">Full</span>
            <span className="font-mono-tabular text-nybb-orange mt-1.5 block text-sm sm:text-base">
              +{level.full}
            </span>
          </p>
        </li>
      ))}
    </ol>
  );
}
