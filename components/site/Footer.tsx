import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { HeatRule } from "@/components/site/HeatRule";
import { branches } from "@/lib/catalog";
import { SKYLINE_OUTLINE } from "@/lib/mural/skyline-outline";
import { cn } from "@/lib/utils";

/**
 * The footer.
 *
 * The warmth here is light spilling up from below the page rather than a panel
 * of colour, so the ground never changes under the type.
 *
 * WHY THIS IS LIGHT, AND WHY IT IS PARCHMENT. The wordmark's "NEW YORK" line
 * is solid black with no outline, so on the ink footer this used to be it was
 * black on black and the brand's own city was invisible. Contrast against
 * black comes only from lightness, so the surface had to go light.
 *
 * Three attempts got here, and each failed on something worth recording:
 *
 *   A yellow-to-orange gradient with the wordmark knocked out to solid ink.
 *   The wordmark cannot be flattened to one colour: it is layered strokes with
 *   an outline, so brightness(0) merges the layers and "BUFFALO BRAD'S"
 *   becomes an unreadable blob.
 *
 *   An ink ground, on the belief that the mark was drawn for a dark one. True
 *   of the artwork, false of the file. BUFFALO and BRAD'S are orange and
 *   yellow inside heavy black outlines and hold up anywhere; the "NEW YORK"
 *   line above them has no outline at all. The mark is a light-ground mark.
 *
 *   Flat bone. Legible, but at 95% lightness and almost no chroma it read as
 *   a sheet of paper laid over the site, and with the navbar doing the same
 *   thing the page looked like warm content between two white blocks.
 *
 * So the ground is `.surface-chrome`, shared with the navbar: cream falling to
 * parchment on the same warm hue as the page's amber gradient. Even at the
 * deepest stop the black line measures better than 15:1.
 *
 * Orange cannot appear as text here: on parchment it measures 2.6:1. The
 * column headings are full ink and the one accent link is ink with an
 * underline, which is the link rule the amber ground already uses.
 *
 * The bloom is two radial gradients whose centres sit below the footer, at
 * 128% and 122%, so only the top arc of each is visible. That is what makes it
 * read as spill rather than as a shape: there is no edge anywhere on screen.
 * Orange on the left and red on the right are heat stops 3 and 5, so even the
 * glow quotes the Level of Hotness scale rather than inventing a palette.
 * Their alphas are tuned to the ground: 62% and 45% on the old ink version,
 * then 24% and 14% on bone which turned out to be invisible, now 34% and 18%
 * on parchment. Both centres sit below the footer, so the arcs fade out under
 * the wordmark and leave it on the clean top of the gradient.
 */

const socials = [
  // Only Hot Wings channels. The live site's footer still links
  // @ny.bbsportslounge and the Sports Lounge Facebook page, both of which now
  // point at a restaurant that closed in August 2026.
  { href: "https://www.instagram.com/nybuffalobrads/", label: "Instagram" },
  { href: "https://www.tiktok.com/@nybbhotwings", label: "TikTok" },
];

