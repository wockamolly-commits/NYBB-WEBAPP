"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { manilaWallClockIso } from "@/lib/staff/manila-dates";
import type { MenuActionState } from "@/lib/staff/menu-types";
import { getStaffProfile, hasStaffPermission } from "@/lib/staff/session";
import { createStaffClient } from "@/lib/supabase/server";

/**
 * Every menu change invalidates the same four paths.
 *
 * The two dynamic storefront routes are named as page paths, which is what
 * revalidatePath needs for a route with a parameter. Without them a customer
 * sitting on a category page keeps the old prices until the segment expires.
 */
function refreshMenu() {
  revalidatePath("/workspace/menu");
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
