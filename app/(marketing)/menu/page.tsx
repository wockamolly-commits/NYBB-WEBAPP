import type { Metadata } from "next";
import { CategoryNav } from "@/components/menu/CategoryNav";
import { FlavourGrid } from "@/components/menu/FlavourGrid";
import { ProductTile } from "@/components/menu/ProductTile";
import { StoreBar } from "@/components/store/StoreBar";
import { TextLink } from "@/components/ui/TextLink";
import { getStoreSelection } from "@/lib/branches/selection";
import { onlineOrderingOpen } from "@/lib/checkout/payment-settings";
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
 * from the static catalog when it is not.
 *
 * WHY THE INTRO SENTENCE IS COMPUTED RATHER THAN WRITTEN.
 *
 * It used to read "Online ordering opens soon; until then, call the branch you
 * want to collect from", which was true on the day it was typed and false in
 * whichever environment did not match it. Whether a customer can finish an
 * order is a fact two functions already know, so the page asks them instead of
 * asserting an answer that goes stale without anybody noticing.
 */
export default async function MenuPage() {
  // THE COUNTER IS RESOLVED BEFORE THE MENU, NOT ALONGSIDE IT, and checkout
  // sequences its slot read for the same reason. `get_storefront_menu` hides
  // an item held at the branch it is given, so a menu read that has not been
  // told which counter the customer chose gates on whichever branch sorts
  // first. With a second branch trading that shows one shop's availability to
  // somebody buying from another, and place_order refuses at the till what
  // this page offered.
  const selection = await getStoreSelection();

  const [{ categories }, orderingOpen] = await Promise.all([
    getStorefrontMenu(selection.selected?.slug),
    onlineOrderingOpen(),
  ]);

  // Both halves, always. A counter that can cook is worth nothing without a
  // rail that can take the money, and a rail with no live counter has nothing
  // to sell. Either one missing means no order can be completed on this site,
  // and every screen in the flow has to say the same thing about that.
  const canOrder = orderingOpen && selection.stores.some((store) => store.orderable);

  return (
    <>
      <CategoryNav categories={categories} hrefFor={(slug) => `#${slug}`} />

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="font-display heading-page">The menu</h1>
        <p className="text-nybb-ink/70 mt-4 max-w-lg text-base leading-relaxed">
          {canOrder
            ? "Prices are the same at every counter. Build the order here, then choose a pickup window at checkout."
            : "Prices are the same at every counter. Online ordering is not open yet, so call the counter you want to collect from."}
        </p>

        {/* Only where it can lead somewhere. A band naming the counter an
            order goes to, on a site that cannot complete one, is furniture
            that contradicts the sentence directly above it. */}
        {canOrder ? (
          <StoreBar selection={selection} returnTo="/menu" className="mt-8" />
        ) : null}

        {categories.map((category) => (
          <section
            key={category.slug}
            id={category.slug}
            className="scroll-mt-32 pt-14 sm:scroll-mt-36"
          >
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <h2 className="font-display heading-minor">{category.name}</h2>
              {/* Two leftovers from the black-first site, both orange on the
                  amber ground at about 1.8:1. Every other standing invitation
                  on the storefront is already a TextLink, and every other
                  price printed on this ground is ink. */}
              <TextLink href={`/menu/${category.slug}`} tone="light">
                Open category
              </TextLink>
            </div>
            <p className="text-nybb-ink/70 mt-2 text-sm">
              {category.blurb}
              {category.slug === "chicken-wings" ? (
                <span className="font-mono-tabular text-nybb-ink ml-2">
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
