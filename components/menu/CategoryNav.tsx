import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The category rail.
 *
 * Horizontally swipeable with scroll snapping, because on a 375px phone the ten
 * categories cannot all be reachable at once and a wrapped stack of pills eats
 * a third of the first screen. Sticky under the header so the customer never
 * loses their place in a long menu.
 *
 * `activeSlug` marks the current category page. On /menu nothing is active and
 * every entry is a jump link to its section.
 */
export function CategoryNav({
  categories,
  activeSlug,
  hrefFor,
}: {
  /** Passed in, so the rail follows whatever source the page rendered from. */
  categories: { slug: string; name: string }[];
  activeSlug?: string;
  hrefFor: (slug: string) => string;
}) {
  return (
    <nav
      aria-label="Menu categories"
      className="border-border bg-nybb-ink/90 text-nybb-bone sticky top-18 z-40 border-b backdrop-blur-md sm:top-22"
    >
      <ul className="mx-auto flex max-w-6xl snap-x snap-mandatory gap-1 overflow-x-auto px-3 py-2 sm:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((category) => (
          <li key={category.slug} className="snap-start">
            <Link
              href={hrefFor(category.slug)}
              aria-current={activeSlug === category.slug ? "page" : undefined}
              className={cn(
                "font-display block rounded px-3 py-2 text-xs tracking-[0.06em] whitespace-nowrap transition-colors",
                activeSlug === category.slug
                  ? "bg-nybb-orange text-nybb-ink"
                  : "text-nybb-bone/70 hover:text-nybb-bone hover:bg-nybb-graphite",
              )}
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
