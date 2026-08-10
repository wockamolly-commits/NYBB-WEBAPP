import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { MuralArt } from "@/components/mural/MuralArt";
import { HeatRule } from "@/components/site/HeatRule";
import { branches } from "@/lib/catalog";
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

export function Footer({ flush = false }: { flush?: boolean }) {
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
                  All {branches.length} branches
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-display type-caps text-nybb-ink">Company</h2>
            <ul className="mt-5 space-y-2.5 text-sm">
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
              <li>
                <a
                  href="mailto:franchise@5bdf.ph"
                  className="text-nybb-ink/70 hover:text-nybb-ink transition-colors"
                >
                  Franchise enquiries
                </a>
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

          {/* The skyline off the packaging, traced from the printed cup.
              Decoration: the wordmark already names the company.

              WHY IT IS DOWN HERE AND NOT ON THE TOP EDGE. The heat rule owns
              that edge and keeps it. Its stated job is to bracket the page in
              the brand's own scale and tie the navbar and the footer together
              as one material, and moving it to make room would trade a
              structural job for a decorative one. Stacking both on one edge was
              the other option and it is worse than either alone.

              WHY RIGHT ALIGNED, AND WHY ITS FEET ARE ON THE PLINTH. It was in
              the brand column first, under the wordmark, and it was wrong
              there: the two link columns are short, so the footer carried a
              tall drawing bottom left and a large hole bottom right. Moved
              across, it fills that hole and balances the wordmark diagonally.
              The container has no bottom padding under it on purpose, so the
              buildings stand directly on the legal plinth. That is what turns
              it from a picture floating in a footer into the ground the page
              ends on.

              It is an emblem rather than a band because of what it is: this
              artwork wraps a cup and is centred on the Liberty figure, roughly
              1.28:1. Stretched full width it would stand four hundred pixels
              tall. */}
        </div>

        {/* The city the page ends on.
            ================================================================
            Two drawings on one baseline, and they are one object: plain
            buildings running the full width of the viewport, with the
            packaging's landmarks rising at the right where the columns end.

            WHY IT TAKES TWO FILES. The packaging skyline wraps a cup and is
            centred on the Liberty figure, so it is a compact emblem at roughly
            1.28:1. Stretched across a footer it would stand four hundred pixels
            tall, and repeating it to fill the width puts four Statues of
            Liberty in a row. The width is therefore carried by the designer's
            own traced outline, which is 15:1 and was drawn for exactly this
            job, filled at trace time so it matches the packaging's weight
            rather than reading as a hairline beside a solid.

            WHY IT IS DOWN HERE AND NOT ON THE TOP EDGE. The heat rule owns that
            edge and keeps it: bracketing the page in the brand's own scale is a
            structural job, and moving it to make room for this would trade it
            for a decorative one. Stacking both on one edge was the other option
            and is worse than either alone.

            Full bleed rather than inside the container, because a horizon that
            stops short of the window is a picture of a horizon. The emblem
            stays on the container's right rail so it lands under the last
            column instead of floating off in the margin. Nothing below it: the
            buildings stand directly on the legal plinth, which is what makes
            this the ground the page ends on rather than a graphic sitting near
            the bottom. */}
        <div aria-hidden="true" className="relative mt-10">
          <div className="mx-auto flex max-w-6xl justify-end px-4 sm:px-6">
            <MuralArt
              motif="skyline"
              className="text-nybb-ink w-[10rem] sm:w-[14rem]"
            />
          </div>
          {/* No height: the aspect ratio sets it from the width, so the band is
              a true horizon at every viewport instead of a stretched one.

              WHY `cover` AND NOT `contain`, WHICH LEFT A HOLE IN THE HORIZON.
              ================================================================
              The element already carries the file's own ratio, so on paper the
              two fit identically and `contain` was the obvious default. It is
              not identical in practice. `contain` fits the drawing inside the
              box, the box height is `width * 102 / 1560` and lands on a
              fraction, and the mask then fits to whichever axis rounds shorter.
              When that is the height, the drawing is laid down a few pixels
              narrower than the element, and since it is pinned `left bottom`
              the whole shortfall opens as bare parchment on the right, with the
              solid baseline strip stopping dead in mid air. Measured across
              eleven viewport widths it ran to 11px at 1280 and was never
              stable: 5px at 1152, 2px at 1440, 0px at 1024, and at 768 the
              drawing sat 2px in from both edges because the SVG's own
              `preserveAspectRatio` centres the remainder.

              `cover` fits to the axis that rounds longer, so the width is
              always covered and the overflow, sub-pixel in every case, goes
              off the top of the box where the drawing is empty sky. Same
              intent, no gap at any width. `100% 100%` also holds, and is not
              used because it would stretch the horizon rather than scale it if
              the ratio ever drifted. */}
          <MuralArt
            motif="skyline-band"
            fit="cover"
            position="left bottom"
            className="text-nybb-ink absolute inset-x-0 bottom-0 w-full"
          />
        </div>
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
