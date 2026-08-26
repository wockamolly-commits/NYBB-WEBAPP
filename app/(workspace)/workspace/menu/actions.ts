"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { manilaWallClockIso } from "@/lib/staff/manila-dates";
import type { MenuActionState } from "@/lib/staff/menu-types";
import { getStaffProfile, hasStaffPermission } from "@/lib/staff/session";
import { createStaffClient } from "@/lib/supabase/server";

/**
 * Every menu change invalidates the same set of paths.
 *
 * revalidatePath without a "layout" type only invalidates the exact path
 * given, never a route beneath it, so each workspace editor screen for this
 * feature has to be listed here by itself. The dynamic routes, two on the
 * storefront and the item editor in here, are named as page paths, which is
 * what revalidatePath needs for a route with a parameter. Without them a
 * customer sitting on a category page keeps the old prices until the segment
 * expires.
 *
 * "/workspace/menu/items/new" is in this list because it goes stale on writes
 * that are not its own: its category picker and its option group checkboxes
 * are built from the whole catalog, so a category renamed on the categories
 * screen changes what it should offer. That is the gap Task 6 found for the
 * sub pages. It is safe to name here because nothing deletes the record that
 * route stands on; there is no record.
 *
 * "/workspace/menu/items/[id]" is deliberately NOT here, and ruling R24 is
 * why. deleteMenuEntity calls this function, and revalidating the route the
 * caller is standing on makes Next re-render it inside the action's own
 * response. For a delete that means the item page runs notFound() because the
 * item is gone, the editor unmounts, and the effect that would have sent the
 * person back to the menu never runs: they get a 404 instead. saveMenuItem
 * revalidates the one id it just wrote, by itself, where a delete cannot
 * reach it.
 */
function refreshMenu() {
  revalidatePath("/workspace/menu");
  revalidatePath("/workspace/menu/categories");
  revalidatePath("/workspace/menu/options");
  revalidatePath("/workspace/menu/items/new");
  revalidatePath("/menu");
  revalidatePath("/menu/[category]", "page");
  revalidatePath("/menu/[category]/[item]", "page");
}

/** Database error codes to sentences. Never show a raw Postgres message. */
function friendlyMenuError(message: string | undefined): string {
  if (message?.includes("BRANCH_FORBIDDEN")) return "You do not have access to change this counter.";
  if (message?.includes("FORBIDDEN")) return "You do not have access to make this change.";
  if (message?.includes("HOLD_NEEDS_AN_END")) return "Choose when this item comes back.";
  if (message?.includes("HOLD_END_IN_PAST")) return "Choose a time in the future for this item to come back.";
  if (message?.includes("ITEM_NOT_FOUND")) return "That item no longer exists. Refresh the page.";
  if (message?.includes("CATEGORY_HAS_ITEMS")) return "Move or delete this category's items before deleting it.";
  if (message?.includes("ITEM_IN_ORDERS")) return "Past orders reference this item, so it cannot be deleted. Mark it unavailable instead.";
  if (message?.includes("VARIATIONS_REQUIRED")) return "An item needs at least one size, even if it only has one price.";
  if (message?.includes("ONE_DEFAULT_REQUIRED")) return "Choose exactly one size as the default.";
  if (message?.includes("INVALID_VARIATIONS")) return "Check the sizes. Each one needs a name, a short name and a price.";
  if (message?.includes("VARIATION_NOT_ON_ITEM")) return "One of those sizes belongs to a different item. Refresh the page.";
  if (message?.includes("CATEGORY_NOT_FOUND")) return "That category no longer exists. Choose another.";
  if (message?.includes("GROUP_NOT_FOUND")) return "One of those option groups no longer exists. Refresh the page.";
  if (message?.includes("OPTION_IN_ORDERS")) return "Past orders reference this option, so it cannot be deleted. Mark it unavailable instead.";
  if (message?.includes("GROUP_STILL_LINKED")) return "Unlink this option group from its items before deleting it.";
  if (message?.includes("PRICE_RANGE")) return "Check the price.";
  if (message?.includes("HEAT_RANGE")) return "Heat has to be between 0 and 100.";
  if (message?.includes("INVALID_INPUT")) return "Check the details and try again.";
  return "The menu change could not be saved. Try again.";
}

const holdSchema = z
  .object({
    itemId: z.uuid(),
    branchId: z.uuid(),
    kind: z.enum(["today", "until", "indefinite", "lift"]),
    unavailableUntil: z.string().trim().default(""),
  })
  .transform((value) => ({
    ...value,
    kind: value.kind === "lift" ? null : value.kind,
  }));

/**
 * Pause or resume one item at one counter.
 *
 * The form sends a wall clock datetime string, the counter's own clock, not
 * the server process's. manilaWallClockIso turns it into an instant, and the
 * RPC refuses one that has already passed.
 */
