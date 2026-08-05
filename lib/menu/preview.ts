import type { MenuImage, MenuItem, MenuOption } from "./types";

/**
 * Which photograph a configured item should be showing.
 *
 * Selecting Salted Egg and being left looking at Classic Buffalo makes the
 * screen feel like a form rather than a preview, so a chosen option's own
 * photography wins over the item's. Only groups that carry photography can
 * take over the frame, which is the same rule the configurator uses to decide
 * that a group renders as a visual grid: heat levels and dips have no picture
 * and must not blank the hero.
 *
 * Falls back to the item's own image, and to null when there is none, which is
 * the designed empty tile rather than a broken one.
 */
export function previewImage(
  item: MenuItem,
  optionSlugs: Record<string, string[]>,
): { image: MenuImage | null; option: MenuOption | null } {
  for (const group of item.optionGroups) {
    for (const slug of optionSlugs[group.slug] ?? []) {
      const option = group.options.find((candidate) => candidate.slug === slug);
      if (option?.image) return { image: option.image, option };
    }
  }

  return { image: item.image, option: null };
}
