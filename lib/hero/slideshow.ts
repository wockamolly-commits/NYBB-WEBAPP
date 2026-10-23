import {
  HERO_IMAGES,
  type HeroImage,
  type HeroImageName,
} from "@/lib/hero/images";

/**
 * What the landing hero cycles through, and on what clock.
 *
 * `components/site/HeroSlideshow.tsx` draws; this decides. Kept in `lib/` for
 * the reason AGENTS.md rule 6 gives: a component cannot be unit tested here, so
 * anything living inside one is untested by construction.
 */

/** The store's own food film, which is the hero's first slide. */
export type HeroFilmSlide = {
  readonly kind: "film";
  readonly name: "film";
  /**
   * The still the server renders and the film paints over.
   *
   * It is the real fallback rather than a placeholder: on a metered link, and
   * for anyone who has asked for reduced motion, this is the slide.
   */
  readonly poster: string;
  readonly sources: readonly { readonly src: string; readonly type: string }[];
  readonly objectPosition: string;
};

/** One of the delivered wall murals. */
export type HeroStillSlide = HeroImage & {
  readonly kind: "still";
  readonly name: HeroImageName;
  /**
   * Where the picture rests on a narrow screen when it is not panning.
   *
   * A fraction of the part that does not fit: 0 is the mural's left edge
   * against the left edge of the hero, 1 is its right edge against the right.
   * It is the same quantity the horizontal half of `object-position` carries,
   * written as a number because `.hero-pan-track` multiplies by it.
   *
   * This is what somebody who has asked for reduced motion sees, and it is the
   * framing the phone had before the pan: a quarter in, which holds the food
   * and leaves the wall behind it off screen.
   */
  readonly panRest: number;
  /**
   * Where to hold it from `xl` up, where the whole width of the mural is on
   * screen and the trim comes off the height instead. Only the vertical does
   * anything here, and what it decides is that the trim is taken from the
   * floor under the food rather than from the display type over it.
   */
  readonly objectPositionWide: string;
};

export type HeroSlide = HeroFilmSlide | HeroStillSlide;

/**
 * The order they play in.
 *
 * The film first, because it is the thing this hero already was and because a
 * moving picture is the strongest opening the store owns. The two murals
 * follow it in the order they were delivered.
 *
 * THE MURALS ARE 16:9, AND THE HERO IS NOT.
 * ================================================================
 * The murals ship in their 16:9 re-layout (see scripts/build-hero-slides.ts),
 * which holds the whole composition: the food and the panel of display type.
 * The wordmark that used to sit in the corner of both is gone at source, which
 * is why nothing here crops. The section is wider than 16:9, about 2.05:1 on a
 * laptop and 2.28:1 on a large one, so the browser fits each picture to the
 * width and takes 13 to 22 percent off its height. That is what
 * `objectPositionWide` is for: held above centre, what the browser takes is the
 * floor under the food rather than the display panel over it.
 *
 * A phone cannot have any of that. The hero there is about 390 by 658, so a
 * mural scaled to its height is 1170 wide and a third of it fits. There is no
 * framing that holds both the food and the display panel: a slice taken from
 * the middle is a column of half-letters, which reads as a mistake rather than
 * as a crop.
 *
 * So the phone stops choosing. It pans, slowly, from the mural's left edge to
 * its right over the whole time the slide is on screen, which is about 780px of
 * travel in twelve seconds, or 64 a second. Every part of the artwork is shown
 * and none of it is permanently cropped, and the move is slow enough to read as
 * a camera rather than as an animation. The mechanism is `.hero-pan-track` in
 * app/globals.css; what lives here is how long a panning slide is given, which
 * is longer than a still one because it now has something to finish.
 *
 * `panRest` is what is left of the old fixed framing. It is where the picture
 * stands when nobody is panning it, which means reduced motion and a browser
 * without container query units, and it is the quarter-in crop the phone had
 * before.
 */
