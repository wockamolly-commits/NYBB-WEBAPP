import type { Metadata } from "next";
import { StoreList } from "@/components/store/StoreList";
import { ButtonLink } from "@/components/ui/Button";
import { safeReturnTo } from "@/lib/branches/href";
import { getStoreSelection } from "@/lib/branches/selection";
import { onlineOrderingOpen } from "@/lib/checkout/payment-settings";

export const metadata: Metadata = {
  title: "Choose a counter",
  description:
    "Pick the New York Buffalo Brad's counter you want to collect your pickup order from.",
};

/**
 * The first screen of the order, and the one the flow was missing.
 *
 * WHY THIS EXISTS SEPARATELY FROM /contact.
 *
 * They answer different questions and are read in different states of mind.
 * The branches page is a directory: where the shops are, what they look like,
 * what to dial. This is a decision that changes what the next four screens
 * render, because the price list, the pickup windows and the kitchen that
 * cooks the food all hang off it. Merging them would mean one page trying to
 * be a map and a form at once, and the form would lose.
 *
 * Nothing here is cached. Whether a counter can take an order is a fact about
 * this minute: the owner flips the accepting-orders switch from the workspace,
 * and a customer holding a cached list would choose a shop that has closed.
 */

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StoresPage({ searchParams }: PageProps) {
  const [selection, query, orderingOpen] = await Promise.all([
    getStoreSelection(),
    searchParams,
    onlineOrderingOpen(),
  ]);

  // Validated here rather than in the client component, because a query string
  // is a value a stranger can set and an unchecked one sent to router.push is
  // an open redirect.
  const next = safeReturnTo(query.next);
  const canOrder = orderingOpen && selection.stores.some((store) => store.orderable);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display heading-page">Where are you collecting?</h1>

      <p className="text-nybb-ink/75 mt-4 max-w-xl text-base leading-relaxed">
        {canOrder
          ? "Every order is cooked at one counter and collected there. The menu and the prices are the same at all of them, so what this changes is the kitchen, the pickup windows and how long the food takes."
          : "Every order is cooked at one counter and collected there. Online ordering is not open on this site yet, so the counter itself is the way in: here are all of them, with the number that reaches each one."}
      </p>

      {/* The dropped-counter notice belongs on this page rather than only on
          the band that sent them here, because this is where they act on it.
          A status region, not an alert: nothing has gone wrong and nothing is
          lost, a shop simply stopped taking orders. */}
      {selection.wasDropped && canOrder ? (
        <p
          role="status"
          className="border-nybb-ink/40 text-nybb-ink/85 mt-6 max-w-prose rounded-md border border-dashed p-4 leading-relaxed"
        >
          The counter you were using has stopped taking online orders, so it has
          been cleared. Your cart is untouched. Pick another counter and
          everything in it carries over.
        </p>
      ) : null}

      <StoreList
        stores={selection.stores}
        selectedSlug={selection.selected?.slug ?? null}
        next={next}
        orderingOpen={orderingOpen}
      />

      {/* Only when a counter can actually be chosen. Offering "keep browsing"
          under a list of nine shops that cannot take an order would be the
          page shrugging at the customer. */}
      {canOrder ? (
        <div className="mt-12 flex flex-wrap gap-3">
          <ButtonLink href="/menu" tone="light" variant="ghost">
            Look at the menu first
          </ButtonLink>
          <ButtonLink href="/contact" tone="light" variant="ghost">
            Addresses and phone numbers
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}
