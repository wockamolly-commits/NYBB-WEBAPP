/**
 * Price resolution, shared by the authoring catalog and the database menu.
 *
 * The parameter types here are structural rather than named on purpose. The
 * same rules have to apply to `CatalogItem` (lib/catalog, authoring) and to
 * `MenuItem` (lib/menu, runtime), and duplicating them per type is exactly how
 * the two would eventually disagree about what something costs.
 */

type PricedOption = {
  /** Null means there is no flat price and the variation decides. */
  priceCents: number | null;
  /** Variation slug to price. Takes precedence over `priceCents`. */
  variationPriceCents?: Record<string, number> | null;
};

type PricedVariation = { priceCents: number };

/**
 * Resolve what an option adds to the line, given the variation it is attached
 * to.
 *
 * The spec calls this the single most likely place for a pricing bug to hide,
 * and it is right: NYBB's Level of Hotness add-on is priced per wing size
 * (PHP 30 on a HALF, PHP 40 on a FULL, and PHP 40 / PHP 60 for INSANE), which
 * the usual flat-delta option model cannot express.
 *
 * The resolution order is the same one `resolve_option_price_cents()` uses in
 * Postgres, so the two can be tested against each other:
 *
 *   1. a variation-specific price, if one exists for this (option, variation)
 *   2. the option's flat price
 *   3. free
 *
 * This is display-side only. It never decides what a customer is charged: from
 * Phase 1 the price on a real order comes from the database inside a
 * SECURITY DEFINER function, and the client sends ids, never money.
 */
export function optionPriceCents(
  option: PricedOption,
  variationSlug: string | null,
): number {
  if (variationSlug && option.variationPriceCents) {
    const specific = option.variationPriceCents[variationSlug];
    if (specific !== undefined) return specific;
  }

  return option.priceCents ?? 0;
}

/** The cheapest and dearest a variation of this item can be, before options. */
export function itemPriceRange(item: { variations: PricedVariation[] }): {
  fromCents: number;
  toCents: number;
} {
  const prices = item.variations.map((variation) => variation.priceCents);
  return { fromCents: Math.min(...prices), toCents: Math.max(...prices) };
}

/** The variation a product page opens on: always the cheapest entry point. */
export function defaultVariation<T extends PricedVariation>(item: {
  variations: T[];
}): T {
  return item.variations.reduce((cheapest, variation) =>
    variation.priceCents < cheapest.priceCents ? variation : cheapest,
  );
}
