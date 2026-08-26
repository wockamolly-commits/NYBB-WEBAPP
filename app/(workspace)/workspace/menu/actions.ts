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
 * feature has to be listed here by itself. The two dynamic storefront routes
 * are named as page paths, which is what revalidatePath needs for a route
 * with a parameter. Without them a customer sitting on a category page keeps
 * the old prices until the segment expires.
 */
function refreshMenu() {
  revalidatePath("/workspace/menu");
  revalidatePath("/workspace/menu/categories");
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
