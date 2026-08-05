import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { branches } from "@/lib/catalog";

/**
 * Only Hot Wings channels are linked here.
 *
 * The live site's footer still links @ny.bbsportslounge and the Sports Lounge
 * Facebook page. That venue closed in August 2026, so those links now point at
 * a shut restaurant. Nothing in this app carries them.
 */
const socials = [
  { href: "https://www.instagram.com/nybuffalobrads/", label: "Instagram" },
  { href: "https://www.tiktok.com/@nybbhotwings", label: "TikTok" },
];

export function Footer() {
  return (
    <footer className="border-border mt-20 border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Wordmark width={150} />
          <p className="text-nybb-bone/60 mt-4 max-w-xs text-sm leading-relaxed">
            Hot wings, burgers and dogs across Cebu. Order ahead, collect at the
            counter.
          </p>
        </div>

        <div>
          <h2 className="font-display text-nybb-orange text-xs tracking-[0.14em]">
            Branches
          </h2>
          <ul className="mt-4 space-y-2">
            {branches.slice(0, 5).map((branch) => (
              <li key={branch.slug} className="text-nybb-bone/70 text-sm">
                {branch.shortName}
              </li>
            ))}
            <li>
              <Link
                href="/contact"
                className="hover:text-nybb-orange-lit text-nybb-orange text-sm transition-colors"
              >
                All {branches.length} branches
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-display text-nybb-orange text-xs tracking-[0.14em]">
            Company
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link href="/about" className="text-nybb-bone/70 hover:text-nybb-bone transition-colors">
                About
              </Link>
            </li>
            <li>
              <Link href="/contact" className="text-nybb-bone/70 hover:text-nybb-bone transition-colors">
                Contact
              </Link>
            </li>
            <li>
              <a
                href="mailto:franchise@5bdf.ph"
                className="text-nybb-bone/70 hover:text-nybb-bone transition-colors"
              >
                Franchise enquiries
              </a>
            </li>
          </ul>

          <h2 className="font-display text-nybb-orange mt-7 text-xs tracking-[0.14em]">
            Follow
          </h2>
          <ul className="mt-4 flex gap-4 text-sm">
            {socials.map((social) => (
              <li key={social.href}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nybb-bone/70 hover:text-nybb-bone transition-colors"
                >
                  {social.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-border border-t">
        <div className="text-nybb-bone/45 mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Five Brad Dragons Food Franchise Corporation, Cebu Business Park, Cebu City.</p>
          <p className="font-mono-tabular">Pickup only. No delivery.</p>
        </div>
      </div>
    </footer>
  );
}
