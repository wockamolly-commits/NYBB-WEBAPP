import { cn } from "@/lib/utils";

/**
 * Spot drawings scattered through the footer's empty ground.
 *
 * The footer used to end in a large, plain field of cream: the link columns
 * are short, so on a wide screen a third of the footer was nothing. These fill
 * it with the restaurant's own subjects, a wing, a drumstick, a burger, a
 * chili and a flame, drawn in the same single pen line as the skyline below them so the
 * footer reads as one hand rather than a skyline with clip art beside it.
 *
 * WHY INK AT 11%. The same rule the wall mural behind the storefront follows
 * (The Drawing Darkens the Ground Rule): ink lines on this ground only ever
 * darken it, and at this alpha a stroke sitting directly behind a letter still
 * leaves the footer's ink/70 copy well above AA. They are placed in the gaps
 * anyway, never under a column, so in practice nothing sits behind type.
 *
 * WHY THE PLACEMENTS CHANGE BY BREAKPOINT RATHER THAN SCALE. The empty space
 * moves. On a phone it is the right half of each stacked section, beside the
 * left aligned lists. From `lg` the columns sit side by side and the gap is the
 * band above the skyline. From 1500px the page margins outside the
 * container open up and take the larger drawings. Each drawing is given one home per
 * layout instead of one position stretched across all of them.
 *
 * The wing is the whole flat in one outline: a chunky joint at one end
 * rising to a long pointed tip, with two short highlight strokes inside. A
 * first attempt drew it as a capsule with bone knobs at both ends, and at
 * this size and alpha that read as a sausage; the silhouette with the tip is
 * what makes it a wing. It is the footer's main subject, so it appears more
 * than any other drawing, two to four times depending on the width.
 *
 * Decoration only: hidden from assistive technology and never a target.
 */

const PATHS = {
  drumstick: [
    "M18 28C14 21 16 11 24 7C32 3 42 8 43 17C44 26 37 32 28 32C25 32 23 32 21 31",
    "M18 28L11.5 34.5M21 31L14.5 37.5",
    "M11.5 34.5A3 3 0 1 0 8.6 39.6A3 3 0 1 0 14.5 37.5",
    "M29 12C33 12.5 36.5 15 37.5 19",
  ],
  burger: [
    "M8 22C8 14 15 8.5 24 8.5S40 14 40 22Z",
    "M17 14.5L18.5 15.5M24 12.5V14M30.5 14.5L29 15.5M21 18L22.5 18.5M27 18L25.5 18.5",
    "M7 26.5C9.5 24.5 11.5 28.5 14 26.5S18.5 28.5 21 26.5 25.5 28.5 28 26.5 32.5 28.5 35 26.5 39 28.5 41 26.5",
    "M10 30.5H38A2 2 0 0 1 38 34.5H10A2 2 0 0 1 10 30.5Z",
    "M9 37.5H39C39 40.5 37 42.5 34 42.5H14C11 42.5 9 40.5 9 37.5Z",
  ],
  wing: [
    "M4.5 29C5.5 25.5 7.5 23 10 21L12 18.5C13 19.5 14.2 20.2 15.5 20C19.5 16.5 23.5 12.5 27.5 10.5C30 9.3 32 10 33.5 12C35.5 14.5 38 16.5 41 18C43.5 19.2 46 20.6 45.6 22.2C41.5 22.4 36.5 21.6 33 20.8C30.6 20.3 28.8 20.8 28 23C26.8 26.7 25.4 31 22.8 33.6C20.6 35.8 17 36.6 14 35.8C11.6 35.2 10.4 33.5 9.4 32C8 30.4 6.2 29.6 4.5 29Z",
    "M31.5 18.2C34.5 18.8 37.5 19.6 40.5 20.6",
    "M25.6 24.8C24.6 28.5 23 31.2 20.2 32.8",
  ],
  chili: [
    "M33 11C37 15 36 21 32 27C27 35 18 40 7 41.5C13 37.5 18 31.5 21 24.5C23.5 18 26.5 12.5 33 11Z",
    "M33 11C33.5 7.5 35.5 5.5 39 5",
    "M27.5 13C30 10.5 34 10 37 12.5",
    "M27 19C25.5 24 23 28 20 31",
  ],
  flame: [
    "M24 4.5C26 12.5 36 17 36 29A12 12 0 0 1 12 29C12 23 15 19 19 16C19 21 21 24 23 25C21 17 22 11 24 4.5Z",
    "M24 41.5A5.5 5.5 0 0 1 18.5 36C18.5 31.5 22 29.5 24 26.5C26 29.5 29.5 31.5 29.5 36A5.5 5.5 0 0 1 24 41.5Z",
  ],
} as const;

type Doodle = keyof typeof PATHS;

/**
 * Every placement. `className` carries position, size and the breakpoints it
 * shows at; `rotate` is a static property beside it, so nothing here animates.
 * `flip` mirrors a drawing, which is how each subject appears several times
 * without reading as one stamp repeated.
 */
