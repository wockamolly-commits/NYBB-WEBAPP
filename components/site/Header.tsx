import Link from "next/link";
import { LayoutDashboard, UserRound } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { CartCount } from "@/components/cart/CartCount";
import { HeatRule } from "@/components/site/HeatRule";
import { storefrontIdentityLink } from "@/lib/auth/navigation";
import { getStorefrontSession } from "@/lib/auth/session";
import { getStaffProfile } from "@/lib/staff/session";

/**
 * Server component, deliberately.
 *
 * From Phase 1 this reads the customer session cookie to show the account link
 * and the cart count, and a server component that reads cookies cannot be
 * imported by a client page. Keeping it server-only now means that change is
 * additive rather than a refactor.
 *
 * WHY THIS BAR IS LIGHT, AND WHY IT IS PARCHMENT RATHER THAN PAPER.
 *
 * Light, because the wordmark's "NEW YORK" line is solid black with no
 * outline: on the ink bar this used to be it was black on black and gone.
 * Contrast against black comes only from lightness, so the surface had to go
 * light if the logo was to stay untouched.
 *
 * Parchment rather than bone, because the first light version was a flat 95%
 * neutral and read as a sheet of paper laid over the site. `.surface-chrome`
 * runs cream to parchment on the same warm hue as the page's own amber
 * gradient, so the bar reads as that ground lit from the front. The black
 * line still measures better than 15:1 at the deepest stop.
 *
 * Solid rather than translucent. A semi-transparent bar takes a tint from
 * whatever is behind it, so the logo would sit on one colour over the dark
 * hero and another over the amber page, and a logo whose ground shifts as you
 * scroll is not one that reads consistently. Dropping the backdrop-blur also
 * takes a compositing layer off a sticky element on every scroll frame.
 *
 * Orange cannot appear as text here: on parchment it measures 2.6:1. It is
 * allowed as a graphic, which is what the hover underline is.
 */

const links = [
  { href: "/menu", label: "Menu" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Branches" },
];

export async function Header() {
  const [session, staffProfile] = await Promise.all([
    getStorefrontSession(),
    getStaffProfile(),
  ]);
  const identityLink = storefrontIdentityLink({
    signedIn: Boolean(session),
    hasWorkspaceAccess: Boolean(staffProfile),
  });

  return (
    // The shadow is warm and offset, so the bar floats above the hero video
    // rather than being butted against it with a hard seam. A neutral grey
    // shadow on a warm page reads as dirt.
    <header className="surface-chrome text-nybb-ink sticky top-0 z-50 shadow-[0_12px_28px_-14px_rgba(84,46,8,0.32)]">
      {/* h-18/h-22 (72/88px), up from h-14/h-16. The bar used to be shorter
          than the logo inside it: a 104px wordmark renders 60px tall and was
          spilling out of a 56px header. These heights sit the mark with even
          margins and give the "NEW YORK" line every pixel the composition
          allows. CategoryNav's sticky offset and the menu page's scroll-mt
          follow these numbers. */}
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4 sm:h-22 sm:px-6">
        <Link
          href="/"
          className="shrink-0 transition-opacity duration-200 hover:opacity-80"
          aria-label="NYBB Hot Wings, home"
        >
          <Wordmark
            className="w-[104px] sm:w-[132px]"
            sizes="(min-width: 640px) 132px, 104px"
            priority
          />
        </Link>

        {/* The nav and the cart travel together at the right end of the bar.
            The cart is a client island: its count comes from localStorage, so
            the server cannot know it and this header stays a server component
            around it. */}
        <div className="flex items-center gap-1 sm:gap-5">
          <nav aria-label="Main">
            <ul className="flex items-center gap-2 sm:gap-7">
              {links.map((link, index) => (
              <li key={link.href} className={index === 0 ? undefined : "hidden sm:block"}>
                {/* The hover is an orange rule drawing in from the left, not a
                    colour change on the text. Orange is unreadable as type on
                    this ground but perfectly legible as a graphic, so the
                    accent stays in the brand's colour while the label itself
                    goes to full ink. Transform only, so nothing reflows. */}
                <Link
                  href={link.href}
                  className="font-display text-nybb-ink/70 hover:text-nybb-ink after:bg-nybb-orange relative inline-flex min-h-11 items-center text-xs tracking-[0.1em] transition-colors duration-200 after:absolute after:inset-x-0 after:bottom-[0.6rem] after:h-[2px] after:origin-left after:scale-x-0 after:rounded-full after:transition-transform after:duration-200 hover:after:scale-x-100 sm:text-sm"
                >
                  {link.label}
                </Link>
              </li>
              ))}
            </ul>
          </nav>

          <Link
            href={identityLink.href}
            aria-label={identityLink.accessibleLabel}
            className="text-nybb-ink/70 hover:text-nybb-ink inline-flex min-h-11 min-w-11 items-center justify-center gap-2 transition-colors"
          >
            {staffProfile ? (
              <LayoutDashboard aria-hidden className="size-5" strokeWidth={2} />
            ) : (
              <UserRound aria-hidden className="size-5" strokeWidth={2} />
            )}
            <span className="font-display hidden text-sm tracking-[0.06em] lg:inline">
              {identityLink.label}
            </span>
          </Link>
          <CartCount />
        </div>
      </div>

      <HeatRule className="h-[3px]" />
    </header>
  );
}
