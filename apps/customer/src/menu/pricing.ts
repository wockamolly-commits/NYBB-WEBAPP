import type { MenuItem, MenuOption, MenuOptionGroup } from "../api/types";

/**
 * What a configured line looks like on screen, before the server prices it.
 *
 * This is the phone's copy of `lib/menu/line-pricing.ts` and `lib/catalog/
 * pricing.ts`, and it exists for one reason: a customer choosing between a HALF
 * and a FULL needs to see the difference while they choose. It is display
 * arithmetic and nothing else.
 *
 * IF THIS FILE AND THE DATABASE EVER DISAGREE, THE DATABASE IS RIGHT.
 * ================================================================
 * The order request carries slugs and quantities, so the worst a bug here can
 * do is show a number that the order confirmation then contradicts. It cannot
 * charge anybody the wrong amount. Every screen that shows a figure from this
 * file says it is a preview until a real order exists, and from that point the
 * app shows the server's totals instead.
 *
 * The resolution order below is the same one `resolve_option_price_cents()`
 * uses in Postgres: a variation-specific price, then the option's flat price,
 * then free. NYBB prices its heat levels per wing size, which is exactly the
 * case a flat option delta cannot express.
 */

export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 20;

export type LineSelection = {
  variationSlug: string;
  /** Chosen option slugs, keyed by their group. */
  optionSlugs: Record<string, string[]>;
  quantity: number;
};

export function optionPriceCents(option: MenuOption, variationSlug: string | null): number {
  if (variationSlug && option.variationPriceCents) {
    const specific = option.variationPriceCents[variationSlug];
    if (specific !== undefined) return specific;
  }
  return option.priceCents ?? 0;
}

export function findVariation(item: MenuItem, variationSlug: string) {
  return item.variations.find((variation) => variation.slug === variationSlug);
}

export function selectedOptions(
  item: MenuItem,
  optionSlugs: Record<string, string[]>,
): { group: MenuOptionGroup; option: MenuOption }[] {
  return item.optionGroups.flatMap((group) =>
    (optionSlugs[group.slug] ?? []).flatMap((slug) => {
      const option = group.options.find((candidate) => candidate.slug === slug);
      return option ? [{ group, option }] : [];
    }),
  );
}

export function optionsTotalCents(
  item: MenuItem,
  selection: Pick<LineSelection, "variationSlug" | "optionSlugs">,
): number {
  return selectedOptions(item, selection.optionSlugs).reduce(
    (total, { option }) => total + optionPriceCents(option, selection.variationSlug),
    0,
  );
}

/**
 * One of this line, before quantity.
 *
 * Returns null rather than zero when the variation is unknown. A missing
 * variation is a stale menu or a bug, and putting "PHP 0.00" beside a real
 * product is the one wrong answer that looks like a right one.
 */
export function unitPreviewCents(
  item: MenuItem,
  selection: Pick<LineSelection, "variationSlug" | "optionSlugs">,
): number | null {
  const variation = findVariation(item, selection.variationSlug);
  if (!variation) return null;
  return variation.priceCents + optionsTotalCents(item, selection);
}

export function itemPriceRange(item: MenuItem): { fromCents: number; toCents: number } {
  const prices = item.variations.map((variation) => variation.priceCents);
  return { fromCents: Math.min(...prices), toCents: Math.max(...prices) };
}

/**
 * Why this selection cannot be added yet, or null when it can.
 *
 * The unmet group rather than a boolean, so the button can say "Pick a flavour"
 * instead of greying itself out with no explanation.
 */
export function selectionProblem(
  item: MenuItem,
  selection: Pick<LineSelection, "variationSlug" | "optionSlugs">,
): { group: MenuOptionGroup; reason: "too_few" | "too_many" } | null {
  if (!findVariation(item, selection.variationSlug)) return null;

  for (const group of item.optionGroups) {
    const chosen = (selection.optionSlugs[group.slug] ?? []).filter((slug) =>
      group.options.some((option) => option.slug === slug),
    );
    if (chosen.length < group.minSelect) return { group, reason: "too_few" };
    if (chosen.length > group.maxSelect) return { group, reason: "too_many" };
  }

  return null;
}

/** The cheapest variation, with every required single-choice group pre-filled. */
export function defaultSelection(item: MenuItem): LineSelection {
  const cheapest = item.variations.reduce((best, variation) =>
    variation.priceCents < best.priceCents ? variation : best,
  );

  const optionSlugs: Record<string, string[]> = {};
  for (const group of item.optionGroups) {
    optionSlugs[group.slug] =
      group.minSelect > 0 && group.options.length > 0 ? [group.options[0].slug] : [];
  }

  return { variationSlug: cheapest.slug, optionSlugs, quantity: MIN_QUANTITY };
}

/**
 * Apply a tap on an option, honouring the group's own limits.
 *
 * A single-choice group replaces. A multi-choice group toggles and refuses to
 * exceed `maxSelect` rather than silently dropping the oldest choice, because a
 * selection disappearing on its own is worse than a tap doing nothing.
 */
export function toggleOption(
  group: MenuOptionGroup,
  current: string[],
  optionSlug: string,
): string[] {
  const isSelected = current.includes(optionSlug);

  if (group.maxSelect === 1) {
    if (isSelected && group.minSelect > 0) return current;
    return isSelected ? [] : [optionSlug];
  }

  if (isSelected) {
    const next = current.filter((slug) => slug !== optionSlug);
    return next.length < group.minSelect ? current : next;
  }

  if (current.length >= group.maxSelect) return current;
  return [...current, optionSlug];
}
