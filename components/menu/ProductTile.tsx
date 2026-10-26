import Image from "next/image";
import Link from "next/link";
import { itemPriceRange } from "@/lib/catalog/pricing";
import { canQuickAdd } from "@/lib/menu/quick-add";
import type { MenuItem } from "@/lib/menu/types";
import { formatPesoRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NoPhotoTile } from "./NoPhotoTile";
import { QuickAddButton } from "./QuickAddButton";

/**
 * A menu board tile.
 *
 * Every tile is a brand-orange square with a black name plate under it. That
 * is not a style choice so much as the shape the existing photography forces,
 * and the decision that lets a mixed library read as one grid:
 *
 *   - the burger, hotdog, ribs and pasta shots are cutouts already flattened
 *     onto a flat orange by whoever exported them, so they land natively;
 *   - the wing photographs are lifestyle shots on pale wood, square cropped,
 *     and read as full-bleed photography inside the same frame;
 *   - the three genuine alpha cutouts (the waffles) composite onto the orange
 *     and look deliberate rather than accidental.
 *
 * One correction to the spec while implementing this: those flattened cutouts
 * are NOT on #EF6212. Sampling their backgrounds gives seven different oranges
 * between #d16828 and #e67d39, all duller than the brand value. A tile that
 * painted #EF6212 behind them would show a visible seam, so the photograph is
 * bled to all four edges instead and the tile colour only shows where there is
 * no photograph at all.
 */
export function ProductTile({
  item,
  className,
  priority = false,
}: {
  item: MenuItem;
  className?: string;
  priority?: boolean;
}) {
  const image = item.image;
  const { fromCents, toCents } = itemPriceRange(item);
  // Decided here, not just inside QuickAddButton: whether the button renders
  // decides whether the price needs room for it, and a tile that reserved
  // that space for a button that never appeared would read as a misaligned
  // grid on the roughly two thirds of the menu that is not quick-addable.
  const quickAddable = canQuickAdd(item);

  return (
    // h-full and the column below are what make a row of tiles agree.
    //
    // A grid row is only as tidy as its tallest card, and these names run from
    // "BLT" to "Brad's Angus Burger Meal", which at 320px is the difference
    // between a one line plate and a four line one. Left alone, the plates
    // measured 44px to 95px in the same grid: the photographs stopped
    // bottom-aligning and the prices landed at four different heights. Making
    // the card a full height flex column lets the grid equalise them, and the
    // price is then pinned to the bottom so every price in a row sits on one
    // line, whatever the names above them did.
    <article className={cn("group relative h-full", className)}>
      {/* The whole tile is the target, not just the name. A 900px photograph
          that does nothing when tapped is the most common way a menu grid
          feels broken on a phone. */}
      <Link
        href={`/menu/${item.categorySlug}/${item.slug}`}
        className={cn(
          // No border. --border is ink at 16%, which against charcoal draws
          // nothing at all; value already separates the tile from both grounds.
          "bg-nybb-charcoal text-nybb-bone flex h-full flex-col overflow-hidden rounded-md",
          "focus-visible:outline-nybb-ink focus-visible:outline-2 focus-visible:outline-offset-2",
        )}
      >
        <div className="tile-orange relative aspect-square shrink-0 overflow-hidden">
          {image ? (
            <Image
              src={image.src}
              alt={item.name}
              fill
              sizes="(min-width: 1024px) 23vw, (min-width: 640px) 31vw, 45vw"
              placeholder="blur"
              blurDataURL={image.blurDataURL}
              priority={priority}
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
          ) : (
            <NoPhotoTile name={item.name} className="absolute inset-0" />
          )}
        </div>

        {/* The plate is two zones: the name block on top, and a footer row
            that holds the price and, when there is one, the Add button.

            The button used to float in the bottom corner while only the price
            made room for it, so a two line name like "Rainy Day Rush 2026
            (Bundle A)" ran straight underneath it. The name now owns the full
            width of the plate, and nothing shares a line with it.

            The padding is the same on all four sides, so the 44px button sits
            in the corner with an even margin rather than hanging lower than
            the text beside it. Its absolute offsets below repeat these values;
            change one and change the other. */}
        <div className="flex flex-1 flex-col p-3 sm:p-4">
          {/* The code gets its own line. Inline, it was competing with the
              name for a 111px column and producing "BB1 The / Rookie", which
              reads as a broken sentence rather than as a menu number. */}
          {item.code ? (
            <span className="font-mono-tabular text-nybb-bone/60 mb-1.5 block text-xs leading-none">
              {item.code}
            </span>
          ) : null}

          {/* The gap above the footer is a margin here, not padding on the
              footer. Padding would count inside the footer's 44px and centre
              the price 6px below the button it is meant to line up with. */}
          <h3 className="mb-3 text-sm leading-snug font-medium text-balance">{item.name}</h3>

          {/* mt-auto, so the footer sits on the floor of the card rather than
              wherever the name happened to stop. It is 44px tall on every
              tile, button or not: the price is centred in it, so in a row
              that mixes quick-add items with configured ones every price
              still lands on one line. The reserve on the right is only there
              when a button is actually taking that corner; see quickAddable
              above. The button is a 44px square below md and grows its word
              from md, so the reserve grows with it. */}
          <div
            className={cn(
              "mt-auto flex min-h-11 items-center",
              quickAddable && "pr-14 md:pr-28",
            )}
          >
            <p className="font-mono-tabular text-nybb-orange text-base leading-none font-medium">
              {formatPesoRange(fromCents, toCents)}
            </p>
          </div>
        </div>
      </Link>

      {quickAddable ? (
        // Sibling of the Link, never a child. A button inside an anchor is
        // invalid HTML and every browser guesses differently about which one
        // a tap meant. z-10 lives here, on the positioned wrapper, rather than
        // on a div nested inside QuickAddButton, so the stacking is owned by
        // the component that owns the positioning. The offsets match the
        // plate's padding, which is what puts the button exactly over the
        // footer row's right end, centred on the same line as the price.
        <div className="absolute right-3 bottom-3 z-10 sm:right-4 sm:bottom-4">
          <QuickAddButton item={item} />
        </div>
      ) : null}
    </article>
  );
}
