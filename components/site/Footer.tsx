import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { HeatRule } from "@/components/site/HeatRule";
import { branches } from "@/lib/catalog";

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

export function Footer() {
  return (
    <footer className="surface-chrome text-nybb-ink mt-20">
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

        <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-12 px-4 pt-14 pb-20 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            {/* Untouched. A transparent PNG on the light ground it was drawn
                for, which is the whole reason this footer is bone. */}
            <Wordmark
              className="w-[152px] sm:w-[176px]"
              sizes="(min-width: 640px) 176px, 152px"
            />
            <p className="text-nybb-ink/70 mt-5 max-w-[34ch] text-sm leading-relaxed">
              Hot wings, burgers and dogs across Cebu. Order ahead, collect at
              the counter.
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