const PLACEMENTS: { doodle: Doodle; className: string; rotate: number; flip?: boolean }[] = [
  // Phone and tablet, where the sections stack: beside the left aligned lists.
  { doodle: "chili", rotate: 18, className: "right-4 top-16 size-14 lg:hidden" },
  { doodle: "drumstick", rotate: -14, className: "right-6 top-[46%] size-16 sm:top-auto sm:right-[16%] sm:bottom-[calc(6.5vw+2rem)] lg:hidden" },
  { doodle: "wing", rotate: -4, className: "right-8 bottom-[calc(10vw+2.5rem)] size-14 sm:right-auto sm:left-[44%] sm:bottom-[calc(6.5vw+3.5rem)] lg:hidden" },

  { doodle: "wing", rotate: 10, flip: true, className: "right-[32%] bottom-[calc(10vw+7.5rem)] size-12 sm:hidden" },
  { doodle: "wing", rotate: -6, flip: true, className: "hidden sm:block lg:hidden left-[56%] top-28 size-14" },
  { doodle: "burger", rotate: 6, className: "right-5 top-[36%] size-11 sm:hidden" },
  { doodle: "flame", rotate: -8, className: "right-6 top-[60%] size-9 sm:hidden" },
  { doodle: "burger", rotate: -4, className: "hidden sm:block lg:hidden right-[6%] top-[27rem] size-11" },
  { doodle: "flame", rotate: 10, className: "hidden sm:block lg:hidden left-[44%] top-[13rem] size-9" },

  // Side by side columns (`lg`): the band between the links and the skyline.
  { doodle: "burger", rotate: -5, className: "hidden lg:block left-[30%] bottom-[calc(6.5vw+1.75rem)] size-14" },
  { doodle: "wing", rotate: 4, className: "hidden lg:block left-[56%] bottom-[calc(6.5vw+2.75rem)] size-16" },
  { doodle: "chili", rotate: -20, className: "hidden lg:block right-6 bottom-[calc(6.5vw+1.25rem)] size-12 min-[1500px]:right-[6%]" },

  { doodle: "wing", rotate: -12, flip: true, className: "hidden lg:block right-[max(3rem,calc(50%-33rem))] top-52 size-14" },
  { doodle: "drumstick", rotate: 20, flip: true, className: "hidden lg:block left-[max(1.5rem,calc(50%-34.5rem))] top-[21rem] size-12" },
  { doodle: "flame", rotate: 6, className: "hidden xl:block left-[calc(50%+9rem)] top-[17rem] size-9" },

  // Wide screens: the page margins outside the container. Not before 1500px,
  // where the margin first has room for a drawing without clipping it.
  { doodle: "drumstick", rotate: 16, className: "hidden min-[1500px]:block left-[calc(50%-36rem-8.5rem)] top-14 size-[4.5rem]" },
  { doodle: "flame", rotate: -10, className: "hidden min-[1500px]:block left-[calc(50%-36rem-5rem)] top-56 size-11" },
  { doodle: "wing", rotate: 8, className: "hidden min-[1500px]:block left-[calc(50%-36rem-10.5rem)] top-[21rem] size-16" },
  { doodle: "burger", rotate: -6, className: "hidden min-[1500px]:block left-[calc(50%-36rem-15rem)] top-[8.5rem] size-12" },
  { doodle: "chili", rotate: -30, flip: true, className: "hidden min-[1500px]:block left-[calc(50%-36rem-12rem)] top-[15rem] size-11" },
  { doodle: "burger", rotate: 6, className: "hidden min-[1500px]:block right-[calc(50%-36rem-9rem)] top-20 size-16" },
  { doodle: "chili", rotate: 26, className: "hidden min-[1500px]:block right-[calc(50%-36rem-4.5rem)] top-60 size-12" },
  { doodle: "wing", rotate: -8, flip: true, className: "hidden min-[1500px]:block right-[calc(50%-36rem-10rem)] top-[22rem] size-14" },
  { doodle: "drumstick", rotate: -18, flip: true, className: "hidden min-[1500px]:block right-[calc(50%-36rem-14rem)] top-36 size-14" },
  { doodle: "flame", rotate: 12, className: "hidden min-[1500px]:block right-[calc(50%-36rem-15rem)] top-[17rem] size-10" },
];

export function FooterDoodles({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("text-nybb-ink pointer-events-none absolute inset-0 -z-10 opacity-[0.11]", className)}
    >
      {PLACEMENTS.map(({ doodle, className: placement, rotate, flip }, index) => (
        <svg
          key={index}
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
          className={cn("absolute", placement)}
          style={{ rotate: `${rotate}deg`, scale: flip ? "-1 1" : undefined }}
        >
          {PATHS[doodle].map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      ))}
    </div>
  );
}
