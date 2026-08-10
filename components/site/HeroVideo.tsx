"use client";

import { Pause, Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * The landing hero loop.
 *
 * Source is the brand's own food film, 27 seconds of 1080p60 HEVC at 37 MB.
 * HEVC plays in Safari and in almost nothing else, and 37 MB is not a hero, so
 * `scripts/build-hero-video.sh` cuts the seven seconds that matter, crops the
 * wordmark that is burnt into the film's top left corner, and re-encodes to
 * H.264 and VP9 at 720p30 without audio.
 *
 * The poster is what the server renders. The video is attached after mount and
 * only when the visitor has not asked for reduced motion and is not on a
 * connection that should not be spending the bytes, so the still is never a
 * flash of the wrong thing: it is the real fallback, and on a Cebu mobile
 * connection it may be all that loads.
 *
 * WHAT A LOOPING BACKGROUND OWES THE VIEWER.
 * ================================================================
 * WCAG 2.2.2 (Pause, Stop, Hide) is a Level A criterion, and it applies to any
 * motion that starts by itself, runs more than five seconds, and sits alongside
 * other content. This loop is seven. The reduced-motion gate below is real and
 * it stays, but it does not satisfy 2.2.2 on its own: it only reaches visitors
 * who have found and set an OS level switch, and the criterion is written for
 * everyone else. So there is a control, and it is a real focusable button
 * rather than a click handler on the video.
 *
 * It is reached before the two CTAs, which follows from this component being
 * painted under the copy, and it is worth keeping rather than working around.
 * Someone tabbing here because the motion is the problem should not have to
 * pass through "See the menu" and "Call a branch" to reach the thing that stops
 * it, and the cost is one extra tab for everyone else in a section that holds
 * only two other controls.
 *
 * WHY THE CONNECTION CHECK IS NOT JUST saveData.
 * ================================================================
 * This used to read `connection.saveData` alone, and the comment above it
 * promised that on a slow Cebu connection the poster "may be all that loads".
 * That promise was not kept by that code. `saveData` is only true when the
 * visitor has explicitly switched Data Saver on: it is false by default on
 * every Android, and unimplemented in Safari, so in practice almost nobody was
 * spared the download. `effectiveType` and `downlink` are what actually
 * describe the link, and they are cheap to read, so they are read.
 *
 * THE SCRIM IS TWO LAYERS ON ONE AXIS.
 * ================================================================
 * A flat hold plus a bottom ramp, with the stops measured against where the
 * type actually is rather than chosen by eye. The type block runs from 9 to 79
 * percent up the section's height, worst case being a landscape phone, so the
 * ramp has to work almost the whole way up and only the top fifth is free. The
 * flat layer is what gives the top of that block a floor no matter which frame
 * is on screen, which is the part a single bottom gradient could never do for a
 * moving image.
 *
 * The old left-weighted second wash is gone. It existed to protect the type
 * column from whatever the film brought into it, and it is exactly what fell
 * across the burnt-in wordmark and smeared it into a ghost. With the mark
 * cropped out at the encoder there is nothing left for it to do.
 */

type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

/**
 * Is this a link that should not be spending 540 KB on decoration?
 *
 * Deliberately generous about what counts as slow, and deliberately silent when
 * the browser will not say. An unknown connection is treated as fine, because
 * the alternative is denying the video to every Safari visitor on fibre.
 */
function isMetered(connection: NetworkInformation | undefined) {
  if (!connection) return false;
  if (connection.saveData) return true;
  if (/(^|-)2g$/.test(connection.effectiveType ?? "")) return true;
  if (connection.effectiveType === "3g") return true;
  return typeof connection.downlink === "number" && connection.downlink < 1.5;
}

export function HeroVideo() {
  const [playable, setPlayable] = useState(false);
  const [playing, setPlaying] = useState(true);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;

    const apply = () => setPlayable(!query.matches && !isMetered(connection));

    apply();
    query.addEventListener("change", apply);
    connection?.addEventListener?.("change", apply);

    return () => {
      query.removeEventListener("change", apply);
      connection?.removeEventListener?.("change", apply);
    };
  }, []);

  // Driven off the element rather than off React state, because the element is
  // the thing that can also be paused by the browser (a background tab, a low
  // power mode), and a control that lies about what the video is doing is worse
  // than no control.
  function toggle() {
    const element = video.current;
    if (!element) return;

    if (element.paused) {
      void element.play();
    } else {
      element.pause();
    }
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* The still is always mounted, and the video paints over it.
          ================================================================
          It used to be one or the other, with the video carrying a `poster`
          attribute of its own, and that shipped the same picture twice: the
          server rendered this Image and the browser fetched next/image's
          responsive variant, then hydration swapped in the video and the
          poster attribute fetched the raw file as well. 73 KB plus 38 KB at
          1440 for one image.

          Leaving the still underneath costs nothing (it is already decoded)
          and removes the second request, because the video no longer needs a
          poster: there is one behind it. It also keeps the optimised variant
          on the path that most needs it, which is the metered connection that
          never gets a video at all. */}
      <Image
        src="/video/hero-poster.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />

      {playable ? (
        <video
          ref={video}
          aria-hidden
          autoPlay
          muted
          loop
          playsInline
          // metadata, not auto. `auto` pulls the whole file whether or not the
          // visitor ever sees the bottom of the hero, and it competes with
          // hydration and with the nine flavour images below it.
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src="/video/hero.webm" type="video/webm" />
          <source src="/video/hero.mp4" type="video/mp4" />
        </video>
      ) : null}

      {/* The flat hold, for the top of the type block. */}
      <div aria-hidden className="bg-nybb-ink/38 absolute inset-0" />

      {/* The ramp, for the copy at the foot of it. */}
      <div
        aria-hidden
        className="from-nybb-ink via-nybb-ink/68 absolute inset-0 bg-gradient-to-t from-28% via-74% to-transparent"
      />

      {playable ? (
        // THE CONTROL BRINGS ITS OWN GROUND, BECAUSE IT CANNOT KNOW ITS OWN
        // BACKGROUND.
        // ================================================================
        // The ghost tier is transparent at rest, which is correct for a control
        // sitting on a surface the system chose. This one sits on whatever
        // frame the film happens to be showing, which is a surface nothing can
        // predict: measured against a bright frame, a bone/70 glyph is
        // invisible, and the one control on the page that WCAG 2.2.2 makes
        // non-optional was the thing that disappeared.
        //
        // The plinth is a sibling ground rather than a background utility on
        // the button. Written as a class it would have to beat the ghost
        // variant's own `hover:bg-*`, and two utilities setting one property
        // under one variant are resolved by stylesheet order, which is not a
        // thing to depend on. Underneath, the tint composites over ink and the
        // hover still reads.
        //
        // z-20 because the section's content column is a later sibling and
        // spans the full width below the 6xl breakpoint, so without it this is
        // painted behind a transparent box and stops taking clicks.
        <div className="bg-nybb-ink/70 absolute right-4 bottom-4 z-20 rounded-md sm:right-6 sm:bottom-6">
          <Button
            tone="dark"
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label={playing ? "Pause the background video" : "Play the background video"}
          >
            {playing ? (
              <Pause aria-hidden className="size-4" />
            ) : (
              <Play aria-hidden className="size-4" />
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