export async function setMenuItemHold(
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const parsed = holdSchema.safeParse({
    itemId: formData.get("itemId"),
    branchId: formData.get("branchId"),
    kind: formData.get("kind"),
    unavailableUntil: formData.get("unavailableUntil") ?? "",
  });
  if (!parsed.success) return { status: "error", message: "Check the item and try again." };

  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "menu:availability")) {
    return { status: "error", message: "You do not have access to change item availability." };
  }

  const { itemId, branchId, kind, unavailableUntil } = parsed.data;
  let until: string | null = null;
  if (kind === "today" || kind === "until") {
    if (!unavailableUntil) return { status: "error", message: "Choose when this item comes back." };
    until = manilaWallClockIso(unavailableUntil);
    if (!until) return { status: "error", message: "Choose when this item comes back." };
  }

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_set_menu_item_hold", {
    p_item_id: itemId,
    p_branch_id: branchId,
    p_kind: kind,
    p_unavailable_until: until,
  });
  if (error) {
    console.error("[workspace] menu item hold failed:", error.message);
    return { status: "error", message: friendlyMenuError(error.message) };
  }

  refreshMenu();
  return {
    status: "success",
    message: kind === null ? "Back on the menu." : "Marked sold out.",
  };
}

const categorySchema = z.object({
  id: z.union([z.uuid(), z.literal("")]).default(""),
  name: z.string().trim().min(2).max(80),
  blurb: z.string().trim().max(200).default(""),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

/**
 * Create or update one category. staff_save_menu_category mints and
 * preserves the slug itself; nothing here ever sends one.
 */
export async function saveMenuCategory(
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const parsed = categorySchema.safeParse({
    id: formData.get("id") ?? "",
    name: formData.get("name"),
    blurb: formData.get("blurb") ?? "",
    isActive: formData.get("isActive") ?? "true",
  });
  if (!parsed.success) return { status: "error", message: "Check the category name and blurb." };

  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "menu:configure")) {
    return { status: "error", message: "You do not have access to change the menu." };
  }

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_save_menu_category", {
    p_id: parsed.data.id || null,
    p_name: parsed.data.name,
    p_blurb: parsed.data.blurb || null,
    p_is_active: parsed.data.isActive,
  });
  if (error) {
    console.error("[workspace] category save failed:", error.message);
    return { status: "error", message: friendlyMenuError(error.message) };
  }

  refreshMenu();
  return { status: "success", message: parsed.data.id ? "Category saved." : "Category added." };
}

const optionGroupSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]).default(""),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).default(""),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

/**
 * Create or update one option group. staff_save_menu_option_group mints and
 * preserves the slug itself; nothing here ever sends one.
 */
export async function saveMenuOptionGroup(
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const parsed = optionGroupSchema.safeParse({
    id: formData.get("id") ?? "",
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    isActive: formData.get("isActive") ?? "true",
  });
  if (!parsed.success) return { status: "error", message: "Check the group name and description." };

  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "menu:configure")) {
    return { status: "error", message: "You do not have access to change the menu." };
  }

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_save_menu_option_group", {
    p_id: parsed.data.id || null,
    p_name: parsed.data.name,
    p_description: parsed.data.description || null,
    p_is_active: parsed.data.isActive,
  });
  if (error) {
    console.error("[workspace] option group save failed:", error.message);
    return { status: "error", message: friendlyMenuError(error.message) };
  }

  refreshMenu();
  return { status: "success", message: parsed.data.id ? "Group saved." : "Group added." };
}

/**
 * pricing is the three way choice, not a number.
 *
 * "bySize" sends null, which means this option is priced through
 * menu_option_variation_prices on each item that links the group. It does not
 * mean free, and turning it into 0 here would silently make every heat level
 * free on every wing size.
 */
const optionSchema = z
  .object({
    id: z.union([z.uuid(), z.literal("")]).default(""),
    groupId: z.uuid(),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(300).default(""),
    pricing: z.enum(["free", "flat", "bySize"]),
    priceCents: z.coerce.number().int().min(0).max(10_000_000).default(0),
    heatPercent: z.union([z.coerce.number().int().min(0).max(100), z.literal("")]).default(""),
    isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
  })
  .transform((value) => ({
    ...value,
    resolvedPriceCents:
      value.pricing === "bySize" ? null : value.pricing === "free" ? 0 : value.priceCents,
    resolvedHeatPercent: value.heatPercent === "" ? null : value.heatPercent,
  }));

export async function saveMenuOption(
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const parsed = optionSchema.safeParse({
    id: formData.get("id") ?? "",
    groupId: formData.get("groupId"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    pricing: formData.get("pricing"),
    priceCents: formData.get("priceCents") ?? 0,
    heatPercent: formData.get("heatPercent") ?? "",
    isActive: formData.get("isActive") ?? "true",
  });
  if (!parsed.success) return { status: "error", message: "Check the option name and price." };

  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "menu:configure")) {
    return { status: "error", message: "You do not have access to change the menu." };
  }

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_save_menu_option", {
    p_id: parsed.data.id || null,
    p_group_id: parsed.data.groupId,
    p_name: parsed.data.name,
    p_description: parsed.data.description || null,
    p_price_cents: parsed.data.resolvedPriceCents,
    p_heat_percent: parsed.data.resolvedHeatPercent,
    p_is_active: parsed.data.isActive,
  });
  if (error) {
    console.error("[workspace] option save failed:", error.message);
    return { status: "error", message: friendlyMenuError(error.message) };
  }

  refreshMenu();
  return { status: "success", message: parsed.data.id ? "Option saved." : "Option added." };
}