export const HERO_SLIDES: readonly HeroSlide[] = [
  {
    kind: "film",
    name: "film",
    // Cut, cropped and re-encoded by scripts/build-hero-video.sh: seven
    // seconds of 720p30 with no audio, in two containers because VP9 and
    // H.264 between them cover everything that will play a background video.
    poster: "/video/hero-poster.webp",
    sources: [
      { src: "/video/hero.webm", type: "video/webm" },
      { src: "/video/hero.mp4", type: "video/mp4" },
    ],
    // 16:9, so this one is cropped at both ends of the range rather than
    // neither. Centre is right for it: the shot is framed on the food already.
    objectPosition: "50% 50%",
  },
  {
    kind: "still",
    name: "eating",
    ...HERO_IMAGES.eating,
    // She and the baskets sit in the left half of this mural, so a phone that
    // is not panning holds the picture a quarter in and gets the person, the
    // wings and the lightning rather than the wall between them and the type.
    panRest: 0.25,
    // Above centre, which on a wide laptop is what keeps the display panel
    // whole and spends the trim on the floor under the food.
    objectPositionWide: "50% 42%",
  },
  {
    kind: "still",
    name: "spread",
    ...HERO_IMAGES.spread,
    // The basket, the carbonara and the fries run from about a tenth to half
    // of this mural's width. A quarter holds all three on a phone.
    panRest: 0.25,
    objectPositionWide: "50% 42%",
  },
];

/**
 * How long a still holds, in milliseconds.
 *
 * Six seconds, which is a deliberate number rather than a round one. Under it
 * the hero starts behaving like an animation that happens to contain food;
 * over about eight a visitor who arrives, reads the headline and presses a
 * button never learns the other pictures were there.
 *
 * The film does not use it. It holds until it has finished playing, which is
 * the one thing a seven second clip is owed by a slideshow: cutting away from
 * a shot of food mid-pour is worse than showing no film at all.
 */
export const SLIDE_DWELL_MS = 6000;

/**
 * How long the film is given before the slideshow moves on regardless.
 *
 * The film advances the hero by ending, and `ended` is an event that can fail
 * to arrive: a browser that refuses to autoplay, a source that will not
 * decode, a tab that was throttled while it buffered. Without this the hero
 * would sit on the first slide forever and the murals would never be seen.
 *
 * Twelve seconds against a seven second clip, so a slow start is waited out
 * rather than cut off. It is a backstop, not a duration: when the film plays
 * normally this timer is cleared several seconds early.
 */
export const FILM_FALLBACK_MS = 12000;

/**
 * How long the cross fade runs, in milliseconds.
 *
 * Long enough that it reads as a dissolve rather than a cut, which is the
 * whole request. It is opacity only: nothing here scales, pans or slides,
 * because a background that moves under stationary type is the reason hero
 * carousels have the reputation they have.
 */
export const CROSSFADE_MS = 1200;

/**
 * How long a still holds while it is panning, in milliseconds.
 *
 * A panning still is no longer a still: it has a beginning and an end, the same
 * way the film does, and cutting away from it halfway is the same edit
 * `FILM_FALLBACK_MS` exists to avoid. Eleven seconds is what the traverse needs
 * to run at a speed that reads as a camera move rather than as a slide
 * transition, measured on the phone that has the least room: about 520px of
 * travel at roughly 43 a second.
 *
 * It applies only where the pan does, which is a screen narrower than the mural
 * is. On a laptop the whole picture is already on screen, there is nothing to
 * traverse, and `SLIDE_DWELL_MS` is still the right number.
 */
export const PAN_DWELL_MS = 11000;

/**
 * How long the traverse itself runs, in milliseconds.
 *
 * Longer than the dwell by one crossfade, because the slide is on screen for a
 * crossfade longer than it is dwelling: it is already arriving while the
 * picture before it fades out, and it is still leaving while the next one
 * arrives. Ending the pan at the exact moment the slide finishes leaving is
 * what keeps the reset invisible. The track parks at the far edge when the
 * animation comes off it (see `.hero-pan-track`), and the animation has just
 * put it there, so there is nothing to snap back from.
 *
 * The one case that does snap is a visitor pressing next early, and it happens
 * underneath a fade that is already running.
 */
