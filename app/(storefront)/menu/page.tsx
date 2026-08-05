import type { Metadata } from "next";
import Link from "next/link";
import { CategoryNav } from "@/components/menu/CategoryNav";
import { FlavourGrid } from "@/components/menu/FlavourGrid";
import { ProductTile } from "@/components/menu/ProductTile";
import { getStorefrontMenu, WING_FLAVOUR_GROUP_SLUG } from "@/lib/menu";
import { findOptionGroup } from "@/lib/menu";

export const metadata: Metadata = {
  title: "Menu",
  description:
    "Wings in nine flavours and five levels of heat, burgers, hotdogs, ribs, pasta, waffles and iced coffee. Pickup across Cebu.",
};

/**
 * The whole menu on one page, with the category rail jumping between sections.
 *
 * The menu comes from `get_storefront_menu()` when Supabase is configured and
 * from the static catalog when it is not. This page is statically generated,
 * so that call happens during `next build`: the inherited trap is that a
 * Vercel Preview scope missing NEXT_PUBLIC_SUPABASE_* would fail the build,
 * which is exactly why the reader keeps the fallback rather than throwing.
 */
export default async function MenuPage() {
  const { categories } = await getStorefrontMenu();

  return (
    <>
      <CategoryNav categories={categories} hrefFor={(slug) => `#${slug}`} />

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="font-display text-[clamp(2.5rem,9vw,5rem)] leading-[0.88]">
          The menu
        </h1>
        <p className="text-nybb-ink/70 mt-4 max-w-lg text-base leading-relaxed">
          Prices are the same at every branch. Online ordering opens soon; until
          then, call the branch you want to collect from.
        </p>

        {categories.map((category) => (
          <section
            key={category.slug}
            id={category.slug}
            className="scroll-mt-32 pt-14 sm:scroll-mt-36"
          >
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <h2 className="font-display text-[clamp(1.75rem,5vw,2.75rem)] leading-none">
                {category.name}
              </h2>
              <Link
                href={`/menu/${category.slug}`}
                className="font-display text-nybb-orange hover:text-nybb-orange-lit text-xs tracking-[0.06em] transition-colors"
              >
                Open category
              </Link>
            </div>
            <p className="text-nybb-ink/60 mt-2 text-sm">
              {category.blurb}
              {category.slug === "chicken-wings" ? (
                <span className="font-mono-tabular text-nybb-orange ml-2">
                  Half 329 / Full 529
                </span>
              ) : null}
            </p>

            {/* Wings show the flavour grid instead of a product tile. One tile
                labelled "Chicken Wings" would waste all nine flavour
                photographs, which are the best material the brand has. */}
            {category.slug === "chicken-wings" ? (
              <FlavourGrid
                flavours={
                  findOptionGroup(category.items[0], WING_FLAVOUR_GROUP_SLUG)?.options ?? []
                }
                hrefFor={(flavour) =>
                  `/menu/${category.slug}/${category.items[0].slug}?flavour=${flavour.slug}`
                }
                className="mt-6 lg:grid-cols-4"
                imageSizes="(min-width: 1024px) 24vw, (min-width: 640px) 31vw, 45vw"
              />
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                {category.items.map((item) => (
                  <ProductTile
                    key={item.slug}
                    item={item}
                    // A category with one item would otherwise strand a single
                    // small tile in a four column row.
                    className={category.items.length === 1 ? "sm:col-span-2" : undefined}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
