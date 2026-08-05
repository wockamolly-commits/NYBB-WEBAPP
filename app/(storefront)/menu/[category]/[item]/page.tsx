import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ItemConfigurator } from "@/components/menu/ItemConfigurator";
import { TextLink } from "@/components/ui/ActionLink";
import { itemPriceRange } from "@/lib/catalog/pricing";
import { formatPesoRange } from "@/lib/format";
import { findCategory, getStorefrontMenu } from "@/lib/menu";

type Params = { category: string; item: string };

export async function generateStaticParams(): Promise<Params[]> {
  const { categories } = await getStorefrontMenu();
  return categories.flatMap((category) =>
    category.items.map((item) => ({ category: category.slug, item: item.slug })),
  );
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { category: categorySlug, item: itemSlug } = await params;
  const { categories } = await getStorefrontMenu();
  const item = findCategory(categories, categorySlug)?.items.find(
    (candidate) => candidate.slug === itemSlug,
  );
  if (!item) return {};

  const { fromCents, toCents } = itemPriceRange(item);
  return {
    title: item.name,
    description:
      item.description ??
      `${item.name} at New York Buffalo Brad's Hot Wings. From PHP ${formatPesoRange(fromCents, toCents)}.`,
  };
}

export default async function ItemPage({ params }: { params: Promise<Params> }) {
  const { category: categorySlug, item: itemSlug } = await params;
  const { categories } = await getStorefrontMenu();

  const category = findCategory(categories, categorySlug);
  const item = category?.items.find((candidate) => candidate.slug === itemSlug);
  if (!category || !item) notFound();

  const { fromCents, toCents } = itemPriceRange(item);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <TextLink href={`/menu/${category.slug}`} tone="light">
        Back to {category.name}
      </TextLink>

      {/* The configurator owns the layout, not this page.
          The photograph has to follow the selected flavour, and the selection
          lives on the client, so the preview and the controls are one
          component. Everything static below is still rendered here on the
          server and handed over as a slot. */}
      <Suspense
        fallback={
          <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="tile-orange aspect-square rounded-md" />
            <div className="bg-nybb-charcoal min-h-96 rounded-md" />
          </div>
        }
      >
        <ItemConfigurator
          item={item}
          details={
            <>
              <h1 className="font-display heading-minor mt-6">
                {item.code ? (
                  <span className="font-mono-tabular text-nybb-ink/50 mr-3 text-base">
                    {item.code}
                  </span>
                ) : null}
                {item.name}
              </h1>

              <p className="font-mono-tabular text-nybb-ink mt-2 text-lg">
                {formatPesoRange(fromCents, toCents)}
              </p>

              {item.description ? (
                <p className="text-nybb-ink/75 mt-4 max-w-prose leading-relaxed">
                  {item.description}
                </p>
              ) : null}

              {/* Surfaced, not hidden. This marks a price the printed menu
                  left ambiguous and that the catalog had to interpret, and it
                  stays visible until the owner confirms the reading. */}
              {item.pricingNote ? (
                <p className="border-nybb-ink/25 text-nybb-ink/60 mt-5 max-w-prose rounded-md border border-dashed p-3 text-xs leading-relaxed">
                  {item.pricingNote}
                </p>
              ) : null}
            </>
          }
        />
      </Suspense>
    </div>
  );
}
