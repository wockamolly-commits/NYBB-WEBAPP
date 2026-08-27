import "server-only";

import { resolveMenuImage } from "@/lib/menu/resolve-image";
import { menuImageOriginalFor } from "@/lib/staff/menu-image-limits";
import { createStaffClient } from "@/lib/supabase/server";
import type {
  HoldKind,
  ManagedCategory,
  ManagedImage,
  ManagedItem,
  ManagedMenu,
  ManagedOption,
  ManagedOptionGroup,
  ManagedVariation,
} from "./menu-types";

/**
 * The nine rowsets this screen is built from, exactly as PostgREST returns
 * them. Kept snake_case on purpose: this is the boundary, and renaming happens
 * once, in assembleManagedMenu, where it can be tested.
 */
export type ManagedMenuRows = {
  categories: Array<{ id: string; slug: string; name: string; blurb: string | null; is_active: boolean; sort_order: number }>;
  items: Array<{ id: string; category_id: string; slug: string; name: string; code: string | null; description: string | null; image_url: string | null; image_source: string | null; image_width: number | null; image_height: number | null; image_blur_data_url: string | null; image_treatment: string | null; is_featured: boolean; is_active: boolean; sort_order: number }>;
  variations: Array<{ id: string; item_id: string; slug: string; label: string; short_label: string; price_cents: number; is_default: boolean; is_active: boolean; sort_order: number }>;
  groups: Array<{ id: string; slug: string; name: string; description: string | null; is_active: boolean; sort_order: number }>;
  options: Array<{ id: string; group_id: string; slug: string; name: string; description: string | null; price_cents: number | null; heat_percent: number | null; image_url: string | null; image_source: string | null; image_width: number | null; image_height: number | null; image_blur_data_url: string | null; is_active: boolean; sort_order: number }>;
  links: Array<{ item_id: string; group_id: string; is_required: boolean; min_select: number; max_select: number; sort_order: number }>;
  holds: Array<{ item_id: string; branch_id: string; kind: string; unavailable_until: string | null }>;
  branches: Array<{ id: string; short_name: string }>;
  optionPrices: Array<{ option_id: string; variation_id: string; price_cents: number }>;
};

const bySortOrder = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;

/**
 * Rows in, tree out. Pure, so the grouping is unit tested without a database.
 *
 * price_cents arrives from PostgREST as a number for bigint columns within
 * range, but Number() is applied anyway so a string can never reach a form
 * input and become "32900" + 100.
 */
export function assembleManagedMenu(rows: ManagedMenuRows): ManagedMenu {
  const branchNames = new Map(rows.branches.map((branch) => [branch.id, branch.short_name]));

  const variationsByItem = new Map<string, ManagedVariation[]>();
  // Built alongside variationsByItem rather than in a second pass over
  // rows.variations, so folding optionPrices onto the item that owns each
  // variation is a single map lookup below.
  const itemIdByVariation = new Map<string, string>();
  for (const row of rows.variations) {
    const list = variationsByItem.get(row.item_id) ?? [];
    list.push({
      id: row.id,
      slug: row.slug,
      label: row.label,
      shortLabel: row.short_label,
      priceCents: Number(row.price_cents),
      isDefault: row.is_default,
      isActive: row.is_active,
      sortOrder: row.sort_order,
    });
    variationsByItem.set(row.item_id, list);
    itemIdByVariation.set(row.id, row.item_id);
  }

  // Nested option id -> variation id -> price cents, per item. A price whose
  // variation is not on any item this menu knows about (should not happen,
  // but the map lookup guards it) is skipped rather than thrown.
  const optionPricesByItem = new Map<string, Record<string, Record<string, number>>>();
  for (const row of rows.optionPrices) {
    const itemId = itemIdByVariation.get(row.variation_id);
    if (!itemId) continue;
    const forItem = optionPricesByItem.get(itemId) ?? {};
    const forOption = forItem[row.option_id] ?? {};
    forOption[row.variation_id] = Number(row.price_cents);
    forItem[row.option_id] = forOption;
    optionPricesByItem.set(itemId, forItem);
  }

  const linksByItem = new Map<string, ManagedItem["optionLinks"]>();
  const itemsByGroup = new Map<string, string[]>();
  for (const row of rows.links) {
    const list = linksByItem.get(row.item_id) ?? [];
    list.push({
      groupId: row.group_id,
      isRequired: row.is_required,
      minSelect: row.min_select,
      maxSelect: row.max_select,
      sortOrder: row.sort_order,
    });
    linksByItem.set(row.item_id, list);

    const groupItems = itemsByGroup.get(row.group_id) ?? [];
    groupItems.push(row.item_id);
    itemsByGroup.set(row.group_id, groupItems);
  }

  const holdsByItem = new Map<string, ManagedItem["holds"]>();
  for (const row of rows.holds) {
    const list = holdsByItem.get(row.item_id) ?? [];
    list.push({
      branchId: row.branch_id,
      branchShortName: branchNames.get(row.branch_id) ?? "Another branch",
      kind: row.kind as HoldKind,
      unavailableUntil: row.unavailable_until,
    });
    holdsByItem.set(row.item_id, list);
  }

  const itemsByCategory = new Map<string, ManagedItem[]>();
  for (const row of rows.items) {
    const list = itemsByCategory.get(row.category_id) ?? [];
    list.push({
      id: row.id,
      categoryId: row.category_id,
      slug: row.slug,
      name: row.name,
      code: row.code,
      description: row.description,
      image: managedImage(row),
      isFeatured: row.is_featured,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      variations: (variationsByItem.get(row.id) ?? []).sort(bySortOrder),
      optionLinks: (linksByItem.get(row.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
      holds: holdsByItem.get(row.id) ?? [],
      optionVariationPrices: optionPricesByItem.get(row.id) ?? {},
    });
    itemsByCategory.set(row.category_id, list);
  }

  const optionsByGroup = new Map<string, ManagedOption[]>();
  for (const row of rows.options) {
    const list = optionsByGroup.get(row.group_id) ?? [];
    list.push({
      id: row.id,
      groupId: row.group_id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      // Null stays null. A null price means "priced by variation", never free.
      priceCents: row.price_cents === null ? null : Number(row.price_cents),
      heatPercent: row.heat_percent,
      image: managedImage(row),
      isActive: row.is_active,
      sortOrder: row.sort_order,
    });
    optionsByGroup.set(row.group_id, list);
  }

  const categories: ManagedCategory[] = rows.categories
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      blurb: row.blurb,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      // A category with no items still appears. It is a thing a manager has to
      // be able to rename, reorder or delete, and hiding it would strand it.
      items: (itemsByCategory.get(row.id) ?? []).sort(bySortOrder),
    }))
    .sort(bySortOrder);

  const optionGroups: ManagedOptionGroup[] = rows.groups
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      options: (optionsByGroup.get(row.id) ?? []).sort(bySortOrder),
      linkedItemIds: itemsByGroup.get(row.id) ?? [],
    }))
    .sort(bySortOrder);

  return {
    categories,
    optionGroups,
    branches: rows.branches.map((branch) => ({ id: branch.id, shortName: branch.short_name })),
  };
}