export const PAN_MS = PAN_DWELL_MS + CROSSFADE_MS;

/**
 * The widest viewport the pan runs on, as a CSS media query.
 *
 * The same `xl` boundary `.hero-pan-track` uses in app/globals.css, and it has
 * to be the same or the hold and the motion disagree: a slide given eleven
 * seconds because it is panning, on a screen where the stylesheet has turned
 * the pan off, is five seconds of a picture standing still for no reason.
 *
 * The stylesheet owns whether the pan is drawn and this owns how long the slide
 * is given for it, so the number is written twice. There is no third place that
 * could hold it: a CSS custom property cannot be read out of a media query and
 * a JS constant cannot be written into one.
 */
export const PAN_MEDIA_QUERY = "(max-width: 79.9375rem)";

/**
 * How long a slide is held before the hero moves on.
 *
 * Three answers, and each of them is the slide's own length rather than a
 * setting. The film is given a backstop and otherwise ends when it ends. A
 * panning still is given the time its traverse needs. A still that is not
 * panning has no natural length at all, so it takes the one the design picked.
 */
export function slideHoldMs(slide: HeroSlide | undefined, panning: boolean): number {
  if (slide?.kind === "film") return FILM_FALLBACK_MS;
  return panning ? PAN_DWELL_MS : SLIDE_DWELL_MS;
}

/**
 * The shape of a mural, for the track that pans across it.
 *
 * `.hero-pan-track` sizes itself from the hero's height and this ratio, which
 * is how it works out, in CSS alone, how much of the picture does not fit and
 * therefore how far it has to travel. Taken from the file's own dimensions
 * rather than written down, so a re-export at another size needs no edit here.
 */
export function slideAspectRatio(slide: HeroSlide): string | undefined {
  return slide.kind === "still" ? `${slide.width} / ${slide.height}` : undefined;
}

/**
 * A slide index that is certainly in range.
 *
 * Defensive because the index is held in React state next to a timer and next
 * to two buttons a visitor can lean on: a value that has drifted, or that is
 * not a whole number, should put a picture on the screen rather than leave the
 * first screen of the site empty.
 */
function wrap(index: number, total: number): number {
  if (!Number.isFinite(total) || total < 1) return 0;
  if (!Number.isInteger(index)) return 0;
  return ((index % total) + total) % total;
}

/** The slide after this one, wrapping at the end. */
export function nextSlideIndex(
  index: number,
  total: number = HERO_SLIDES.length,
): number {
  return wrap(wrap(index, total) + 1, total);
}

/** The slide before this one, wrapping at the start. */
export function previousSlideIndex(
  index: number,
  total: number = HERO_SLIDES.length,
): number {
  return wrap(wrap(index, total) - 1, total);
}

/**
 * What the pause control says it will do.
 *
 * Named for the action, not the state, the same as the film's own control was:
 * "Pause" on a slideshow that is playing, in a label a screen reader user can
 * act on without first being told what a slideshow is.
 */
export function slideshowControlLabel(playing: boolean): string {
  return playing
    ? "Pause the background slideshow"
    : "Play the background slideshow";
}

/**
 * What one of the manual controls says it will do, counted.
 *
 * "Next picture, 2 of 3" rather than "Next". Where in the set a press lands is
 * the part somebody who cannot see the hero has no other way of getting, and
 * it is what makes the two arrows describable as a set rather than as two
 * unexplained directions.
 */
export function slideStepLabel(
  direction: "next" | "previous",
  index: number,
  total: number = HERO_SLIDES.length,
): string {
  const safeTotal =
    Number.isFinite(total) && total >= 1 ? Math.floor(total) : 1;
  const target =
    direction === "next"
      ? nextSlideIndex(index, safeTotal)
      : previousSlideIndex(index, safeTotal);
  return `${direction === "next" ? "Next" : "Previous"} picture, ${target + 1} of ${safeTotal}`;
}
