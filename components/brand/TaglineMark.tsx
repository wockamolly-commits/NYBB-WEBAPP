import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The store's tagline as the store actually draws it.
 *
 * WHY THIS IS ARTWORK AND NOT TYPE.
 * ================================================================
 * The phrase is set in Daughter of Fortune elsewhere on the site, and that is
 * still correct where the tagline has to take the surface's colour: bone in the
 * landing hero, ink in the body of the About page. This is the other thing, the
 * lockup itself, signage yellow inside a black keyline, three lines climbing on
 * a diagonal. None of that is reproducible by setting a font: the diagonal, the
 * per-line optical sizing and the outline are drawn, not typeset.
 *
 * It sits in the footer for the same reason the wordmark does. That column is
 * the brand's signature on the page rather than a piece of copy, and the two
 * marks are built the same way, colour inside a heavy black outline, so they
 * read as one lockup rather than as a logo with a caption under it.
 *
 * WHY THE ARTWORK SURVIVES BOTH GROUNDS, AND WHAT CARRIES IT ON EACH.
 * ================================================================
 * The mark is three layers: a signage yellow fill, a black keyline around it,
 * and a black offset shadow behind that. Which layer is doing the work flips
 * with the surface, and the minimum size flips with it.
 *
 * On a light ground the yellow is worth about 1.1:1 and contributes nothing.
 * Everything legible is the keyline, exactly as it is for BUFFALO and BRAD'S in
 * the wordmark. Measured on the delivered file the median black run is 72px
 * against a 17,717px width, which lands at 1.06px rendered 260 wide and 0.89px
 * at 220; under about 200 it drops out at 1x and the mark degrades to yellow on
 * cream. That is the Hatching Stays Strokes failure in a different costume.
 *
 * On a dark ground the opposite: the keyline and the shadow disappear into the
 * surface and the yellow fill carries alone, at high contrast. The constraint
 * becomes the stroke rather than the outline, and the strokes are far heavier:
 * 1.22px at the tenth percentile rendered 220 wide, against the keyline's
 * 0.89px at the same size.
 *
 * `w-[220px] sm:w-[260px]` therefore clears both, which is why the hero and the
 * footer use the same pair. It is a floor, not a preference. Anything smaller
 * needs a variant drawn with a heavier keyline, not a transform.
 *
 * PROVENANCE. Derived from the delivered print master "#Your All Time Favorite
 * Chicken Wings with outline.png" (17717x14173, 300dpi, RGBA), one of the
 * designer files that stay out of this repository: alpha-trimmed to its ink at
 * threshold 8, which gives 17717x9110 at 1.945:1, then Lanczos down to 900 wide
 * and encoded WebP q92 with alphaQuality 100. The keyline is why the alpha is
 * lossless; a lossy alpha channel eats a one pixel outline first.
 */
export function TaglineMark({
  className,
  priority = false,
  sizes = "(min-width: 640px) 260px, 220px",
}: {
  /** Sets the mark's width. Do not go below 220px. See the note above. */
  className?: string;
  /** True for the landing hero, where this is the first thing above the fold. */
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <Image
      src="/brand/tagline-lockup.a416c541.webp"
      alt="#Your All Time Favorite Chicken Wings"
      width={900}
      height={463}
      priority={priority}
      sizes={sizes}
      className={cn("h-auto w-full select-none", className)}
    />
  );
}
