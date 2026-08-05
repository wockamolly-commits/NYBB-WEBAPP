import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryNav } from "@/components/menu/CategoryNav";
import { FlavourGrid } from "@/components/menu/FlavourGrid";
import { HeatMeter } from "@/components/menu/HeatMeter";
import { ProductTile } from "@/components/menu/ProductTile";
import { categories, findCategory, optionPriceCents } from "@/lib/catalog";
import { wingHeat } from "@/lib/catalog/menu";
import { formatPeso, formatPesoCompact } from "@/lib/format";

type Params = { category: string };

export function generateStaticParams(): Params[] {
  return categories.map((category) => ({ category: category.slug }));
}

/** Nothing outside the catalog is a category, so an unknown slug is a 404. */
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const category = findCategory(slug);
  if (!category) return {};

  return { title: category.name, description: category.blurb };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { category: slug } = await params;
  const category = findCategory(slug);
  if (!category) notFound();

  const isWings = category.slug === "chicken-wings";
  const heatLevels = wingHeat.options.filter((option) => (option.heatPercent ?? 0) > 0);
  const priced = category.items.filter((item) => item.variations.length > 1);

  return (
    <>
      <CategoryNav activeSlug={category.slug} hrefFor={(next) => `/menu/${next}`} />

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="font-display text-[clamp(2.5rem,9vw,5rem)] leading-[0.88]">
          {category.name}
        </h1>
        <p className="text-nybb-ink/70 mt-4 max-w-lg text-base leading-relaxed">
          {category.blurb}
        </p>

        <div className="mt-9 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
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
            <h2 className="font-display mt-16 text-[clamp(1.75rem,5vw,2.75rem)] leading-none">
              Pick a flavour
            </h2>
            <FlavourGrid className="mt-6" />

            <h2 className="font-display mt-16 text-[clamp(1.75rem,5vw,2.75rem)] leading-none">
              Then pick a level
            </h2>
            <p className="text-nybb-ink/60 mt-2 max-w-lg text-sm">
              The level is an add-on, and it is priced against the size you
              chose. A full order carries more sauce, so it costs more to bring
              the heat.
            </p>

            {/* Wide content scrolls inside its own container. The page body
                never scrolls sideways. */}
            <div className="mt-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-nybb-ink/50 text-left">
                    <th scope="col" className="border-border border-b py-2.5 pr-4 font-normal">
                      Level
                    </th>
                    <th scope="col" className="border-border border-b py-2.5 pr-4 font-normal">
                      Heat
                    </th>
                    <th scope="col" className="border-border border-b py-2.5 pr-4 text-right font-normal">
                      Half, 6 pcs
                    </th>
                    <th scope="col" className="border-border border-b py-2.5 text-right font-normal">
                      Full, 10 pcs
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {heatLevels.map((level) => (
                    <tr key={level.slug}>
                      <th
                        scope="row"
                        className="border-border font-display border-b py-3 pr-4 text-left text-base font-normal"
                      >
                        {level.name}
                      </th>
                      <td className="border-border border-b py-3 pr-4">
                        <HeatMeter percent={level.heatPercent ?? 0} size="sm" />
                      </td>
                      <td className="border-border font-mono-tabular text-nybb-orange border-b py-3 pr-4 text-right">
                        +{formatPesoCompact(optionPriceCents(level, "half"))}
                      </td>
                      <td className="border-border font-mono-tabular text-nybb-orange border-b py-3 text-right">
                        +{formatPesoCompact(optionPriceCents(level, "full"))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {priced.length > 0 ? (
          <>
            <h2 className="font-display mt-16 text-[clamp(1.75rem,5vw,2.75rem)] leading-none">
              Sizes
            </h2>
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
