import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ItemConfigurator } from "@/components/menu/ItemConfigurator";
import { TextLink } from "@/components/ui/TextLink";
import { getStoreSelection, selectedBranchSlug } from "@/lib/branches/selection";
import { itemPriceRange } from "@/lib/catalog/pricing";
import { onlineOrderingOpen } from "@/lib/checkout/payment-settings";
import { formatPesoRange } from "@/lib/format";
import { findCategory, getStorefrontMenu } from "@/lib/menu";
import type { MenuItem } from "@/lib/menu/types";

type Params = { category: string; item: string };

/**
 * No branch slug here, and that is not an oversight.
 *
 * This runs during `next build`, where there is no customer, no cookie and no
 * request to read one from. Its job is to enumerate the items that exist, not
 * the ones one counter can serve today, so it asks the way the database
 * answers with nobody chosen.
 */
export async function generateStaticParams(): Promise<Params[]> {
  const { categories } = await getStorefrontMenu();
  return categories.flatMap((category) =>
    category.items.map((item) => ({ category: category.slug, item: item.slug })),
  );
}

/**
 * An unknown slug renders on demand rather than 404ing at the edge, because the
 * menu is owner editable from the Workspace and an item created there would
 * otherwise be unreachable until the next deploy. generateStaticParams still
 * prerenders every item that exists at build. A slug that is genuinely not an
 * item still 404s, through the notFound() below.
 */
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { category: categorySlug, item: itemSlug } = await params;
  // The customer's counter, here too. An item held at the branch they chose is
  // absent from this read, and an item held somewhere else is present: a title
  // taken from a menu read against the wrong branch is either missing for a
  // page that renders or present for a page that 404s. The selection is
  // memoised per request, so this and the page body share one answer.
  const { categories } = await getStorefrontMenu(await selectedBranchSlug());
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
  // Two sequential reads, and they cannot be one Promise.all: the counter has
  // to be known before there is a menu to ask for. That is the cost of this
  // page 404ing on an item the chosen branch has held, rather than selling one
  // the till will refuse. The read is memoised for the request, so the store
  // selection ConfiguratorWithOrdering asks for below is already resolved.
  const { categories } = await getStorefrontMenu(await selectedBranchSlug());

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
        <ConfiguratorWithOrdering
          item={item}
          details={
            <>
              <h1 className="font-display heading-minor mt-6">
                {item.code ? (
                  <span className="font-mono-tabular text-nybb-ink/75 mr-3 text-base">
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
                <p className="border-nybb-ink/25 text-nybb-ink/75 mt-5 max-w-prose rounded-md border border-dashed p-3 text-xs leading-relaxed">
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

/**
 * The live ordering answer, resolved inside the page's existing Suspense
 * boundary, so the read stays scoped to the fragment that needs it.
 *
 * Reading the payment rails at the top level would block the whole page shell
 * on a request the rest of the page does not need, to render one sentence, so
 * the sentence waits here and streams in behind the fallback instead.
 */
async function ConfiguratorWithOrdering({
  item,
  details,
}: {
  item: MenuItem;
  details: React.ReactNode;
}) {
  const [selection, orderingOpen] = await Promise.all([
    getStoreSelection(),
    onlineOrderingOpen(),
  ]);
  // Both halves, the same test every other screen in this flow applies.
  const canOrder = orderingOpen && selection.stores.some((store) => store.orderable);

  return <ItemConfigurator item={item} details={details} canOrder={canOrder} />;
}
