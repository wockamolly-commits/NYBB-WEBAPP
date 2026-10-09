import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { FooterDoodles } from "@/components/site/FooterDoodles";
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

/**
 * The Company column.
 *
 * Promos first: the navbar carries it at every width, and this is the second
 * way back to it for somebody who has scrolled to the bottom of a long page.
 *
 * One franchise route, not two. /franchise carries the inquiry form and the
 * franchise mailbox for people who would rather write than fill in a form, so
 * a footer mailto beside it only opened a mail client nobody asked for.
 */
const company = [
  { href: "/promos", label: "Promos" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/franchise", label: "Franchise" },
];

/**
 * The two brand glyphs, drawn here because lucide no longer ships brand marks.
 * Instagram is the outline camera, which is how the platform draws its own
 * glyph at small sizes. TikTok is the note, filled, because an outlined note
 * loses its offset shadow shape and stops being recognisable.
 */
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M16.6 2h-3.3v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.2a6.3 6.3 0 1 0 5.3 6.2V8.6a8 8 0 0 0 4.4 1.4V6.7a4.6 4.6 0 0 1-4.4-4.7Z" />
    </svg>
  );
}

const socials = [
  // Only Hot Wings channels. The live site's footer still links
  // @ny.bbsportslounge and the Sports Lounge Facebook page, both of which now
  // point at a restaurant that closed in August 2026.
  {
    href: "https://www.instagram.com/nybuffalobrads/",
    label: "Instagram",
    handle: "@nybuffalobrads",
    Icon: InstagramIcon,
  },
  {
    href: "https://www.tiktok.com/@nybbhotwings",
    label: "TikTok",
    handle: "@nybbhotwings",
    Icon: TikTokIcon,
  },
];

/**
 * A column heading with the heat scale under it.
 *
 * The five swatches are the same five the heat rule on the footer's top edge
 * runs, at a size that marks the column rather than divides the page. They are
 * the one piece of colour in the link block, and orange can be a graphic here
 * where it cannot be type.
 */
function FooterHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display type-caps text-nybb-ink">
      {children}
      <span aria-hidden="true" className="mt-2.5 flex h-[3px] w-8 overflow-hidden rounded-full">
        <span className="bg-nybb-heat-1 flex-1" />
        <span className="bg-nybb-heat-2 flex-1" />
        <span className="bg-nybb-heat-3 flex-1" />
        <span className="bg-nybb-heat-4 flex-1" />
        <span className="bg-nybb-heat-5 flex-1" />
      </span>
    </h2>
  );
}

/**
 * A footer link. Hover darkens the text and draws an orange rule in from the
 * left. The rule is a scaled pseudo element, so the effect is transform only
 * and nothing reflows; keyboard focus draws the same rule beside the outline.
 */
function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group text-nybb-ink/70 hover:text-nybb-ink focus-visible:text-nybb-ink relative inline-flex min-h-11 items-center text-base sm:text-sm transition-colors"
    >
      {children}
      <span
        aria-hidden="true"
        className="bg-nybb-orange absolute inset-x-0 bottom-2.5 h-0.5 origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 group-focus-visible:scale-x-100 motion-reduce:transition-none"
      />
    </Link>
  );
}

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
        <FooterDoodles />

        <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 sm:pt-16">
          <div className="grid gap-y-12 lg:grid-cols-12 lg:gap-x-12">
            <div className="lg:col-span-5">
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

            {/* The three link columns, as one block.
                ================================================================
                Follow used to sit under Company, which made the right column
                twice the height of the middle one and left the footer looking
                unfinished at the bottom right. Its own column gives three
                columns of descending length, longest first, which reads as a
                deliberate stair rather than a ragged edge.

                Every row is 2.75rem whether it is a link or not, so the first
                branch, Promos and the icons sit on one line across the block
                and the lists keep a shared rhythm. That is also the system's
                minimum target height, which the old 1.875rem rows were under.

                On a phone Branches takes the full width, because "Shell Cebu
                Country Club" cannot share a row with anything at 320px, and
                Company and Follow pair up beneath it. The block only moves
                beside the wordmark from `lg`: at tablet width four columns left
                Branches about 120px, and every Shell name broke over two
                lines. */}
            <nav
              aria-label="Footer"
              className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-[1.4fr_1fr_auto] sm:gap-x-10 lg:col-span-7"
            >
              <div className="col-span-2 sm:col-span-1">
                <FooterHeading>Branches</FooterHeading>
                <ul className="mt-3">
                  {branches.slice(0, 5).map((branch) => (
                    <li
                      key={branch.slug}
                      className="text-nybb-ink/70 flex min-h-11 items-center py-2 text-base sm:text-sm leading-snug"
                    >
                      {branch.shortName}
                    </li>
                  ))}
                  <li>
                    <Link
                      href="/contact"
                      className="text-nybb-ink decoration-nybb-orange hover:decoration-nybb-ink inline-flex min-h-11 items-center text-base sm:text-sm font-medium underline decoration-2 underline-offset-[6px] transition-colors"
                    >
                      All {branchCount} branches
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <FooterHeading>Company</FooterHeading>
                <ul className="mt-3">
                  {company.map((link) => (
                    <li key={link.href}>
                      <FooterLink href={link.href}>{link.label}</FooterLink>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <FooterHeading>Follow</FooterHeading>
                <ul className="mt-3 flex gap-3 pt-0.5">
                  {socials.map((social) => (
                    <li key={social.href}>
                      <a
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${social.label}, ${social.handle} (opens in a new tab)`}
                        title={`${social.label} ${social.handle}`}
                        className="border-nybb-ink/25 text-nybb-ink/80 hover:border-nybb-ink hover:bg-nybb-ink hover:text-nybb-cream flex size-11 items-center justify-center rounded-full border transition-[translate,background-color,color,border-color] duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                      >
                        <social.Icon className="size-5" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>
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
