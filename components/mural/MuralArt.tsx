import { MURAL_MOTIFS, type MuralMotifName } from "@/lib/mural/assets";
import { cn } from "@/lib/utils";

/**
 * A traced motif from the store's wall artwork, inked in the surface's colour.
 *
 * WHY THIS IS A MASK AND NOT AN <img>.
 * ================================================================
 * The whole point of the ink layer is that one file serves char on the amber
 * ground, bone on a charcoal card, and orange where a graphic accent is wanted.
 * That needs `currentColor`, and `currentColor` inside an SVG loaded through
 * `<img src>` resolves against nothing: the browser treats that document as
 * isolated and it cannot see the page's colours at all. Inlining the markup
 * would work, but the storefront scene is 76kB and the tile motifs repeat a
 * dozen times in one menu grid, so inlining pays that cost per occurrence and
 * per request, and this site renders every page dynamically.
 *
 * A CSS mask gets both. The file stays a cacheable request, and what shows
 * through it is `background-color: currentColor`, which is a real inherited
 * colour on the element. No baked black anywhere, and no white rectangle: the
 * traced SVG has no background at all, so the ground shows wherever there is
 * no ink.
 *
 * Checked against lib/content-security-policy.ts before it was built. The mask
 * URL is same-origin and covered by `img-src 'self'`, and the inline style is
 * covered by `style-src 'unsafe-inline'`, which React needs anyway.
 *
 * ACCESSIBILITY. Decoration is hidden and meaningful artwork is named, and the
 * caller decides which by whether it passes a label. An illustration beside an
 * empty-state message is decoration, because the message is the content; the
 * marquee on the 404 is named, because it is the only thing on that screen
 * saying which shop this is.
 */
export function MuralArt({
  motif,
  label,
  className,
  fit = "contain",
  position = "center",
  fade,
  style,
}: {
  motif: MuralMotifName;
  /** Naming it makes it content. Omit for decoration, which is the common case. */
  label?: string;
  className?: string;
  /**
   * `contain` fits the whole drawing in the box. `cover` fills the box and lets
   * whatever clips the box do the cropping, which is what a bleed needs.
   */
  fit?: "contain" | "cover";
  /** Any `mask-position` value, e.g. "left center", "center top". */
  position?: string;
  /**
   * A CSS gradient composited into the mask, so the drawing dissolves instead
   * of ending.
   *
   * This exists because bleeding a drawing off three sides of the viewport does
   * nothing about the fourth. The traced artwork is a crop of a wall, so its
   * own boundary is a straight line, and wherever that line falls inside the
   * page it reads as a picture that has been cut out and laid down. A gradient
   * intersected into the mask takes the ink to nothing over a distance, which
   * is what makes the drawing read as printed into the ground and running out
   * of it.
   *
   * The strokes stay strokes the whole way: this lowers their alpha, it does
   * not merge them into a tone, and ink fading over the amber ground blends
   * towards amber rather than towards a neutral.
   *
   * THE COLOUR IN THIS GRADIENT IS NOT A COLOUR. A mask reads alpha and throws
   * the channels away, so the opaque stop is only saying "keep the ink here"
   * and never paints anything. `#000` is the conventional way to write that and
   * carries no relationship to the palette; picking a brand value instead would
   * imply a decision that does not exist. What actually paints is
   * `background-color: currentColor` underneath, which is the whole point of
   * this component.
   *
   * e.g. "linear-gradient(to right, transparent 24%, #000 58%)"
   */
  fade?: string;
  style?: React.CSSProperties;
}) {
  const { src, width, height } = MURAL_MOTIFS[motif];
  const url = `url(${src})`;

  // Two mask layers intersected, or one when there is no fade. Every mask
  // longhand has to carry a value per layer or the shorthand list falls out of
  // step with the image list.
  const maskImage = fade ? `${url}, ${fade}` : url;
  const maskSize = fade ? `${fit}, 100% 100%` : fit;
  const maskPosition = fade ? `${position}, center` : position;
  const maskRepeat = fade ? "no-repeat, no-repeat" : "no-repeat";

  return (
    <span
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={cn("block bg-current", className)}
      style={{
        // Reserving the ratio rather than a height keeps the drawing from
        // reflowing the page when the mask arrives. A caller that sets both
        // width and height overrides it, which is what a bleed does.
        aspectRatio: `${width} / ${height}`,
        maskImage,
        WebkitMaskImage: maskImage,
        maskRepeat,
        WebkitMaskRepeat: maskRepeat,
        // `intersect` keeps only what both layers cover, so the gradient thins
        // the drawing rather than adding to it. Safari before 15.4 spells the
        // same operation "source-in" on the prefixed property.
        ...(fade
          ? { maskComposite: "intersect", WebkitMaskComposite: "source-in" }
          : null),
        // FIT AND POSITION ARE PROPS, NOT STYLE, AND THAT IS LOAD BEARING.
        // These were plain defaults in the style object once, with the webkit
        // aliases written beside them, and a caller passing `maskSize: "cover"`
        // through `style` silently got `contain`: object spread replaces the
        // value at the original key's position, so `WebkitMaskSize: "contain"`
        // still serialised after it, and the browser treats the two as one
        // property where the last declaration wins. The drawing quietly stayed
        // letterboxed and the only symptom was a layout that looked slightly
        // wrong. Routing both aliases through one prop makes them impossible to
        // desynchronise.
        maskSize,
        WebkitMaskSize: maskSize,
        maskPosition,
        WebkitMaskPosition: maskPosition,
        ...style,
      }}
    />
  );
}
