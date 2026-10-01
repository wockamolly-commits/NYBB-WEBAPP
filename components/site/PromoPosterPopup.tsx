"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { PromoStub } from "@/components/promos/PromoStub";
import { ButtonLink } from "@/components/ui/Button";
import { promoHeadline, promoPoster, type Promo, type PromoPoster } from "@/lib/promos/schema";
import { cn } from "@/lib/utils";

/**
 * The promo posters, opened over the page when somebody arrives.
 *
 * ONLY ON THE HOME PAGE, ON EVERY ARRIVAL THERE. It opens when somebody
 * lands on `/`: a first visit, a refresh, the logo, Back, or any link home.
 * Every other page has no popup at all. The owner's call (2026-10-01): the
 * landing page is where an offer is introduced, and the menu, a product, the
 * cart and checkout are places somebody is in the middle of something.
 *
 * WHY IT IS TWO COMPONENTS. This one lives in the storefront layout, and a
 * layout does not remount between the pages inside it, so it cannot tell an
 * arrival from a stay by mounting. It renders the sheet only while the path is
 * `/`, which makes the sheet itself mount on each arrival home and unmount on
 * the way out. That mount is the trigger, and every arrival starts clean, on
 * the first poster. A click on the logo while already home is not an arrival
 * (the path does not change), so it scrolls to the hero without reopening this.
 *
 * WHAT IT SHOWS is decided upstream. The layout hands over the same list the
 * promo bar gets, already filtered by list_customer_promos (live, in its
 * dates, not used up, right counter, right customer) and by the spent-codes
 * cookie, and this keeps only the ones with a poster. A voucher that stops
 * qualifying stops being here on the next request, poster and all.
 *
 * SEVERAL POSTERS ARE ONE SWIPEABLE STRIP, in the listing's order (ending
 * soonest first). The strip is native horizontal scroll with snap points, so a
 * swipe on a phone is the browser's own gesture rather than a reimplementation
 * of one, and the arrows and dots drive the same scroll position.
 *
 * A native <dialog> with showModal(), like BranchDialog: the focus trap,
 * Escape, and the inert page behind it are the browser's job.
 */

export function PromoPosterPopup({ promos }: { promos: readonly Promo[] }) {
  const pathname = usePathname();

  const slides = promos.flatMap((promo) => {
    const poster = promoPoster(promo);
    return poster ? [{ promo, poster }] : [];
  });

  if (pathname !== "/" || slides.length === 0) return null;
  return <PosterSheet slides={slides} />;
}

type Slide = { promo: Promo; poster: PromoPoster };