/**
 * Grain, at 3.5%.
 *
 * Not texture for its own sake. A wide, soft radial fading out bands visibly
 * on an 8-bit panel, and dithering it with noise is the standard fix. Overlay
 * rather than multiply, because multiplied noise on a light ground reads as
 * dirt. If the bloom ever gets smaller or harder, this can go.
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function Footer({
  flush = false,
  branchCount = branches.length,
}: {
  flush?: boolean;
  /**
   * Every branch, including any added from the workspace. The storefront
   * layout passes the database's count; the 404 page, which reads nothing,
   * falls back to the catalog's.
   */
  branchCount?: number;
}) {
  return (
    // WHY THE TOP MARGIN IS A PROP.
    // ================================================================
    // `mt-20` is not a statement about the footer, it is a statement about
    // whatever ended above it: every ordinary page finishes on copy sitting on
    // the amber ground, and copy needs air before the chrome starts. Hardcoded,
    // it silently assumed that was true everywhere, and on the 404 it is not.
    // That page ends on a full-bleed drawing whose bottom edge is supposed to
    // run off the page, so those 80px of bare amber landed directly under the
    // artwork and turned a bleed into a cut: measured, the ink was dense to the
    // last row of the section and then exactly zero for 80px. DESIGN.md's The
    // Drawing Runs Off The Page Rule is explicit that an edge left inside the
    // page is faded, never cut, and this was cutting one from the outside.
    //
    // A caller passing `flush` is saying "what is above me bleeds into you",
    // and it then owns its own bottom spacing. Default is unchanged, so every
    // existing page keeps the exact gap it had.
    <footer className={cn("surface-chrome text-nybb-ink", flush ? "mt-0" : "mt-20")}>
      <HeatRule />

      <div className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage: [
              "radial-gradient(115% 95% at 18% 128%, color-mix(in oklab, var(--color-nybb-heat-3) 34%, transparent) 0%, transparent 60%)",
              "radial-gradient(85% 75% at 76% 122%, color-mix(in oklab, var(--color-nybb-heat-5) 18%, transparent) 0%, transparent 55%)",
            ].join(", "),
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.035] mix-blend-overlay"
          style={{ backgroundImage: GRAIN }}
        />

        <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
          <div className="grid gap-x-10 gap-y-12 md:grid-cols-[1.3fr_1fr_1fr]">
            <div>
            {/* Untouched. A transparent PNG on the light ground it was drawn
                for, which is the whole reason this footer is bone. */}
            <Wordmark
              className="w-[152px] sm:w-[176px]"
              sizes="(min-width: 640px) 176px, 152px"
            />
            {/* The store's second tagline.
                ================================================================
                THE PHRASE IS NOT THE ONE THE REST OF THE SITE CARRIES, AND THAT
                IS DELIBERATE. The store has two taglines. "#Your All Time
                Favorite Chicken Wings" is the primary and stays in the hero, on
                About, and in the metadata; this is the second, and the footer is
                where it runs. Do not "fix" the mismatch by unifying them.

                WHY THIS IS TYPE HERE AND NOT THE RASTER. This slot used to hold
                TaglineMark, the delivered print master, because the footer is
                the one placement with room for the real three line composition.
                That master letters the primary phrase and only that phrase, the
                words being drawn into the pixels, and no artwork exists for this
                one.
                Relettering a drawn logo is a job for the designer who drew it,
                not for a transform, so the honest move is the one .tagline-inked
                exists for: the lockup's paint (signage yellow, black keyline,
                black offset shadow) applied to the lockup's own typeface.
                Daughter of Fortune is not a lookalike, it is the face the master
                was set in, so what this loses against the raster is the diagonal
                composition, not the lettering.

                Yellow rather than the ink the About page uses. That page sets
                the tagline inside body copy, where it takes the surface's
                colour; here it stands directly under the wordmark as the brand's
                signature, and the keyline treatment is what makes the two read
                as one lockup instead of as a logo with a caption. On this
                parchment the yellow is worth about 1.1:1 on its own, exactly as
                it is in the artwork, and the keyline carries the legibility, the
                same way it does for BUFFALO and BRAD'S above.

                The size is the pair the class documents, 1.5rem below sm and
                1.75rem from sm up, which is what the hero and About already use.
                The tagline stays one recognisable object by staying one size
                wherever it appears. */}
            <p className="font-script tagline-inked mt-4 text-2xl sm:text-[1.75rem]">
              #Wing It! #Love It
            </p>

            <p className="text-nybb-ink/70 mt-4 max-w-[34ch] text-sm leading-relaxed">
              Hot wings, burgers and hotdogs across Cebu. Order ahead, collect
              at the counter.
            </p>
          </div>

          <div>
            <h2 className="font-display type-caps text-nybb-ink">Branches</h2>
            <ul className="mt-5 space-y-2.5">
              {branches.slice(0, 5).map((branch) => (
                <li key={branch.slug} className="text-nybb-ink/70 text-sm">
                  {branch.shortName}
                </li>
              ))}
              <li>
                <Link
                  href="/contact"
                  className="text-nybb-ink decoration-nybb-ink/40 hover:decoration-nybb-ink text-sm underline underline-offset-4 transition-colors"
                >
                  All {branchCount} branches
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-display type-caps text-nybb-ink">Company</h2>
            <ul className="mt-5 space-y-2.5 text-sm">
              {/* First in the column. The navbar carries Promos too, at
                  every width; this is the second way back to it for somebody
                  who has scrolled to the bottom of a long page. */}
              <li>
                <Link
                  href="/promos"
                  className="text-nybb-ink/70 hover:text-nybb-ink transition-colors"
                >
                  Promos
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="text-nybb-ink/70 hover:text-nybb-ink transition-colors"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-nybb-ink/70 hover:text-nybb-ink transition-colors"
                >
                  Contact
                </Link>
              </li>
              {/* One franchise route, not two. /franchise carries the figures,
                  the inquiry form, and the franchise mailbox for people who
                  would rather write than fill in a form, so a footer mailto
                  beside it only opened a mail client nobody asked for. */}
              <li>
                <Link
                  href="/franchise"
                  className="text-nybb-ink/70 hover:text-nybb-ink transition-colors"
                >
                  Franchise
                </Link>
              </li>
            </ul>

            <h2 className="font-display type-caps text-nybb-ink mt-7">Follow</h2>
            <ul className="mt-5 flex gap-5 text-sm">
              {socials.map((social) => (
                <li key={social.href}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-nybb-ink/70 hover:text-nybb-ink transition-colors"
                  >
                    {social.label}
                  </a>
                </li>
              ))}
            </ul>
            </div>
          </div>
        </div>

        {/* The city the page ends on.
            ================================================================
            The designer's traced skyline, drawn as the pen line it is: one
            continuous stepped outline running the full width of the viewport.
            It replaced a filled version of the same drawing paired with the
            packaging's Liberty emblem at the right, changed on request on
            2026-10-09 to match the designer's reference exactly.

            WHY INLINE AND NOT MuralArt. A mask scales its ink with the box, so
            a line that reads at 1920px is a hairline that disappears on a
            phone. Inline, the path can carry `non-scaling-stroke`, and the
            weight is then set in screen pixels: the source's own proportion
            (5px across 3118) through the middle of the range, held between
            1.5px and 3px at the ends. The path is 3kB and the footer renders
            once per page, so inlining costs nothing that matters.

            WHY THE BOX IS THE FILE'S OWN RATIO. Height comes from the viewBox,
            so the horizon is scaled, never stretched. Below about 560px that
            would leave it under 40px tall, so a floor kicks in and `slice`
            crops the sides instead, keeping the middle of the city at a size
            the eye can still read as buildings. Centred, so the crop is even.

            WHY ITS FEET ARE ON THE PLINTH. The lowest stretches of the line are
            the ground itself, and the viewBox ends exactly where their ink
            ends, so they sit on the legal bar's top edge. Nothing below it:
            that is what makes this the ground the page ends on rather than a
            graphic floating near the bottom.

            The heat rule keeps the top edge. Bracketing the page in the
            brand's own scale is a structural job, and moving it to make room
            for this would trade it for a decorative one. */}
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox={`0 0 ${SKYLINE_OUTLINE.width} ${SKYLINE_OUTLINE.height}`}
          preserveAspectRatio="xMidYMax slice"
          className="text-nybb-ink mt-14 block h-auto min-h-10 w-full sm:mt-20"
        >
          <path
            d={SKYLINE_OUTLINE.d}
            fill="none"
            stroke="currentColor"
            strokeLinejoin="miter"
            strokeLinecap="butt"
            vectorEffect="non-scaling-stroke"
            style={{ strokeWidth: "clamp(1.5px, 0.16vw, 3px)" }}
          />
        </svg>
      </div>

      {/* The legal bar sits on flat bone below the bloom, which is what gives
          the glow somewhere to fade out to. */}
      <div className="bg-nybb-parchment-deep border-nybb-ink/12 relative border-t">
        <div className="text-nybb-ink/65 mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Five Brad Dragons Food Franchise Corporation, Cebu Business Park,
            Cebu City.
          </p>
          <p className="font-mono-tabular">Pickup only. No delivery.</p>
        </div>
      </div>
    </footer>
  );
}
