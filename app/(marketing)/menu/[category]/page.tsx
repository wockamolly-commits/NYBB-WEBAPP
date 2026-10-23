import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryNav } from "@/components/menu/CategoryNav";
import { FlavourGrid } from "@/components/menu/FlavourGrid";
import { HeatSlider } from "@/components/menu/HeatSlider";
import { ProductTile } from "@/components/menu/ProductTile";
import { selectedBranchSlug } from "@/lib/branches/selection";
import { optionPriceCents } from "@/lib/catalog/pricing";
import {
  findCategory,
  findOptionGroup,
  getStorefrontMenu,
  WING_FLAVOUR_GROUP_SLUG,
  WING_HEAT_GROUP_SLUG,
} from "@/lib/menu";
import { heatStops } from "@/lib/menu/heat-slider";
import { formatPeso, formatPesoCompact } from "@/lib/format";

type Params = { category: string };

/**
 * No branch slug here, and that is not an oversight.
 *
 * This runs during `next build`, where there is no customer, no cookie and no
 * request to read one from. Its job is to enumerate the categories that exist,
 * not the ones one counter can serve today, so it asks the way the database
 * answers with nobody chosen.
 */
export async function generateStaticParams(): Promise<Params[]> {
  const { categories } = await getStorefrontMenu();
  return categories.map((category) => ({ category: category.slug }));
}

/**
 * An unknown slug renders on demand rather than 404ing at the edge, because the
 * menu is owner editable from the Workspace and a category created there would
 * otherwise be unreachable until the next deploy. generateStaticParams still
 * prerenders every category that exists at build. A slug that is genuinely not
 * a category still 404s, through the notFound() below.
 */
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  // The customer's counter, here too. A category whose every item is held at
  // the chosen branch does not come back, and a title built from a menu read
  // against a different branch would name a page that then 404s. The read is
  // memoised per request, so this and the page body below share one answer.
  const { categories } = await getStorefrontMenu(await selectedBranchSlug());
  const category = findCategory(categories, slug);
  if (!category) return {};

  return { title: category.name, description: category.blurb };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { category: slug } = await params;
  const { categories } = await getStorefrontMenu(await selectedBranchSlug());
  const category = findCategory(categories, slug);
  if (!category) notFound();

  // The heat scale is driven by the wings item's own option group rather than
  // by a module-level constant, so an owner editing the scale in Phase 4 moves
  // this page with it.
  const wings = category.items[0];
  const heatLevels = (findOptionGroup(wings, WING_HEAT_GROUP_SLUG)?.options ?? []).filter(
    (option) => (option.heatPercent ?? 0) > 0,
  );
  const isWings = heatLevels.length > 0;
  const heatSteps = heatStops(heatLevels);

  // Formatted here because pricing lives on the server and the bar that draws
  // it is a client component.
  const heatPrices: Record<string, string> = Object.fromEntries(
    heatLevels.map((option) => [
      option.slug,
      `+${formatPesoCompact(optionPriceCents(option, "half"))}`,
    ]),
  );
  const priced = category.items.filter((item) => item.variations.length > 1);

  return (
    <>
      <CategoryNav
        categories={categories}
        activeSlug={category.slug}
        hrefFor={(next) => `/menu/${next}`}
      />

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="font-display heading-page">{category.name}</h1>
        <p className="text-nybb-ink/70 mt-4 max-w-lg text-base leading-relaxed">
          {category.blurb}
        </p>

        <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {category.items.map((item, index) => (
            <ProductTile
              key={item.slug}
              item={item}
              priority={index < 4}
              className={category.items.length === 1 ? "sm:col-span-2" : undefined}
            />
          ))}
        </div>

        {isWings ? (
          <>
            <h2 className="font-display heading-minor mt-16">Pick a flavour</h2>
            <FlavourGrid
              flavours={findOptionGroup(wings, WING_FLAVOUR_GROUP_SLUG)?.options ?? []}
              hrefFor={(flavour) =>
                `/menu/${category.slug}/${wings.slug}?flavour=${flavour.slug}`
              }
              className="mt-6"
            />

            <h2 className="font-display heading-minor mt-16">Then pick a level</h2>
            <p className="text-nybb-ink/60 mt-2 max-w-lg text-sm">
              The level is an add-on on top of any flavour. Slide along the
              scale to see where each one sits.
            </p>

            {/* This replaced a four column table of Level, Heat, Half and Full.
                Heat is a flat PHP 29 at every level and on both sizes, so two
                of those columns were five identical numbers each, and the
                HeatMeter in the third set its percentage in bone: 1.8:1 on the
                amber ground, which is to say invisible. One bar states the
                scale and one readout states the price. */}
            {/* On its own dark plate, and not directly on the page.
                The ramp runs signage yellow to red, which is built for an
                ink ground: on the amber page the cold half of the scale
                washes out into the background it is drawn on. Every other
                dark surface here works the same way, so the scale gets a
                card and the card sets the reading colour for its contents.

                It also keeps this obviously a different object from the
                landing page's full bleed band: an instrument panel you
                lean into rather than a headline you scroll past. */}
            <div className="bg-nybb-ink text-nybb-bone mt-8 max-w-xl rounded-lg px-5 py-6 sm:px-7 sm:py-7">
              <HeatSlider
                stops={heatSteps}
                prices={heatPrices}
                variant="inline"
                label="Try the Level of Hotness scale"
              />
            </div>

            <p className="text-nybb-ink/55 mt-6 text-xs">
              Same upcharge on a half and on a full. Choose your level on the
              wings page.
            </p>
          </>
        ) : null}

        {priced.length > 0 ? (
          <>
            <h2 className="font-display heading-minor mt-16">Sizes</h2>
            <dl className="mt-6 space-y-6">
              {priced.map((item) => (
                <div key={item.slug}>
                  <dt className="font-display text-lg leading-none">{item.name}</dt>
                  <dd className="mt-2.5">
                    <ul className="space-y-1.5">
                      {item.variations.map((variation) => (
                        <li
                          key={variation.slug}
                          className="border-border flex items-baseline justify-between gap-4 border-b pb-1.5 text-sm"
                        >
                          <span className="text-nybb-ink/70">{variation.name}</span>
                          <span className="font-mono-tabular text-nybb-orange">
                            {formatPeso(variation.priceCents)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}
      </div>
    </>
  );
}