function PosterSheet({ slides }: { slides: readonly Slide[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  // Mounting is arriving home, so this runs once per arrival. See WHY IT IS
  // TWO COMPONENTS above.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // The sheet itself takes focus, not the close button. A screen reader
    // announces the dialog by its label, Tab lands on Close next, and
    // nothing is drawn with a focus ring on arrival: Chrome treats focus
    // moved on a fresh page load as keyboard focus, so focusing Close lit
    // its ring on every phone, every visit. Named explicitly because the
    // strip is a scroll container, which showModal would otherwise pick.
    dialog.focus();
  }, []);

  function close() {
    dialogRef.current?.close();
  }

  function goTo(next: number) {
    const track = trackRef.current;
    if (!track) return;
    // Wraps both ways, like the promo bar's Next, so neither end is a dead
    // button: past the last poster is the first again.
    const clamped = (next + slides.length) % slides.length;
    // Asked here because a behavior passed to scrollTo outranks the global
    // reduced-motion rule in globals.css, which only reaches CSS scrolling.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: clamped * track.clientWidth, behavior: still ? "auto" : "smooth" });
  }

  function onScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setIndex(Math.round(track.scrollLeft / track.clientWidth));
  }

  const many = slides.length > 1;

  // The widest poster decides how wide the sheet may grow, so the sheet hugs
  // the artwork rather than framing a narrow poster in a wide charcoal band.
  // See .promo-poster-dialog in globals.css for the clamp this feeds.
  const widestRatio = Math.max(...slides.map(({ poster }) => poster.width / poster.height));

  return (
    <dialog
      ref={dialogRef}
      className="promo-poster-dialog"
      tabIndex={-1}
      style={{ "--poster-ratio-max": widestRatio } as React.CSSProperties}
      aria-label={many ? `${slides.length} promos running now` : "Promo running now"}
      // The panel fills the dialog, so a click on the dialog element itself
      // landed on the backdrop.
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
    >

      <div
        ref={trackRef}
        onScroll={onScroll}
        className="promo-poster-track flex"
        role={many ? "group" : undefined}
        aria-roledescription={many ? "carousel" : undefined}
      >
        {slides.map(({ promo, poster }, slide) => {
          const { value } = promoHeadline(promo);
          const href = `/checkout?promo=${encodeURIComponent(promo.code)}`;
          return (
            <div
              key={promo.code}
              className="promo-poster-slide flex w-full shrink-0 snap-center flex-col"
              role={many ? "group" : undefined}
              aria-roledescription={many ? "slide" : undefined}
              aria-label={many ? `${slide + 1} of ${slides.length}` : undefined}
              // Off-screen slides are skipped by Tab, so the keyboard only
              // ever reaches the poster in view and the arrows move on.
              inert={many && slide !== index ? true : undefined}
            >
              {/* The frame takes the poster's own proportions and a height
                  ceiling, so the image fills it exactly: nothing cropped,
                  nothing spilling past the sheet. */}
              {/* Centred in whatever height the tallest slide sets, so the
                  row below stays in one place as the strip is swiped. */}
              <div className="flex flex-1 items-center">
              <div
                className="promo-poster-frame"
                style={{ "--poster-ratio": poster.width / poster.height } as React.CSSProperties}
              >
                {/* The whole poster is a way into checkout for a pointer,
                    and left out of the tab order because Apply below is the
                    same link with a name. */}
                <Link href={href} onClick={close} tabIndex={-1} className="absolute inset-0">
                <Image
                  src={poster.url}
                  alt={`Poster for ${promo.code}${value ? `, ${value}` : ""}`}
                  fill
                  sizes="(min-width: 640px) 26rem, 22rem"
                  placeholder={poster.blurDataUrl ? "blur" : "empty"}
                  blurDataURL={poster.blurDataUrl ?? undefined}
                  loading={slide === 0 ? "eager" : "lazy"}
                  className="object-cover"
                />
                </Link>
                {/* On the poster's own corner rather than in a header row. A
                    header was a line of chrome above the artwork saying what
                    the artwork already says, and on a phone it cost the
                    poster its height. Anchored to this frame, not the sheet,
                    so a narrow poster still gets it inside its corner. The
                    disc is 2rem; the button around it is the 2.75rem target.
                    One per slide; inert hides the others from the keyboard. */}
                <button
                  type="button"
                  data-dialog-close
                  onClick={close}
                  aria-label="Close"
                  className="group absolute top-0 right-0 z-10 inline-flex size-11 items-center justify-center outline-none"
                >
                  <span
                    aria-hidden
                    className="bg-nybb-ink/80 text-nybb-bone ring-nybb-bone/25 group-hover:bg-nybb-ink inline-flex size-8 items-center justify-center rounded-full ring-1 transition-colors group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-nybb-orange"
                  >
                    <X className="size-4" strokeWidth={2.5} />
                  </span>
                </button>
              </div>
              </div>
              {/* The ticket and the action share one row at one height. Apply
                  takes the rest of the row, which puts the widest target
                  where a thumb lands, and a long code wraps it underneath
                  rather than squeezing it. */}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <PromoStub code={promo.code} />
                <ButtonLink
                  href={href}
                  onClick={close}
                  tone="dark"
                  className="min-w-[7.5rem] flex-1 justify-center px-4"
                >
                  Apply code
                </ButtonLink>
              </div>
            </div>
          );
        })}
      </div>

      {many ? (
        // Three columns with equal outer tracks, so the dots sit on the
        // sheet's true centre even though "Next" is wider than the arrow.
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-1.5 pb-1.5">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            aria-label="Previous promo"
            className="justify-self-start text-nybb-bone/70 hover:text-nybb-bone inline-flex size-11 items-center justify-center rounded-md transition-colors"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <div className="flex items-center">
            {slides.map(({ promo }, slide) => (
              <button
                key={promo.code}
                type="button"
                onClick={() => goTo(slide)}
                aria-label={`Show promo ${slide + 1} of ${slides.length}`}
                aria-current={slide === index ? "true" : undefined}
                className="inline-flex h-11 w-6 items-center justify-center"
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-2 rounded-full transition-[width,background-color]",
                    slide === index ? "bg-nybb-orange w-4" : "bg-nybb-bone/40 w-2",
                  )}
                />
              </button>
            ))}
          </div>
          {/* Named in words, not only drawn as an arrow: this is the control
              the strip exists for, and "Next" is unmistakable at a glance in
              a way a lone chevron beside a row of dots is not. Previous stays
              an icon, the secondary direction. */}
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            aria-label={`Next promo, ${index + 1} of ${slides.length} showing`}
            className="font-display text-nybb-bone hover:text-nybb-orange justify-self-end inline-flex min-h-11 items-center gap-1 rounded-md pr-2.5 pl-3.5 text-sm tracking-[0.08em] uppercase transition-colors"
          >
            Next
            <ChevronRight aria-hidden className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      ) : null}
    </dialog>
  );
}
