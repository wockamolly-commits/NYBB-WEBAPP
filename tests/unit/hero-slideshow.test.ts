import { describe, expect, it } from "vitest";
import { HERO_IMAGES } from "@/lib/hero/images";
import {
  CROSSFADE_MS,
  FILM_FALLBACK_MS,
  HERO_SLIDES,
  PAN_DWELL_MS,
  PAN_MEDIA_QUERY,
  PAN_MS,
  SLIDE_DWELL_MS,
  nextSlideIndex,
  previousSlideIndex,
  slideAspectRatio,
  slideHoldMs,
  slideStepLabel,
  slideshowControlLabel,
} from "@/lib/hero/slideshow";

/**
 * The landing hero's slideshow, minus the drawing.
 *
 * Three things are worth holding still here. The cycle has to keep returning a
 * real index in both directions, because the component feeds it back into
 * itself on a timer and hands it to two buttons a visitor can lean on: a
 * single bad value would leave the first screen of the site empty. The fade
 * has to finish inside the shortest hold, because a cross fade longer than the
 * hold is not a cross fade, it is two pictures permanently half mixed. And the
 * film's backstop has to be longer than the film, or the slideshow cuts away
 * from a clip it is meant to let finish.
 */

describe("HERO_SLIDES", () => {
  it("opens on the film and then plays both delivered murals", () => {
    expect(HERO_SLIDES.map((slide) => slide.name)).toEqual(["film", "eating", "spread"]);
    expect(HERO_SLIDES[0].kind).toBe("film");
  });

  it("gives the film a poster and both containers", () => {
    const film = HERO_SLIDES[0];
    if (film.kind !== "film") throw new Error("the first slide is the film");

    expect(film.poster).toBe("/video/hero-poster.webp");
    expect(film.sources.map((source) => source.type)).toEqual(["video/webm", "video/mp4"]);
  });

  it("carries the generated file for each mural rather than a hand typed path", () => {
    for (const slide of HERO_SLIDES) {
      if (slide.kind !== "still") continue;

      expect(slide.src).toBe(HERO_IMAGES[slide.name].src);
      expect(slide.width).toBe(HERO_IMAGES[slide.name].width);
      expect(slide.height).toBe(HERO_IMAGES[slide.name].height);
      expect(slide.blurDataURL).toMatch(/^data:image\/webp;base64,/);
    }
  });

  it("frames every slide, because none of them is the shape of the section", () => {
    for (const slide of HERO_SLIDES) {
      if (slide.kind === "film") {
        expect(slide.objectPosition).toMatch(/^\d+% \d+%$/);
        continue;
      }
      expect(slide.objectPositionWide).toMatch(/^\d+% \d+%$/);
    }
  });

  // The rest is a fraction of the overhang, not a percentage string and not a
  // pixel count, because that is what the stylesheet multiplies by. Outside 0
  // to 1 it would park the mural off the side of the hero and show bare ink.
  it("rests each mural inside its own edges", () => {
    for (const slide of HERO_SLIDES) {
      if (slide.kind !== "still") continue;

      expect(slide.panRest).toBeGreaterThanOrEqual(0);
      expect(slide.panRest).toBeLessThanOrEqual(1);
    }
  });
});

describe("slideAspectRatio", () => {
  // The track that pans sizes itself from this, so it has to be the file's own
  // shape rather than a written-down 16/9: a re-export at another ratio would
  // otherwise be cropped by a track still claiming the old one.
  it("is the mural's real shape, taken from the generated manifest", () => {
    const eating = HERO_SLIDES[1];
    if (eating.kind !== "still") throw new Error("the second slide is a mural");

    expect(slideAspectRatio(eating)).toBe(`${eating.width} / ${eating.height}`);
  });

  it("has nothing to say about the film, which is not on a track", () => {
    expect(slideAspectRatio(HERO_SLIDES[0])).toBeUndefined();
  });
});

describe("nextSlideIndex", () => {
  it("advances and wraps", () => {
    expect(nextSlideIndex(0, 3)).toBe(1);
    expect(nextSlideIndex(1, 3)).toBe(2);
    expect(nextSlideIndex(2, 3)).toBe(0);
  });

  it("defaults to the shipped slides", () => {
    expect(nextSlideIndex(HERO_SLIDES.length - 1)).toBe(0);
  });

  it("returns a real index when the one it is given is not", () => {
    expect(nextSlideIndex(-1, 3)).toBe(0);
    expect(nextSlideIndex(9, 3)).toBe(1);
    expect(nextSlideIndex(0.5, 3)).toBe(1);
    expect(nextSlideIndex(Number.NaN, 3)).toBe(1);
  });

  it("returns a real index when there is nothing to cycle through", () => {
    expect(nextSlideIndex(0, 0)).toBe(0);
    expect(nextSlideIndex(0, -3)).toBe(0);
    expect(nextSlideIndex(0, Number.NaN)).toBe(0);
  });

  it("holds still on a single slide", () => {
    expect(nextSlideIndex(0, 1)).toBe(0);
  });
});

