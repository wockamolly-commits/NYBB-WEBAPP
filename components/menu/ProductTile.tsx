import Image from "next/image";
import Link from "next/link";
import { itemPriceRange } from "@/lib/catalog/pricing";
import type { MenuItem } from "@/lib/menu/types";
import { formatPesoRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NoPhotoTile } from "./NoPhotoTile";

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

  return (
    <article className={cn("group", className)}>
      {/* The whole tile is the target, not just the name. A 900px photograph
          that does nothing when tapped is the most common way a menu grid
          feels broken on a phone. */}
      <Link
        href={`/menu/${item.categorySlug}/${item.slug}`}
        className={cn(
          // No border. --border is ink at 16%, which against charcoal draws
          // nothing at all; value already separates the tile from both grounds.
          "bg-nybb-charcoal text-nybb-bone block overflow-hidden rounded-md",
          "focus-visible:outline-nybb-ink focus-visible:outline-2 focus-visible:outline-offset-2",
        )}
      >
        <div className="tile-orange relative aspect-square overflow-hidden">
          {image ? (
            <Image
              src={image.src}
              alt={item.name}
              fill
              sizes="(min-width: 1024px) 23vw, (min-width: 640px) 31vw, 45vw"
              placeholder="blur"
              blurDataURL={image.blurDataURL}
              priority={priority}
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <NoPhotoTile name={item.name} className="absolute inset-0" />
          )}
        </div>

        <div className="flex items-baseline justify-between gap-3 px-3.5 py-3 sm:px-4 sm:py-3.5">
          <h3 className="text-sm leading-tight font-medium">
            {item.code ? (
              <span className="font-mono-tabular text-nybb-bone/60 mr-1.5 text-[11px]">
                {item.code}
              </span>
            ) : null}
            {item.name}
          </h3>
          <p className="font-mono-tabular text-nybb-orange shrink-0 text-sm tabular-nums">
            {formatPesoRange(fromCents, toCents)}
          </p>
        </div>
      </Link>
    </article>
  );
}
