import "server-only";

import { createStaffClient } from "@/lib/supabase/server";
import type {
  HoldKind,
  ManagedCategory,
  ManagedItem,
  ManagedMenu,
  ManagedOption,
  ManagedOptionGroup,
  ManagedVariation,
} from "./menu-types";

/**
 * The eight rowsets this screen is built from, exactly as PostgREST returns
 * them. Kept snake_case on purpose: this is the boundary, and renaming happens
 * once, in assembleManagedMenu, where it can be tested.
 */
export type ManagedMenuRows = {
  categories: Array<{ id: string; slug: string; name: string; blurb: string | null; is_active: boolean; sort_order: number }>;
  items: Array<{ id: string; category_id: string; slug: string; name: string; code: string | null; description: string | null; image_url: string | null; is_featured: boolean; is_active: boolean; sort_order: number }>;
  variations: Array<{ id: string; item_id: string; slug: string; label: string; short_label: string; price_cents: number; is_default: boolean; is_active: boolean; sort_order: number }>;
  groups: Array<{ id: string; slug: string; name: string; description: string | null; is_active: boolean; sort_order: number }>;
  options: Array<{ id: string; group_id: string; slug: string; name: string; description: string | null; price_cents: number | null; heat_percent: number | null; image_url: string | null; is_active: boolean; sort_order: number }>;
  links: Array<{ item_id: string; group_id: string; is_required: boolean; min_select: number; max_select: number; sort_order: number }>;
  holds: Array<{ item_id: string; branch_id: string; kind: string; unavailable_until: string | null }>;
  branches: Array<{ id: string; short_name: string }>;
  /** Populated in Task 10. Every caller passes [] until then. */
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
      imageUrl: row.image_url,
      isFeatured: row.is_featured,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      variations: (variationsByItem.get(row.id) ?? []).sort(bySortOrder),
      optionLinks: (linksByItem.get(row.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
      holds: holdsByItem.get(row.id) ?? [],
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
      imageUrl: row.image_url,
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
 * No service role client and no RPC. 0022 revoked only the three write
 * privileges, so an ordinary staff session reads these tables and the RLS
 * policy on each one resolves menu:view. If a caller without that permission
 * reaches here, they get empty arrays from the database rather than an error,
 * which is why the page checks the permission too.
 *
 * Returns null when any select failed, so the page can render its designed
 * unavailable state instead of a half built tree.
 */
export async function getManagedMenu(): Promise<ManagedMenu | null> {
  const supabase = await createStaffClient();
  const [categories, items, variations, groups, options, links, holds, branches] = await Promise.all([
    supabase.from("menu_categories").select("id, slug, name, blurb, is_active, sort_order").order("sort_order").order("name"),
    supabase.from("menu_items").select("id, category_id, slug, name, code, description, image_url, is_featured, is_active, sort_order").order("sort_order").order("name"),
    supabase.from("item_variations").select("id, item_id, slug, label, short_label, price_cents, is_default, is_active, sort_order").order("sort_order"),
    supabase.from("menu_option_groups").select("id, slug, name, description, is_active, sort_order").order("sort_order").order("name"),
    supabase.from("menu_options").select("id, group_id, slug, name, description, price_cents, heat_percent, image_url, is_active, sort_order").order("sort_order"),
    supabase.from("menu_item_option_groups").select("item_id, group_id, is_required, min_select, max_select, sort_order").order("sort_order"),
    supabase.from("menu_item_branch_holds").select("item_id, branch_id, kind, unavailable_until"),
    supabase.from("branches").select("id, short_name").order("sort_order").order("short_name"),
  ]);

  const failed = [categories, items, variations, groups, options, links, holds, branches].find((result) => result.error);
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
    optionPrices: [],
  });
}
