import { cn } from "@/lib/utils";

/**
 * The tile for an item with no usable photograph.
 *
 * Roughly a dozen items on the seeded menu have none: the iced coffee line and
 * the waffle posters have the headline burned into the pixels, which makes them
 * advertisements rather than product shots, and a handful of sides were never
 * photographed at all.
 *
 * The rule is that this must look designed, not broken. It carries the brand
 * ground, the item name in the display face, and a diagonal signage ruling, so
 * a grid with a few of these reads as rhythm rather than as absence. A grey box
 * or a broken-image glyph would read as a bug on a CEO demo.
 */
export function NoPhotoTile({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "tile-orange relative flex aspect-square items-center justify-center overflow-hidden",
        className,
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, #0b0b0c 0 2px, transparent 2px 14px)",
        }}
      />
      <span className="font-display relative px-5 text-center text-lg leading-[0.95] text-nybb-ink sm:text-xl">
        {name}
      </span>
    </div>
  );
}
