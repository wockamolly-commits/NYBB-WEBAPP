import Image from "next/image";
import Link from "next/link";
import type { MenuOption } from "@/lib/menu/types";
import { cn } from "@/lib/utils";
import { NoPhotoTile } from "./NoPhotoTile";

/**
 * The wing flavour grid.
 *
 * The flavour photography is the best material the brand has: one consistent
 * shoot, branded basket and liner, every flavour distinguishable because the
 * sauce carries the difference. So the flavours get their own grid rather than
 * hiding inside a product page as a dropdown, which is what the current website
 * does with them.
 *
 * Three flavours (Cheezy, Salted Egg, Smokey Barbecue) survive only as 300x300
 * thumbnails, so they ship smaller than the rest and are on the re-shoot ask.
 *
 * `withDescriptions` splits the two jobs this grid does. On /menu the reader is
 * choosing, so the one line under each name is the information they came for.
 * On the landing page it is nine small paragraphs stacked under nine
 * photographs, which is noise in front of someone who has not decided they want
 * wings yet. There the name carries it and the description waits for /menu.
 */
/**
 * One body, linked or not. Duplicating the tile markup for the two cases is
 * how the linked version and the display version drift apart.
 */
function Wrapper({
  href,
  className,
  children,
}: {
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return href ? (
    <Link
      href={href}
      className={cn(
        className,
        "focus-visible:outline-nybb-ink focus-visible:outline-2 focus-visible:outline-offset-2",
      )}
    >
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

export function FlavourGrid({
  flavours,
  hrefFor,
  className,
  withDescriptions = true,
  imageSizes = "(min-width: 1024px) 19vw, (min-width: 640px) 31vw, 45vw",
}: {
  /**
   * The wing flavour option group, passed in rather than imported. The grid
   * used to reach into the static catalog itself, which quietly made it the
   * one component on the page that could not follow the menu to the database.
   */
  flavours: MenuOption[];
  /**
   * Where a flavour goes when tapped. Supplied by the caller because only the
   * page knows which item these options belong to. Omit it and the grid stays
   * a display, which is what the landing page wants above the fold.
   */
  hrefFor?: (flavour: MenuOption) => string;
  className?: string;
  withDescriptions?: boolean;
  /**
   * Must be kept honest against whatever column count `className` sets. The
   * default describes the five column default below; a caller that overrides
   * the grid has to override this too, or the browser fetches a candidate
   * sized for a tile a third of the width it is actually painting.
   */
  imageSizes?: string;
}) {
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5",
        className,
      )}
    >
      {flavours.map((flavour) => {
        const image = flavour.image;

        return (
          <li key={flavour.slug} className="group">
            <Wrapper
              href={hrefFor?.(flavour)}
              className="bg-nybb-charcoal text-nybb-bone block overflow-hidden rounded-md"
            >
              <div className="tile-orange relative aspect-square overflow-hidden">
                {image ? (
                  <Image
                    src={image.src}
                    alt={`${flavour.name} wings`}
                    fill
                    sizes={imageSizes}
                    placeholder="blur"
                    blurDataURL={image.blurDataURL}
                    className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                  />
                ) : (
                  <NoPhotoTile name={flavour.name} className="absolute inset-0" />
                )}
              </div>
              <div className="px-3.5 py-3 sm:px-4 sm:py-3.5">
                <h3 className="font-display text-base leading-none sm:text-lg">
                  {flavour.name}
                </h3>
                {withDescriptions && flavour.description ? (
                  <p className="text-nybb-bone/65 mt-2 text-xs leading-snug">
                    {flavour.description}
                  </p>
                ) : null}
              </div>
            </Wrapper>
          </li>
        );
      })}
    </ul>
  );
}