/**
 * One size of one item, as the editor sends it.
 *
 * An empty id is a size that does not exist yet; the action turns it into
 * null and staff_save_menu_item mints the row and its slug. A slug is never
 * sent, on a create or on a rename.
 *
 * isActive false is how the screen expresses "take this size off the menu".
 * The row stays in the payload rather than dropping out of it, because the
 * RPC has no delete path for a variation (ruling R4) and a row it does not
 * see is deactivated anyway. Sending the removal explicitly is what lets a
 * mistake be undone before saving instead of after.
 *
 * The bounds are the RPC's own, or tighter. name stops at 80 because
 * staff_save_menu_item raises INVALID_INPUT above that, and a limit only the
 * database knows would surface as "Check the details and try again" with
 * nothing pointing at the name.
 */
const variationInputSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]).default(""),
  label: z.string().trim().min(1).max(60),
  shortLabel: z.string().trim().min(1).max(20),
  priceCents: z.number().int().min(0).max(10_000_000),
  isDefault: z.boolean(),
  isActive: z.boolean(),
});

const itemSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]).default(""),
  categoryId: z.uuid(),
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().max(16).default(""),
  description: z.string().trim().max(500).default(""),
  isFeatured: z.boolean(),
  isActive: z.boolean(),
  variations: z.array(variationInputSchema).min(1).max(30),
  optionGroupIds: z.array(z.uuid()).max(30),
});

/**
 * Create or update one item, its sizes and its option group links, in one
 * audited call.
 *
 * The form posts a single field, payload, carrying JSON, rather than a set of
 * indexed field names. Variations nest, and rebuilding a nested list out of
 * FormData keys is where a form like this usually breaks: a key that only
 * exists in one branch of a conditional goes missing from the submission and
 * nothing in typecheck, lint or the test suite can see it.
 *
 * The order of the variations array is the sort order the RPC writes.
 */
export async function saveMenuItem(
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { status: "error", message: "The item form could not be read. Refresh and try again." };
  }
  const parsed = itemSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: "Check the item details and its sizes." };

  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "menu:configure")) {
    return { status: "error", message: "You do not have access to change the menu." };
  }

  const supabase = await createStaffClient();
  const { data, error } = await supabase.rpc("staff_save_menu_item", {
    p_id: parsed.data.id || null,
    p_category_id: parsed.data.categoryId,
    p_name: parsed.data.name,
    p_code: parsed.data.code || null,
    p_description: parsed.data.description || null,
    p_is_featured: parsed.data.isFeatured,
    p_is_active: parsed.data.isActive,
    p_variations: parsed.data.variations.map((variation) => ({
      id: variation.id || null,
      label: variation.label,
      shortLabel: variation.shortLabel,
      priceCents: variation.priceCents,
      isDefault: variation.isDefault,
      isActive: variation.isActive,
    })),
    p_option_group_ids: parsed.data.optionGroupIds,
  });
  if (error) {
    console.error("[workspace] item save failed:", error.message);
    return { status: "error", message: friendlyMenuError(error.message) };
  }

  // The one id this call wrote, revalidated here rather than in refreshMenu.
  // Ruling R24: refreshMenu also runs on a delete, and invalidating the item
  // route from there would re-render a deleted item's own page into a 404
  // before its editor could navigate away. A save cannot hit that, because
  // the row it revalidates is the row it just wrote.
  refreshMenu();
  if (typeof data === "string") revalidatePath(`/workspace/menu/items/${data}`);
  return { status: "success", message: parsed.data.id ? "Item saved." : "Item added." };
}

const deleteSchema = z.object({
  entity: z.enum(["category", "item", "option", "optionGroup"]),
  id: z.uuid(),
});

/**
 * The one delete action, for all four entity kinds. Task 7 (options) and
 * Task 9 (items and option groups) reuse this unchanged. Do not write a
 * second one for another entity kind.
 */
export async function deleteMenuEntity(
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const parsed = deleteSchema.safeParse({
    entity: formData.get("entity"),
    id: formData.get("id"),
  });
  if (!parsed.success) return { status: "error", message: "That record could not be identified." };

  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "menu:configure")) {
    return { status: "error", message: "You do not have access to change the menu." };
  }

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_delete_menu_entity", {
    p_entity: parsed.data.entity,
    p_id: parsed.data.id,
  });
  if (error) {
    console.error("[workspace] menu delete failed:", error.message);
    return { status: "error", message: friendlyMenuError(error.message) };
  }

  refreshMenu();
  return { status: "success", message: "Deleted." };
}