describe("previousSlideIndex", () => {
  it("steps back and wraps round the start", () => {
    expect(previousSlideIndex(2, 3)).toBe(1);
    expect(previousSlideIndex(1, 3)).toBe(0);
    expect(previousSlideIndex(0, 3)).toBe(2);
  });

  it("is the inverse of next, which is what the two buttons promise", () => {
    for (let index = 0; index < HERO_SLIDES.length; index++) {
      expect(previousSlideIndex(nextSlideIndex(index))).toBe(index);
      expect(nextSlideIndex(previousSlideIndex(index))).toBe(index);
    }
  });

  it("returns a real index when the one it is given is not", () => {
    // An index out of range is brought back into it first and then stepped
    // from, so -1 is read as the last slide and this lands on the one before
    // it. What matters is that it is always a slide.
    expect(previousSlideIndex(-1, 3)).toBe(1);
    expect(previousSlideIndex(9, 3)).toBe(2);
    expect(previousSlideIndex(Number.NaN, 3)).toBe(2);
    expect(previousSlideIndex(0, 0)).toBe(0);
  });
});

describe("slideHoldMs", () => {
  it("gives the film its backstop rather than a dwell", () => {
    expect(slideHoldMs(HERO_SLIDES[0], false)).toBe(FILM_FALLBACK_MS);
    // The pan never applies to the film, so the viewport cannot change this.
    expect(slideHoldMs(HERO_SLIDES[0], true)).toBe(FILM_FALLBACK_MS);
  });

  it("gives a panning mural the time its traverse needs", () => {
    expect(slideHoldMs(HERO_SLIDES[1], true)).toBe(PAN_DWELL_MS);
  });

  it("gives a mural that is not moving the plain dwell", () => {
    expect(slideHoldMs(HERO_SLIDES[1], false)).toBe(SLIDE_DWELL_MS);
  });

  // The index is state next to a timer, so it can arrive out of range. A hold
  // of undefined or NaN would either freeze the hero on one picture or spin it.
  it("still returns a hold when there is no slide at that index", () => {
    expect(slideHoldMs(undefined, false)).toBe(SLIDE_DWELL_MS);
    expect(slideHoldMs(undefined, true)).toBe(PAN_DWELL_MS);
  });
});

describe("the clock", () => {
  it("finishes the fade well inside the shortest hold", () => {
    expect(CROSSFADE_MS).toBeLessThan(SLIDE_DWELL_MS / 2);
  });

  // The slide is on screen for a crossfade longer than it dwells: it is
  // arriving while the one before fades out and still leaving while the next
  // arrives. A traverse that ended before that has a picture standing still at
  // the far edge; one that ended after it is cut off mid move.
  it("runs the traverse for exactly as long as the slide is on screen", () => {
    expect(PAN_MS).toBe(PAN_DWELL_MS + CROSSFADE_MS);
  });

  it("holds a panning mural longer than a stationary one", () => {
    expect(PAN_DWELL_MS).toBeGreaterThan(SLIDE_DWELL_MS);
  });

  // 79.9375rem is 1279px at the default root size, which is one pixel below
  // Tailwind's xl. If this drifts from the `@media (min-width: 80rem)` block in
  // app/globals.css, a slide is held for eleven seconds on a screen the
  // stylesheet has decided not to pan, which is five seconds of nothing.
  it("gates the pan at the same boundary the stylesheet draws it at", () => {
    expect(PAN_MEDIA_QUERY).toBe("(max-width: 79.9375rem)");
  });

  it("holds a still long enough to be read as a picture rather than an animation", () => {
    expect(SLIDE_DWELL_MS).toBeGreaterThanOrEqual(5000);
  });

  it("waits out the whole film before the backstop fires", () => {
    // The clip is seven seconds. The backstop exists for the browser that
    // never reports it finishing, so it has to clear the clip itself with
    // room for a slow start.
    expect(FILM_FALLBACK_MS).toBeGreaterThan(7000 + SLIDE_DWELL_MS / 2);
  });
});

describe("slideshowControlLabel", () => {
  it("names the action rather than the state", () => {
    expect(slideshowControlLabel(true)).toBe("Pause the background slideshow");
    expect(slideshowControlLabel(false)).toBe("Play the background slideshow");
  });
});

describe("slideStepLabel", () => {
  it("says where the press lands, counted from one", () => {
    expect(slideStepLabel("next", 0, 3)).toBe("Next picture, 2 of 3");
    expect(slideStepLabel("next", 2, 3)).toBe("Next picture, 1 of 3");
    expect(slideStepLabel("previous", 0, 3)).toBe("Previous picture, 3 of 3");
    expect(slideStepLabel("previous", 1, 3)).toBe("Previous picture, 1 of 3");
  });

  it("counts the slides that actually ship by default", () => {
    expect(slideStepLabel("next", 0)).toBe(`Next picture, 2 of ${HERO_SLIDES.length}`);
  });

  it("never reads out a zero or a fraction", () => {
    expect(slideStepLabel("next", Number.NaN, 3)).toBe("Next picture, 2 of 3");
    expect(slideStepLabel("previous", 0, 0)).toBe("Previous picture, 1 of 1");
  });
});
