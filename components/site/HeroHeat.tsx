import { cn } from "@/lib/utils";
import type { HeatLevel } from "@/components/site/HeatScale";

/**
 * The Level of Hotness, in the first viewport.
 *
 * WHY THE HERO NEEDED THIS AND NOTHING ELSE.
 * ================================================================
 * The hero was the one section on this page that opted out of the page's own
 * strongest move. Every band below it shows its evidence: nine photographed
 * baskets, five priced heat stops, nine dialable counters. The hero showed a
 * food loop that could belong to any restaurant, and its subhead named two
 * quantities, "nine flavours, five levels of heat", without showing either. A
 * number you are asked to hold is not evidence, it is a claim.
 *
 * So this is the same object the heat band renders further down, brought up to
 * the first screen and compressed to a strip. Not a new device: the same five
 * fixed tokens, the same ascending read, the same mono percentages. The page
 * already said heat is the one thing a visitor should be able to describe an
 * hour later, and now the first thing they see says it too.
 *
 * WHAT IT DOES NOT DO.
 * ================================================================
 * It does not animate. The drawing of the five stops belongs to the heat band
 * and is the page's one authored moment; replaying it here would spend that
 * moment twice and make the hero the second-best version of it. It carries no
 * prices either, because the hero is not where somebody is choosing a level,
 * and the band below owns that job in full.
 *
 * THE TYPE FLOOR DECIDES THE SMALL BREAKPOINT.
 * ================================================================
 * Below `sm` there are about 52px per column, and "MODERATE" set in the display
 * face needs more than that at any size the system permits. The floor is 12px
 * and it does not bend, so the phone shows the ramp with its two ends named and
 * the middle stops carried by colour and height alone, which is what a scale is
 * for. Every name stays in the DOM for a screen reader at every width.
 */

/** Static class names, so Tailwind's scanner can see all five. */
const RAMP = [
  "bg-nybb-heat-1",
  "bg-nybb-heat-2",
  "bg-nybb-heat-3",
  "bg-nybb-heat-4",
  "bg-nybb-heat-5",
] as const;

export function HeroHeat({
  levels,
  className,
}: {
  levels: HeatLevel[];
  className?: string;
}) {
  if (levels.length === 0) return null;

  const first = levels[0];
  const last = levels[levels.length - 1];

  return (
    <div className={className}>
      {/* bone/70 and bone/60, not the /55 the dark cards use.
          ================================================================
          Those cards sit on solid charcoal. This sits on video under a scrim,
          and at this height the two scrim layers composite to about 80% ink, so
          a bright frame leaves a ground near rgb(60,60,60) rather than near
          black. Against that, bone/55 measures 4.22:1 and misses the 4.5 floor
          these 12px labels need; /70 measures 5.88:1 and /60 measures 4.82:1.
          The alpha is chosen against the worst frame the loop can show, not
          against the token's usual neighbour. */}
      <p className="type-caps text-nybb-bone/70">Level of Hotness</p>

      <ol className="mt-4 flex items-end gap-1.5 sm:gap-2">
        {levels.map((level, index) => (
          <li key={level.slug} className="min-w-0 flex-1">
            {/* A fixed track, so the five bars are read against one length and
                the ascent is the information rather than a coincidence of
                content height. */}
            {/* Taller at lg, where this sits in its own column and has the
                room. At h-12 against a 74px column the bars came out wider than
                they were tall, which reads as five colour blocks rather than as
                a ramp: the ascent is the whole point and it needs the vertical
                axis to be the long one. */}
            <div className="flex h-9 items-end sm:h-12 lg:h-24">
              <div
                aria-hidden
                className={cn(
                  "w-full rounded-[2px]",
                  RAMP[index] ?? RAMP[RAMP.length - 1],
                )}
                style={{ height: `${level.percent}%` }}
              />
            </div>

            {/* sr-only below sm rather than hidden: the middle three names are
                visually carried by the ramp at that width, but a screen reader
                should still get all five in order. */}
            {/* mt-4, not mt-3. The display face is set leading-none here, so
                its cap height starts at the very top of the line box and a
                nominal 12px gap renders closer to 4. */}
            <p className="font-display mt-4 text-xs leading-none sr-only sm:not-sr-only">
              {level.name}
            </p>
            <p className="font-mono-tabular text-nybb-bone/60 mt-1.5 text-xs leading-none sr-only sm:not-sr-only">
              {level.percent}%
            </p>
          </li>
        ))}
      </ol>

      {/* The phone's two ends. aria-hidden because the list above already
          carries every name and percentage for assistive tech. */}
      <p
        aria-hidden
        className="font-display text-nybb-bone/70 mt-3 flex items-baseline justify-between text-xs leading-none sm:hidden"
      >
        <span>
          {first.name} {first.percent}%
        </span>
        <span>
          {last.name} {last.percent}%
        </span>
      </p>
    </div>
  );
}
