import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * A code's poster at list size, so a row can be recognised by its artwork the
 * way a customer recognises the promo.
 *
 * Contained, never cropped, for the reason voucher-poster.ts gives: the code
 * and dates are usually printed near an edge. Decorative to a screen reader,
 * because the code beside it is the row's name and a second "Poster for
 * LAUNCH50" adds nothing. A code made before posters were required (0089) has
 * none, and gets an empty frame so the column still lines up.
 */
export function PosterThumb({
  poster,
  className,
}: {
  poster: { url: string; width: number; height: number } | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-nybb-ink border-nybb-bone/15 flex shrink-0 items-center justify-center overflow-hidden rounded border",
        !poster && "border-dashed",
        className,
      )}
    >
      {poster ? (
        <Image
          src={poster.url}
          alt=""
          width={poster.width}
          height={poster.height}
          sizes="48px"
          className="max-h-full w-auto max-w-full object-contain"
        />
      ) : null}
    </div>
  );
}
