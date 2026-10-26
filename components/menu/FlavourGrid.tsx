import type { MenuOption } from "@/lib/menu/types";
import { cn } from "@/lib/utils";
import { ShowcaseTile } from "./ShowcaseTile";

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
   *
   * The column counts are two and five because there are ten flavours, and
   * those are the numbers that divide ten. A three column step at `sm` was
   * here while there were nine, and it now leaves one tile alone on a fourth
   * row. Any caller overriding this has the same arithmetic to do.
   */
  imageSizes?: string;
}) {
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5",
        className,
      )}
    >
      {flavours.map((flavour) => (
        <li key={flavour.slug} className="group h-full">
          <ShowcaseTile
            name={flavour.name}
            alt={`${flavour.name} wings`}
            code={flavour.code}
            description={withDescriptions ? flavour.description : null}
            image={flavour.image}
            href={hrefFor?.(flavour)}
            imageSizes={imageSizes}
          />
        </li>
      ))}
    </ul>
  );
}