/**
 * The whole catalog for the workspace, in one round trip's worth of parallel
 * selects.
 *
 * No service role client and no RPC. 0022_staff_authorization_hardening.sql
 * recreated the read policy on each menu table (categories, items,
 * variations, option groups, options, item option groups) as
 * current_staff_has_permission('menu:view'), so an ordinary staff session
 * reads them under that gate. branches is the one exception: its policy is
 * still is_staff() with no permission check (0009_rls.sql, untouched by
 * 0022). If a caller without menu:view reaches here, the menu tables come
 * back empty rather than erroring, which is why the page checks the
 * permission too.
 *
 * Returns null when any select failed, so the page can render its designed
 * unavailable state instead of a half built tree.
 */
/**
 * The photograph this row shows, resolved the way the storefront resolves it.
 *
 * Reading image_url alone is what made the workspace report "no photo" for
 * rows the customer could plainly see a picture on: most rows carry
 * image_source and no image_url, and lib/menu/resolve-image.ts is where that
 * falls back to the committed derivative. Going through that one function is
 * the point. Only src and provenance survive into the workspace, which draws
 * one square tile and does not size against the original.
 */
function managedImage(row: {
  image_url: string | null;
  image_source: string | null;
  image_width: number | null;
  image_height: number | null;
  image_blur_data_url: string | null;
  image_treatment?: string | null;
}): ManagedImage | null {
  const resolved = resolveMenuImage({
    src: row.image_url,
    width: row.image_width,
    height: row.image_height,
    blurDataURL: row.image_blur_data_url,
    treatment: row.image_treatment ?? null,
    source: row.image_source,
  });
  if (!resolved) return null;
  return {
    src: resolved.src,
    origin: resolved.origin,
    // An uploaded row keeps its uncropped original at a path derived from the
    // tile's. An archive row's src is already the source it was cut from, so
    // it is its own editable picture. Whether the object is really there is
    // the editor's problem, not this reader's: asking Storage for every row
    // on every menu render would be a request per photograph to answer a
    // question that only matters once somebody presses a button.
    editableSrc:
      resolved.origin === "uploaded" ? menuImageOriginalFor(resolved.src) : resolved.src,
  };
}

export async function getManagedMenu(): Promise<ManagedMenu | null> {
  const supabase = await createStaffClient();
  const [categories, items, variations, groups, options, links, holds, branches, optionPrices] = await Promise.all([
    supabase.from("menu_categories").select("id, slug, name, blurb, is_active, sort_order").order("sort_order").order("name"),
    supabase.from("menu_items").select("id, category_id, slug, name, code, description, image_url, image_source, image_width, image_height, image_blur_data_url, image_treatment, is_featured, is_active, sort_order").order("sort_order").order("name"),
    supabase.from("item_variations").select("id, item_id, slug, label, short_label, price_cents, is_default, is_active, sort_order").order("sort_order"),
    supabase.from("menu_option_groups").select("id, slug, name, description, is_active, sort_order").order("sort_order").order("name"),
    supabase.from("menu_options").select("id, group_id, slug, name, description, price_cents, heat_percent, image_url, image_source, image_width, image_height, image_blur_data_url, is_active, sort_order").order("sort_order"),
    supabase.from("menu_item_option_groups").select("item_id, group_id, is_required, min_select, max_select, sort_order").order("sort_order"),
    supabase.from("menu_item_branch_holds").select("item_id, branch_id, kind, unavailable_until"),
    supabase.from("branches").select("id, short_name").order("sort_order").order("short_name"),
    supabase.from("menu_option_variation_prices").select("option_id, variation_id, price_cents"),
  ]);

  const failed = [categories, items, variations, groups, options, links, holds, branches, optionPrices].find(
    (result) => result.error,
  );
  if (failed?.error) {
    console.error("[workspace] menu read failed:", failed.error.message);
    return null;
  }

  return assembleManagedMenu({
    categories: categories.data ?? [],
    items: items.data ?? [],
    variations: variations.data ?? [],
    groups: groups.data ?? [],
    options: options.data ?? [],
    links: links.data ?? [],
    holds: holds.data ?? [],
    branches: branches.data ?? [],
    optionPrices: optionPrices.data ?? [],
  });
}
