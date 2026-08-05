import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

/**
 * Server component, deliberately.
 *
 * From Phase 1 this reads the customer session cookie to show the account link
 * and the cart count, and a server component that reads cookies cannot be
 * imported by a client page. Keeping it server-only now means that change is
 * additive rather than a refactor.
 */

const links = [
  { href: "/menu", label: "Menu" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Branches" },
];

export function Header() {
  return (
    <header className="border-border bg-nybb-ink/85 sticky top-0 z-50 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
        <Link href="/" className="shrink-0" aria-label="NYBB Hot Wings, home">
          <Wordmark width={104} priority />
        </Link>

        <nav aria-label="Main">
          <ul className="flex items-center gap-4 sm:gap-6">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="font-display hover:text-nybb-orange text-xs tracking-[0.08em] transition-colors sm:text-sm"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
