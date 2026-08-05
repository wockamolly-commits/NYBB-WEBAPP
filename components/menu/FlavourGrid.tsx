import Image from "next/image";
import { catalogImage } from "@/lib/catalog";
import { wingFlavours } from "@/lib/catalog/menu";
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
 */
export function FlavourGrid({ className }: { className?: string }) {
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5",
        className,
      )}
    >
      {wingFlavours.options.map((flavour) => {
        const image = catalogImage(flavour.imageKey);

        return (
          <li
            key={flavour.slug}
            className="border-border bg-nybb-charcoal group overflow-hidden rounded-md border"
          >
            <div className="tile-orange relative aspect-square overflow-hidden">
              {image ? (
                <Image
                  src={image.src}
                  alt={`${flavour.name} wings`}
                  fill
                  sizes="(min-width: 1024px) 19vw, (min-width: 640px) 31vw, 45vw"
                  placeholder="blur"
                  blurDataURL={image.blurDataURL}
                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                />
              ) : (
                <NoPhotoTile name={flavour.name} className="absolute inset-0" />
              )}
            </div>
            <div className="px-3 py-2.5">
              <h3 className="font-display text-base leading-none">{flavour.name}</h3>
              {flavour.description ? (
                <p className="text-nybb-bone/60 mt-1.5 text-xs leading-snug">
                  {flavour.description}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
