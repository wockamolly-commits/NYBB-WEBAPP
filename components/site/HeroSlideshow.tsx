"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  CROSSFADE_MS,
  HERO_SLIDES,
  PAN_MEDIA_QUERY,
  PAN_MS,
  nextSlideIndex,
  previousSlideIndex,
  slideAspectRatio,
  slideHoldMs,
  slideStepLabel,
  slideshowControlLabel,
} from "@/lib/hero/slideshow";
import { currentConnection, isMetered } from "@/lib/site/connection";

/**
 * The landing hero's background: the store's food film, then its two wall
 * murals, dissolving into each other and back round.
 *
 * The film is the same seven seconds this hero has always opened on, cut by
 * `scripts/build-hero-video.sh`. The murals are the store's wall artwork in
 * its 16:9 re-layout, delivered with the wordmark taken out at source, so what
 * these hold is the whole composition: the food and the panel of display type,
 * and no second lockup competing with the one the header draws eighty pixels
 * above. `scripts/build-hero-slides.ts` resizes them and commits them under
 * `public/hero/`.
 *
 * WHAT MOVES, AND WHAT DOES NOT.
 * ================================================================
 * Between slides, opacity and nothing else. No push, no slow zoom. A dissolve
 * reads as one picture becoming another rather than as an animation running.
 *
 * Within a slide, one thing moves and only on a narrow screen. The murals are
 * 16:9 and a phone hero is about 390 by 658, so a third of the artwork fits
 * and the rest used to be permanently cropped away. So the phone pans: the
 * picture sits at its natural width and the hero is a window travelling across
 * it, left edge to right edge, once, over the whole time the slide is up. That
 * is `.hero-pan-track` in globals.css, which works the distance out from the
 * hero's own width in CSS rather than being told it.
 *
 * It is not a Ken Burns drift laid over a picture that already fitted, which is
 * the version of this that deserves its reputation. Nothing moves on a laptop,
 * because on a laptop there is nothing that does not fit.
 *
 * THE FILM SETS ITS OWN LENGTH, AND SO DOES A PANNING STILL.
 * ================================================================
 * A still that is not moving has no natural duration, so it holds for six
 * seconds. The film does have one and it is allowed to reach it: the hero
 * advances on `ended` rather than on a clock, because cutting away from a seven
 * second shot at six is the one edit this slideshow could obviously get wrong.
 * `FILM_FALLBACK_MS` covers the case where `ended` never arrives, which is a
 * browser refusing to autoplay or a file that will not decode, and it is a
 * backstop rather than a duration.
 *
 * A panning still has a natural duration too, for the same reason: it has a
 * beginning and an end, and cutting away halfway through the traverse is the
 * same edit. So it is given eleven seconds where a stationary one gets six, and
 * `slideHoldMs` is where the three answers live.
 *
 * Coming back round, the film is rewound and played from the top. A clip that
 * resumed from wherever it was left would be a different clip every time.
 *
 * WHAT AN AUTOMATIC SLIDESHOW OWES THE VIEWER.
 * ================================================================
 * WCAG 2.2.2 (Pause, Stop, Hide) is Level A and it applies to any motion that
 * starts by itself, runs more than five seconds, and sits alongside other
 * content. This does all three. The reduced motion gate below is real and it
 * stays, but it does not satisfy 2.2.2 on its own: it only reaches visitors
 * who have found and set an OS level switch, and the criterion is written for
 * everyone else. So there is a pause, and it is a real focusable button rather
 * than a click handler on the picture.
 *
 * The controls are reached before the two CTAs, which follows from this
 * component being painted under the copy, and it is worth keeping rather than
 * working around. Someone tabbing here because the motion is the problem
 * should not have to pass through both calls to action to reach the thing that
 * stops it.
 *
 * Previous and next are always there, including for the visitor who has
 * reduced motion set and is therefore never moved automatically. That is the
 * point of them: the pictures stop being something that happens to you and
 * become something you can look through.
 *
 * WHAT A METERED LINK IS ASKED TO PAY FOR.
 * ================================================================
 * The poster is the LCP element and is unconditional. The film is 540 KB and
 * the two murals are about 170 KB between them, which is not a trade a phone
 * on a 3G connection in Cebu should be made to take without asking. So a
 * metered link gets the poster, no film, no timer, and loads a mural only if
 * somebody presses next. That is the same judgement the film made on its own,
 * reached through the same predicate, which now lives in
 * `lib/site/connection.ts`.
 *
 * THE INK IS ON THE LETTERS, AND THE PICTURE IS LEFT ALONE.
 * ================================================================
 * Both murals are shot on a pale ground, one grey and one near white, and the
 * brightest patch under the copy column measures 249 of 255 once it is blurred
 * to the scale type is read at. Against that, bone at 60 percent (the status
 * line, 14px) needs the ground it sits on held at about 77 percent ink before
 * it clears 4.5:1. That is a lot of ink, and where it goes is the whole design
 * of this layer.
 *
 * It used to go on the picture. A flat hold plus a bottom ramp, the ramp solid
 * across the left 42 percent of the width and still at 76 percent 500px up,
 * which is what a copy block that size needs if the block is what has to be
 * dark. It measured well everywhere and it was the wrong trade: on the eating
 * mural that rectangle lands squarely on the woman the photograph is of, and
 * the two brightest things in the spread, the sauce and the fries, sit under
 * the same wash. On a phone, where the ramp had to run the full width because
 * the copy does, the artwork was effectively not shown. The hero was paying for
 * readable type with its subject.
 *
 * It goes on the letters instead. `.hero-type` in globals.css is a four stop
 * ink halo sized in ems of whatever it is set on, so the ground a glyph is
 * measured against is ink at the one place the measurement happens, which is
 * the pixel beside the glyph, and the picture two words over is untouched. That
 * halo is now the whole readability budget.
 *
 * Three layers are left over it and all three are light enough to see the
 * mural through. `.hero-ramp` tops out at about half the ink it used to carry
 * and is spent within 300px of the floor; it is no longer holding a ratio, it
 * is settling the copy block onto the bottom of the section so the type does
 * not read as floating on a photograph. `.hero-foot` is 72px of join where the
 * dark band meets the amber ground, which used to be baked into the files and
 * is a stylesheet number now. And the flat hold below is 6 percent, which is a
 * grade rather than a cover.
 *
 * The mask on the ramp stays, and matters more now than it did. From `xl` the
 * copy is a column down the left and the right of the frame carries the mural's
 * own display panel, which is the part of the artwork composed to be read.
 * Even a light wash laid across that is a wash across the thing worth showing.
 *
 * A diagonal was tried early and is worth naming, because it looks like the
 * obvious answer and is not. `to top right` on a wide box points mostly
 * upward, so the dark corner it hands back is the top left, which is where the
 * murals put a drink and a person's face, and the band it drags across the
 * middle is exactly where the headline's second half sits.
 *
 * From `xl` the ramp's own stops are lengths rather than percentages, for the
 * reason globals.css gives: the copy is a fixed block standing on the foot of
 * the section, so how far the ink has to reach is a number of pixels and not a
 * fraction of the window.
 *
 * Measured on all three slides at 1920x1080, 1440x900, 1280x800, 390x844 and
 * 844x390, against the pixels that actually border a glyph rather than against
 * the block the copy sits in, because a halo is only ever ground at the edge of
 * a letterform and a box average would credit it for ink it does not have. On
 * the panning slides the measurement is taken at both ends of the traverse and
 * at the middle, since the ground under the copy is a different part of the
 * mural at each.
 */
