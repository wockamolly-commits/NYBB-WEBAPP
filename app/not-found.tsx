import type { Metadata } from "next";
import { MuralArt } from "@/components/mural/MuralArt";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * The 404, and the one screen that carries a full mural composition.
 *
 * WHY THE ARTWORK LIVES HERE RATHER THAN ANYWHERE ELSE. This page has no other
 * job. Every other route is carrying a menu, a cart or an order, and a drawing
 * this size on any of them would be competing with the thing the customer came
 * for. Here the drawing *is* the page, and the subject is exactly right: a
 * customer who took a wrong turn is standing outside the shop looking up at the
 * marquee.
 *
 * WHY THIS FILE REPEATS THE CHROME. `app/not-found.tsx` sits at the root, which
 * is what makes it answer for every unmatched URL on the site rather than only
 * for a `notFound()` thrown inside one segment. The cost is that it renders
 * inside `app/layout.tsx` alone and never sees `app/(marketing)/layout.tsx`,
 * so the header and the footer are named here. The cart bar is deliberately not:
 * it is a bar advertising a cart, and this screen's job is to point at the menu.
 *
 * WHY TWO DRAWINGS OF ONE CORNER. The detailed trace carries the mural's fine
 * hatching at 3.3 units in a 1500 unit viewBox, which clears a pixel down to
 * about 450px of render width and falls under it on a phone, where the browser
 * would render it as a wash rather than as strokes. The `sm` breakpoint swaps
 * in a variant whose fine strokes were removed at the bitmap instead. That is a
 * different drawing, not this one scaled, which is the only honest way to make
 * a hatched drawing smaller.
 */
export default function NotFound() {
  return (
    <>
      <Header />

      <main id="main">
        {/* The section clips, and the drawing is drawn to be clipped by it.
            An illustration sized to sit inside its column reads as a framed
            picture laid on the page, which is the one thing this artwork must
            not do: it is a wall, and a wall runs past the edge of what you can
            see. So it bleeds off the right and off the bottom at every width,
            and the only edges the eye finds are the ones the viewport made.

            THE BOTTOM GUTTER IS OWNED HERE, NOT BY THE FOOTER, AND THAT IS THE
            WHOLE POINT.
            ================================================================
            The footer used to bring its own `mt-20` to every page. On the pages
            that end on copy that is right. Here it was not: at `lg` the drawing
            fills the section's full height and runs to its last row, so those
            80px of bare amber sat directly under the artwork and read as a cut
            edge. Measured on the rendered page, ink density held to row 660 and
            was exactly zero from 665 to 741, which is a hard horizontal line
            through the middle of a drawing whose entire job is to have no edge
            the page made.

            So the footer is `flush` and the spacing moves here, where it can be
            conditional. Below `lg` the drawing is at the top of the section and
            the buttons are the last thing on the page, so the gutter is still
            wanted and `pb-20` restores it exactly. At `lg` it goes to zero and
            the drawing runs into the footer's heat rule, which is chrome: an
            edge the page ends on rather than an edge the picture stopped at.
            The footer's own skyline already does this against the legal plinth,
            for the same reason. */}
        <section className="relative overflow-hidden pb-20 lg:pb-0">
          {/* Phone and tablet: the corner sits above the message, full bleed
              across the viewport rather than inside the container's gutters. */}
          <MuralArt
            motif="storefront-small"
            label="The Buffalo Brad's marquee, drawn on a New York street corner"
            position="center top"
            fade="linear-gradient(to bottom, #000 74%, transparent 100%)"
            className="text-nybb-ink -mt-px w-full lg:hidden"
          />

          {/* Desktop: the corner occupies the right half of the section and
              runs off three of its four sides. Absolute rather than a grid
              column, because a grid cell would size the drawing to the text
              beside it, and the drawing has to be able to overrun. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 hidden w-[60%] lg:block"
          >
            {/* THE FOUR EDGES, AND WHAT HAPPENS TO EACH.
                `cover` fills the box and lets the section's overflow crop it,
                so top, bottom and right all run off the viewport. Contain was
                wrong here for the same reason a framed picture is wrong: it
                fits the whole drawing inside and leaves bare amber around the
                remainder.

                That still leaves the fourth. The traced artwork is a crop of a
                wall, so its left boundary is a straight line, and no amount of
                bleeding the other three sides changes the fact that this one
                falls in the middle of the page. It is faded rather than cut:
                the ink goes to nothing across the leftmost quarter of the box,
                which is also what keeps the copy sitting on clean ground. */}
            <MuralArt
              motif="storefront"
              fit="cover"
              position="right center"
              fade="linear-gradient(to right, transparent 2%, #000 30%)"
              className="text-nybb-ink absolute inset-0 h-full w-full"
            />
          </div>

          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:py-28">
            {/* Held to half the container at lg so the copy never runs under
                the drawing. The measure is set by the column, not by the
                paragraph, so the heading and the buttons share one left rail
                with the text and the block reads as one object. */}
            <div className="max-w-[34rem] lg:max-w-[40%]">
              <p className="type-caps text-nybb-ink/65 font-mono-tabular">
                Error 404
              </p>
              <h1 className="font-display heading-page mt-4">
                You took a wrong turn
              </h1>
              <p className="text-nybb-ink/75 mt-5 text-base leading-relaxed">
                That page is not here. The wings are, though. Nine flavours,
                five levels of hotness, and nine branches across Cebu to collect
                from.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/menu" tone="light">
                  See the menu
                </ButtonLink>
                <ButtonLink href="/" tone="light" variant="secondary">
                  Back to the start
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Flush, because the section above ends on a drawing that has to run
          into the chrome rather than stop 80px short of it. The section owns
          the gutter that buys back instead, so nothing below `lg` moves. */}
      <Footer flush />
    </>
  );
}
