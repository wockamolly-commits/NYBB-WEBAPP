"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The Level of Hotness, drawn as one scale.
 *
 * The landing page used to render the HeatMeter component five times, once per
 * level. That is twenty five swatches saying a single thing, and it read as
 * five repeated cards rather than as a scale, which is what the product
 * actually is: one ramp you move along, priced at every stop.
 *
 * So this is a single object. Five bars ascending left to right in the brand's
 * own five fixed heat colours, each carrying its name, its percentage and the
 * two upcharges. Nothing has to explain that the right hand end is hotter.
 *
 * On a phone the whole thing rotates: five rows, each with its label and price
 * above a full width bar whose length ascends down the list. Same object, same
 * reading order, no horizontal scroll, and the bar keeps the full column width
 * so 20% and 100% are still obviously different lengths.
 *
 * The ramp is the five fixed tokens rather than a gradient function, for the
 * reason globals.css gives: a given level is the same swatch on a product
 * page, a receipt and a kitchen ticket.
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
    <ol
      ref={ref}
      className={cn("grid gap-y-7 sm:grid-cols-5 sm:gap-x-3 lg:gap-x-5", className)}
    >
      {levels.map((level, index) => (
        <li
          key={level.slug}
          className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-3 sm:flex sm:flex-col sm:items-stretch sm:gap-0"
        >
          {/* The track. A fixed box on both axes, so every bar is read
              against the same full length and the five stops stay directly
              comparable. */}
          <div className="order-3 col-span-2 flex h-2.5 w-full items-end self-center sm:order-1 sm:col-span-1 sm:h-40 lg:h-52">
            <div
              data-shown={shown}
              className={cn(
                "heat-bar h-full w-[var(--fill)] rounded-[2px] sm:h-[var(--fill)] sm:w-full",
                RAMP[index] ?? RAMP[RAMP.length - 1],
              )}
              style={
                {
                  "--fill": `${level.percent}%`,
                  transitionDelay: `${index * 70}ms`,
                } as React.CSSProperties
              }
            />
          </div>

          <div className="order-1 sm:order-2 sm:pt-5">
            <p className="font-display text-lg leading-none sm:text-xl">
              {level.name}
            </p>
            <p className="font-mono-tabular text-nybb-bone/50 mt-1.5 text-xs">
              {level.percent}%
            </p>
          </div>

          <dl className="order-2 flex gap-5 text-right sm:order-3 sm:mt-4 sm:block sm:space-y-1 sm:gap-0 sm:text-left">
            <div className="flex items-baseline gap-1.5 sm:justify-between sm:gap-2">
              <dt className="text-nybb-bone/50 text-xs">Half</dt>
              <dd className="font-mono-tabular text-nybb-orange text-sm">
                +{level.half}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5 sm:justify-between sm:gap-2">
              <dt className="text-nybb-bone/50 text-xs">Full</dt>
              <dd className="font-mono-tabular text-nybb-orange text-sm">
                +{level.full}
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}
