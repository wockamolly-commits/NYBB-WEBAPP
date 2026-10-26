import Image from "next/image";
import Link from "next/link";
import type { MenuImage } from "@/lib/menu/types";
import { cn } from "@/lib/utils";
import { NoPhotoTile } from "./NoPhotoTile";

/**
 * A photograph with a name plate under it, and nothing else.
 *
 * This is the wing flavour tile, lifted out of FlavourGrid so the landing
 * page's other food can wear it too. It is the browsing tile rather than the
 * buying one: no price, no Add button, no paragraph, because the reader it is
 * for has not decided what they want yet and the photograph is what decides
 * it. ProductTile is the buying tile and stays on /menu, where the numbers are
 * the information somebody came for.
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

export function ShowcaseTile({
  name,
  alt,
  code,
  description,
  image,
  href,
  imageSizes,
}: {
  name: string;
  alt: string;
  code?: string | null;
  /** Shown under the name when passed. The landing page passes none. */
  description?: string | null;
  image?: MenuImage | null;
  /** Omit it and the tile stays a display. */
  href?: string;
  /** Must match the column count of whatever grid the tile is placed in. */
  imageSizes: string;
}) {
  return (
    <Wrapper
      href={href}
      className="bg-nybb-charcoal text-nybb-bone flex h-full flex-col overflow-hidden rounded-md"
    >
      <div className="tile-orange relative aspect-square shrink-0 overflow-hidden">
        {image ? (
          <Image
            src={image.src}
            alt={alt}
            fill
            sizes={imageSizes}
            placeholder="blur"
            blurDataURL={image.blurDataURL}
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <NoPhotoTile name={name} className="absolute inset-0" />
        )}
      </div>
      <div className="flex flex-1 flex-col px-3 py-2.5 sm:px-4 sm:py-3.5">
        {/* The menu code, on its own line above the name and styled exactly
            as ProductTile styles an item's code, so a code reads the same
            wherever it appears. The printed menu burns it into the
            photograph's top-left corner instead; the ingest crops that off,
            because a code baked into pixels cannot be read out, reordered or
            corrected. */}
        {code ? (
          <span className="font-mono-tabular text-nybb-bone/60 mb-1 block text-xs leading-none">
            {code}
          </span>
        ) : null}

        <h3 className="font-display text-base leading-none sm:text-lg">{name}</h3>
        {description ? (
          <p className="text-nybb-bone/65 mt-2 text-xs leading-snug">{description}</p>
        ) : null}
      </div>
    </Wrapper>
  );
}
