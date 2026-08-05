import { optionPriceCents } from "@/lib/catalog/pricing";
import type { MenuItem, MenuOption, MenuOptionGroup } from "./types";

/**
 * What one configured line costs, and whether it is a legal thing to order.
 *
 * This is the display side of the same arithmetic `place_order` will do in
 * Postgres. It exists so the configurator can price a selection live, and it
 * is deliberately the only place in the UI that adds money up: a second
 * implementation is how a cart total and an order total start disagreeing.
 *
 * It is not authoritative and must never become so. From Phase 1 the client
 * sends item, variation and option ids, and the server resolves every peso
 * from the database inside a SECURITY DEFINER function. If this file and
 * `place_order` ever disagree, the server is right and this is the bug.
 */

export type LineSelection = {
  variationSlug: string;
  /** Chosen option slugs, keyed by their group. */
  optionSlugs: Record<string, string[]>;
  quantity: number;
};

export const MIN_QUANTITY = 1;
/**
 * A soft ceiling on one line, not a stock rule. It stops a stray keypress
 * turning into a two hundred wing order that a fifteen minute pickup slot
 * cannot absorb; real capacity lives in pickup_slots.
 */
export const MAX_QUANTITY = 20;

export function findVariation(item: MenuItem, variationSlug: string) {
  return item.variations.find((variation) => variation.slug === variationSlug);
}

/** Every option the selection names, in menu order, with its group. */
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

/** What the options add, resolved against the chosen size. */
export function optionsTotalCents(
  item: MenuItem,
  selection: Pick<LineSelection, "variationSlug" | "optionSlugs">,
): number {
  return selectedOptions(item, selection.optionSlugs).reduce(
    (total, { option }) => total + optionPriceCents(option, selection.variationSlug),
    0,
  );
}

/** One of this line, before quantity. */
export function unitPriceCents(
  item: MenuItem,
  selection: Pick<LineSelection, "variationSlug" | "optionSlugs">,
): number {
  const variation = findVariation(item, selection.variationSlug);
  if (!variation) {
    // A missing variation is a bug, not a free item. Callers show a price, so
    // returning 0 would put "0" on screen next to a real product.
    throw new Error(`${item.slug}: no variation ${selection.variationSlug}`);
  }

  return variation.priceCents + optionsTotalCents(item, selection);
}

export function lineTotalCents(item: MenuItem, selection: LineSelection): number {
  const quantity = Math.min(Math.max(Math.trunc(selection.quantity), MIN_QUANTITY), MAX_QUANTITY);
  return unitPriceCents(item, selection) * quantity;
}

/**
 * Why a selection cannot be ordered yet, or null when it can.
 *
 * Returns the first unmet group rather than a boolean, so the screen can say
 * "Pick a flavour" instead of greying a button out with no explanation.
 */
export function selectionProblem(
  item: MenuItem,
  selection: Pick<LineSelection, "variationSlug" | "optionSlugs">,
): { group: MenuOptionGroup; reason: "too_few" | "too_many" } | null {
  if (!findVariation(item, selection.variationSlug)) {
    return null;
  }

  for (const group of item.optionGroups) {
    const chosen = (selection.optionSlugs[group.slug] ?? []).filter((slug) =>
      group.options.some((option) => option.slug === slug),
    );

    if (chosen.length < group.minSelect) return { group, reason: "too_few" };
    if (chosen.length > group.maxSelect) return { group, reason: "too_many" };
  }

  return null;
}

/**
 * The selection a configurator opens on.
 *
 * The cheapest variation, and every required single-choice group pre-filled
 * with its first option. A required group left empty would open the screen in
 * an invalid state, which reads as the page being broken rather than as a
 * choice being needed.
 */
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
 * Apply a click on an option, honouring the group's own limits.
 *
 * A single-choice group replaces. A multi-choice group toggles, and refuses to
 * exceed maxSelect rather than silently dropping the oldest choice, because a
 * selection disappearing on its own is worse than a click doing nothing.
 * Deselecting the last option of a required group is refused for the same
 * reason.
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