export function HeroSlideshow() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  // Whether this visitor gets motion at all. False until the effect below has
  // asked, so the server and the first client render agree on a still hero.
  const [cycling, setCycling] = useState(false);
  // Which slides have been on screen. A metered link fetches nothing it has
  // not been asked for, and this is the record of what it has been asked for.
  const [reached, setReached] = useState<readonly number[]>([0]);
  // Whether the mural is wider than the hero, which is the only question that
  // decides a pan. Asked of the same media query the stylesheet draws it under,
  // because the two have to agree about which slides have a traverse to finish.
  // False on the server and on the first client render, so a slide that is not
  // yet known to be panning is given the shorter hold rather than the longer
  // one: guessing short and correcting is a slide that settles, guessing long
  // and correcting is a slide that jumps.
  const [panning, setPanning] = useState(false);
  const film = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = window.matchMedia(PAN_MEDIA_QUERY);
    const connection = currentConnection();

    const apply = () => {
      setCycling(!query.matches && !isMetered(connection));
      // Reduced motion is not excluded here. The pan is off under it either
      // way, by the rule in globals.css, and what this decides is how long a
      // slide is held: a picture that is not moving is a six second still
      // whatever the viewport is.
      setPanning(!query.matches && narrow.matches);
    };

    apply();
    query.addEventListener("change", apply);
    narrow.addEventListener("change", apply);
    connection?.addEventListener?.("change", apply);

    return () => {
      query.removeEventListener("change", apply);
      narrow.removeEventListener("change", apply);
      connection?.removeEventListener?.("change", apply);
    };
  }, []);

  // Every route to another slide goes through here, which is what lets the
  // record of what has been shown be kept beside the move rather than watched
  // for afterwards in an effect.
  const show = useCallback((next: number) => {
    setIndex(next);
    setReached((current) => (current.includes(next) ? current : [...current, next]));
  }, []);

  // THE FILM IS DRIVEN RATHER THAN LEFT TO ITSELF.
  // ================================================================
  // `autoPlay` would start it at mount and keep playing it inside a slide
  // nobody is looking at. Arriving rewinds it, so the clip always opens on its
  // first frame, and leaving stops it.
  useEffect(() => {
    const element = film.current;
    if (!element) return;

    if (index === 0) {
      element.currentTime = 0;
    } else {
      element.pause();
    }
  }, [index, cycling]);

  // Playing and holding are a separate effect from rewinding, and the split is
  // load bearing rather than tidy. Pressing pause on the film slide has to
  // stop the element: while it was one effect, pause stopped the timer and
  // left the film running, so the clip reached its end, fired `ended`, and
  // advanced a slideshow the visitor had just asked to stand still.
  //
  // It also means resuming carries on from where the pause landed instead of
  // starting the clip again, which is what the word pause promises.
  useEffect(() => {
    const element = film.current;
    if (!element || index !== 0) return;

    if (playing) {
      // A rejected play() is the browser declining rather than an error to
      // report: the poster is underneath it and FILM_FALLBACK_MS moves the
      // hero on regardless.
      void element.play().catch(() => {});
    } else {
      element.pause();
    }
  }, [index, playing, cycling]);

  useEffect(() => {
    if (!cycling || !playing) return;

    // A timeout per slide rather than one interval across all of them, so
    // pressing next restarts the clock instead of leaving the new slide with
    // whatever was left of the old one's.
    const hold = slideHoldMs(HERO_SLIDES[index], panning);
    const timer = window.setTimeout(() => show(nextSlideIndex(index)), hold);

    return () => window.clearTimeout(timer);
  }, [cycling, playing, index, panning, show]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {HERO_SLIDES.map((slide, position) => {
        // Everything is mounted once motion is on, so the next picture is
        // already decoded when the fade to it begins. Without it, only what
        // has actually been asked for.
        if (!cycling && !reached.includes(position)) return null;

        return (
          <div
            key={slide.name}
            aria-hidden
            style={{ transitionDuration: `${CROSSFADE_MS}ms` }}
            // hero-pan is the container the track measures itself against.
            // It has to be this element and not the root: cqw resolves to the
            // nearest inline-size container, and what the track needs is the
            // width of the hole it is panning inside.
            className={`hero-pan absolute inset-0 transition-opacity ease-in-out motion-reduce:transition-none ${
              position === index ? "opacity-100" : "opacity-0"
            }`}
          >
            {slide.kind === "film" ? (
              <>
                {/* The still is always mounted and the film paints over it.
                    It used to be one or the other, with the video carrying a
                    `poster` attribute of its own, and that shipped the same
                    picture twice: the server rendered this Image and the
                    browser fetched next/image's responsive variant, then
                    hydration swapped in the video and the poster attribute
                    fetched the raw file as well. Leaving the still underneath
                    costs nothing, removes the second request, and keeps the
                    optimised variant on the path that most needs it, which is
                    the metered connection that never gets a film at all. */}
                <Image
                  src={slide.poster}
                  alt=""
                  fill
                  priority
                  sizes="100vw"
                  style={{ objectPosition: slide.objectPosition }}
                  className="object-cover"
                />
                {cycling ? (
                  <video
                    ref={film}
                    muted
                    playsInline
                    // No `loop`: this is a slide now, and a slide ends.
                    // `metadata` rather than `auto`, because `auto` pulls the
                    // whole file whether or not the visitor ever sees the
                    // bottom of the hero, and it competes with hydration and
                    // with the ten flavour images below it.
                    preload="metadata"
                    onEnded={() => show(nextSlideIndex(0))}
                    style={{ objectPosition: slide.objectPosition }}
                    className="absolute inset-0 h-full w-full object-cover"
                  >
                    {slide.sources.map((source) => (
                      <source key={source.src} src={source.src} type={source.type} />
                    ))}
                  </video>
                ) : null}
              </>
            ) : (
              /* The track is the mural at the width covering the hero's height
                 costs, which below `xl` is wider than the hero. It carries the
                 travel; the picture inside it just fills it.

                 Everything the travel needs is here as a custom property,
                 because none of it belongs to the stylesheet: the shape is the
                 file's, the resting fraction is the slide's, and the duration
                 is the slideshow's. What the stylesheet owns is the one thing
                 an inline style cannot carry, which is the media query that
                 decides whether any of it applies. */
              <div
                className="hero-pan-track"
                data-panning={position === index}
                data-paused={!playing}
                style={
                  {
                    "--slide-ratio": slideAspectRatio(slide),
                    "--slide-rest": slide.panRest,
                    "--slide-wide": slide.objectPositionWide,
                    "--pan-ms": `${PAN_MS}ms`,
                  } as React.CSSProperties
                }
              >
                <Image
                  src={slide.src}
                  alt=""
                  fill
                  placeholder="blur"
                  blurDataURL={slide.blurDataURL}
                  // The picture is as wide as covering the hero's height
                  // costs, not as wide as the hero, so a viewport width is the
                  // wrong hint below `xl`: at 390x844 the track renders 1170
                  // and `100vw` would ask for 390. The hero is 78svh and the
                  // artwork is 16:9, so the width that matters is 0.78 x 1.78
                  // of the viewport height, which is where 139vh comes from.
                  // From `xl` the track is the hero's own box again.
                  sizes="(min-width: 80rem) 100vw, 139vh"
                  className="hero-slide object-cover"
                />
              </div>
            )}
          </div>
        );
      })}

      {/* The flat hold, for the top of the type block, where the ramp has
          run out and the tagline still has to land on something. Six percent
          at every width now, where it used to be twice that below `xl`: the
          phone is the screen where the mural has the least room to be seen, so
          it is the last screen that should be carrying the heavier grade. This
          is a grade on the picture rather than a cover over it, and the
          contrast underneath the copy is the halo's job. */}
      <div aria-hidden className="bg-nybb-ink/6 absolute inset-0" />

      {/* The ramp, for the copy at the foot of the section. Roughly half the
          ink it carried before this pass and a third of what it carried before
          the halo, because the type now brings its own ground (.hero-type in
          globals.css). What is left is settling the copy block onto the floor
          of the section rather than holding a ratio on its own. From xl two
          things happen to it: the stops move down, so it is spent before it
          reaches the part of the picture no type of ours reaches either, and
          it is masked off toward the right, which is what hands the mural's
          own display panel back whole. See .hero-ramp in globals.css.

          The gradient itself is in the stylesheet rather than in utilities
          here, because its stops are lengths rather than percentages: the copy
          is a fixed height sitting on the floor of the section, so how far up
          the ink has to reach is a number of pixels, not a fraction of
          whatever the window happens to be. */}
      <div aria-hidden className="hero-ramp absolute inset-0" />

      {/* The join, 72px of it, where the hero's hard bottom edge meets the
          amber ground below. It used to be a sixth of each picture faded into
          ink by the build script, which meant the artwork paid for the edge
          and the depth that survived depended on how much of the height that
          viewport happened to crop. Unmasked and full width, because unlike
          the ramp this is about the section's boundary rather than about the
          copy, and a boundary that stops two thirds of the way across is a
          worse artefact than the one it was avoiding. */}
      <div aria-hidden className="hero-foot absolute inset-x-0 bottom-0 h-[72px]" />

      {/* THE PICTURE TAKES INK AS THE READER LEAVES IT.
          ================================================================
          A scroll linked layer, so the hero dissolves into the amber ground
          below rather than being cut away from at a hard edge. It is empty at
          the top of the page and only ever adds ink, which means every
          contrast ratio measured on this surface goes up while it runs and
          none goes down: the scrim and the halos underneath keep doing exactly
          what they were measured doing.

          A sibling of the grades rather than a property on one of them,
          because those carry values that were measured. Its whole behaviour is
          in `.hero-dim` and the `@supports` block beside it in globals.css,
          so a browser without scroll linked animations paints it at zero and a
          reader with reduced motion never sees it at all.

          Before the controls in source order and carrying no z-index, so the
          bar at z-20 stays above it, and `pointer-events: none` in the
          stylesheet in case that ordering is ever disturbed. */}
      <div aria-hidden className="hero-dim" />

      {/* THE CONTROLS BRING THEIR OWN GROUND, BECAUSE THEY CANNOT KNOW THEIR
          OWN BACKGROUND.
          ================================================================
          The ghost tier is transparent at rest, which is correct for a control
          sitting on a surface the system chose. These sit in the corner of a
          picture that changes every few seconds, and on the pale ground both
          murals are shot on, a bone/70 glyph is invisible: the one control on
          the page that WCAG 2.2.2 makes non-optional was the thing that
          disappeared.

          The plinth is a shared sibling ground rather than a background
          utility on each button. Written as a class it would have to beat the
          ghost variant's own `hover:bg-*`, and two utilities setting one
          property under one variant are resolved by stylesheet order, which is
          not a thing to depend on. It is one bar rather than three, because
          three plinths in a row read as three unrelated controls, and the
          hairlines between them are what say these belong to each other. The
          bone ring is what holds the bar itself against a pale frame, the same
          job the tint does for the glyphs.

          z-20 because the section's content column is a later sibling and
          spans the full width below the 6xl breakpoint, so without it this is
          painted behind a transparent box and stops taking clicks. */}
      <div
        role="group"
        aria-label="Hero pictures"
        className="bg-nybb-ink/70 ring-nybb-bone/25 absolute right-4 bottom-4 z-20 flex items-center rounded-md ring-1 sm:right-6 sm:bottom-6"
      >
        <Button
          tone="dark"
          variant="ghost"
          size="icon"
          onClick={() => show(previousSlideIndex(index))}
          aria-label={slideStepLabel("previous", index)}
        >
          <ChevronLeft aria-hidden className="size-5" />
        </Button>

        <span aria-hidden className="bg-nybb-bone/25 h-6 w-px" />

        {cycling ? (
          <>
            <Button
              tone="dark"
              variant="ghost"
              size="icon"
              onClick={() => setPlaying((current) => !current)}
              aria-label={slideshowControlLabel(playing)}
            >
              {playing ? (
                <Pause aria-hidden className="size-4" />
              ) : (
                <Play aria-hidden className="size-4" />
              )}
            </Button>

            <span aria-hidden className="bg-nybb-bone/25 h-6 w-px" />
          </>
        ) : null}

        <Button
          tone="dark"
          variant="ghost"
          size="icon"
          onClick={() => show(nextSlideIndex(index))}
          aria-label={slideStepLabel("next", index)}
        >
          <ChevronRight aria-hidden className="size-5" />
        </Button>
      </div>
    </div>
  );
}
