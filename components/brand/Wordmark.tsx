import Image from "next/image";
import { catalogImage } from "@/lib/catalog";
import { cn } from "@/lib/utils";

/**
 * The Hot Wings wordmark, shipped exactly as the brand drew it.
 *
 * THE ONE THING TO KNOW BEFORE PUTTING THIS ANYWHERE.
 *
 * This mark is drawn for a LIGHT ground, and the reason is measurable. On the
 * 2704x1559 original, BUFFALO and BRAD'S are orange and yellow inside heavy
 * black outlines, so they hold up on any ground. The "NEW YORK" line above
 * them is different: rows 16 to 152, and 98% pure black with no keyline at
 * all. On a dark surface it is black on black and the brand's own city
 * disappears.
 *
 * That is why the header and the footer are bone rather than ink. The chrome
 * was changed to suit the mark, not the mark to suit the chrome. Do not put
 * this on a dark surface without giving it a light plate first.
 *
 * The one honest limitation, recorded so it is not rediscovered: the "NEW
 * YORK" line is 8.8% of the artwork's height, so at a navbar-sized logo it
 * lands around five or six pixels tall. A light ground makes it clearly
 * present and legible at a glance rather than invisible, but it can never be
 * large, because the brand drew it small. Making it bigger means altering the
 * logo, which is out of bounds.
 *
 * Sizing is fluid: the caller sets the width with a class and the image scales
 * inside it, so one component serves the navbar and the footer at their own
 * sizes and at every breakpoint.
 */
export function Wordmark({
  className,
  priority = false,
  sizes = "200px",
}: {
  /** Sets the mark's width, e.g. "w-[104px] sm:w-[132px]". */
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const image = catalogImage("wordmark");
  if (!image) return null;

  return (
    <Image
      src={image.src}
      alt="New York Buffalo Brad's Hot Wings"
      width={image.width}
      height={image.height}
      priority={priority}
      sizes={sizes}
      className={cn("h-auto w-full select-none", className)}
    />
  );
}
