import type { Branch } from "@/lib/catalog/types";
import type { OrderableBranch, Store } from "./types";

/**
 * Turning "which shops exist" and "which of them can take an order" into one
 * list a customer can read.
 *
 * Pure, and in its own module so it can be tested without a database. The
 * classification below is the whole product decision of the counter picker and
 * it is easy to get subtly wrong, so it is worth pinning down in isolation
 * rather than only through a reader that needs Postgres to run.
 *
 * THE TWO SOURCES ANSWER TWO DIFFERENT QUESTIONS.
 *
 * The catalog is the published list of nine counters with their addresses and
 * phone numbers. It is fact, it does not change between requests, and it needs
 * no database. The RPC is operational truth about this minute: which of those
 * counters is live, and whether it is taking orders right now. Neither is a
 * subset of the other for long, so this is a union rather than a filter: a
 * branch row the owner adds tomorrow with no catalog entry still has to appear.
 */
export function mergeStores(
  catalog: Branch[],
  orderable: OrderableBranch[],
): Store[] {
  const bySlug = new Map(orderable.map((branch) => [branch.slug, branch]));

  const fromCatalog = catalog.map((entry) => {
    const branch = bySlug.get(entry.slug) ?? null;
    return classify({
      slug: entry.slug,
      // The database wins on any field they both carry, because the owner can
      // rename a branch from the workspace and the catalog cannot be edited
      // without a deploy.
      name: branch?.name ?? entry.name,
      shortName: branch?.shortName ?? entry.shortName,
      format: branch?.format ?? entry.format,
      addressLine: branch?.addressLine || entry.addressLine,
      city: branch?.city || entry.city,
      phones: branch?.phones.length ? branch.phones : entry.phones,
      branch,
    });
  });

  const known = new Set(catalog.map((entry) => entry.slug));
  const fromDatabase = orderable
    .filter((branch) => !known.has(branch.slug))
    .map((branch) =>
      classify({
        slug: branch.slug,
        name: branch.name,
        shortName: branch.shortName,
        format: branch.format,
        addressLine: branch.addressLine,
        city: branch.city,
        phones: branch.phones,
        branch,
      }),
    );

  const stores = [...fromCatalog, ...fromDatabase];

  // Orderable first, stable within each half. Somebody scanning for a counter
  // to collect from should not have to read past six that cannot serve them to
  // reach the one that can, and inside each half the catalog's own sort order
  // is the order the business publishes them in.
  return [
    ...stores.filter((store) => store.orderable),
    ...stores.filter((store) => !store.orderable),
  ];
}

/**
 * Whether a counter can be chosen, and if not, which of the two reasons it is.
 *
 * CLOSED IS NOT THE SAME AS SWITCHED OFF, and collapsing them is how a picker
 * ends up telling somebody a shop is shut when it is taking orders for the
 * evening. `branch_accepts_orders` includes `branch_is_open_at`, so a live
 * counter outside its opening hours reports false for both; that combination
 * means "come back later" and the store stays selectable, because its slot
 * grid may still hold windows inside the horizon. False for accepting while
 * open means the switch is off, which is a shop not taking anything today.
 */
function classify(
  base: Omit<Store, "orderable" | "blockedReason" | "closedNow">,
): Store {
  const { branch } = base;

  if (!branch) {
    return { ...base, orderable: false, blockedReason: "offline", closedNow: false };
  }
  if (!branch.acceptsOrdersNow && !branch.isOpenNow) {
    return { ...base, orderable: true, blockedReason: null, closedNow: true };
  }
  if (!branch.acceptsOrdersNow) {
    return { ...base, orderable: false, blockedReason: "not_accepting", closedNow: false };
  }
  return { ...base, orderable: true, blockedReason: null, closedNow: !branch.isOpenNow };
}
