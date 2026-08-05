import { cn } from "@/lib/utils";

/**
 * The five heat stops as hard bands, not a blend.
 *
 * globals.css is explicit that the ramp is five fixed swatches rather than a
 * gradient function, so a given heat level is the same colour on a product
 * page, a receipt and a kitchen ticket. Hard stops keep faith with that: this
 * is the scale quoted, not a decoration derived from it.
 *
 * It now runs along the bottom edge of the navbar and the top edge of the
 * footer, so the page is bracketed by the brand's own scale. That does two
 * jobs at once. It ties the two pieces of chrome together as one system, and
 * it gives the navbar a deliberate brand edge where it meets the hero video
 * instead of a bare hairline between parchment and a dark photograph.
 *
 * Thinner in the navbar than in the footer: at the top of the page it is a
 * signature, at the bottom it is a rule closing the document.
 */
export function HeatRule({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "w-full bg-[linear-gradient(90deg,var(--color-nybb-heat-1)_0_20%,var(--color-nybb-heat-2)_20%_40%,var(--color-nybb-heat-3)_40%_60%,var(--color-nybb-heat-4)_60%_80%,var(--color-nybb-heat-5)_80%_100%)]",
        className ?? "h-1",
      )}
    />
  );
}
