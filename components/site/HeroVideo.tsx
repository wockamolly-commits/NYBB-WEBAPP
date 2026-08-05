"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * The landing hero loop.
 *
 * Source is the brand's own food film, 27 seconds of 1080p60 HEVC at 37 MB.
 * HEVC plays in Safari and in almost nothing else, and 37 MB is not a hero, so
 * `scripts/build-hero-video.sh` cuts the seven seconds that matter (crisp
 * wings, the buffalo sauce pour, the sauced wings) and re-encodes to H.264 and
 * VP9 at 720p30 without audio. That lands at 888 KB and 538 KB, with a 39 KB
 * poster frame.
 *
 * The poster is what the server renders. The video is attached after mount and
 * only when the visitor has not asked for reduced motion and is not on a
 * metered connection, so the still is never a flash of the wrong thing: it is
 * the real fallback, and on a Cebu mobile connection it may be all that loads.
 */
export function HeroVideo() {
  const [playable, setPlayable] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");

    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;

    const apply = () => setPlayable(!query.matches && !connection?.saveData);

    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {playable ? (
        <video
          aria-hidden
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/video/hero-poster.webp"
          className="h-full w-full object-cover"
        >
          <source src="/video/hero.webm" type="video/webm" />
          <source src="/video/hero.mp4" type="video/mp4" />
        </video>
      ) : (
        <Image
          src="/video/hero-poster.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      )}

      {/* The ink wash. Without it the headline sits on a moving image and the
          contrast ratio changes frame to frame, which is untestable.

          It is weighted to the bottom left, where the type is, and kept light
          over the rest: the food is the reason the video is here, and washing
          the whole frame to near black buys contrast nobody needed by throwing
          away the only thing on screen worth looking at. */}
      <div
        aria-hidden
        className="from-nybb-ink via-nybb-ink/55 absolute inset-0 bg-gradient-to-t to-transparent"
      />
      <div
        aria-hidden
        className="from-nybb-ink/85 absolute inset-0 bg-gradient-to-r via-transparent to-transparent"
      />
    </div>
  );
}
