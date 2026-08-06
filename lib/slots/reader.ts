import { z } from "zod";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";
import type { PickupSlots } from "./types";

/**
 * The one place the storefront gets pickup windows.
 *
 * Deliberately NOT shaped like `lib/menu/`. The menu reader falls back to the
 * static catalog when Supabase is absent, because a menu is a published fact
 * and serving last quarter's prices is the only risk. There is no equivalent
 * here and there must never be one: a window is a promise that a specific
 * kitchen will have specific food ready at a specific minute, and inventing
 * one on a laptop with no database is how a customer turns up to a closed
 * shop.
 *
 * So the no-database path returns the same answer the database would, and it
 * is a true one: no branch is live, therefore no windows. Every surface then
 * renders the same honest empty state whether or not a project exists.
 */

const branchSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  timezone: z.string().min(1),
  slotMinutes: z.number().int().positive(),
  prepMinutes: z.number().int().positive(),
});

const slotSchema = z.object({
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  capacity: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});

export const pickupSlotsSchema = z.object({
  branch: branchSchema.nullable(),
  generatedAt: z.string().min(1),
  horizonHours: z.number().int().positive().nullable(),
  slots: z.array(slotSchema),
  unavailableReason: z
    .enum(["no_branch", "not_accepting", "no_hours", "closed_now", "fully_booked"])
    .nullable(),
});

/** What a storefront with no database in front of it correctly knows. */
export function noBranchYet(generatedAt: Date = new Date()): PickupSlots {
  return {
    branch: null,
    generatedAt: generatedAt.toISOString(),
    horizonHours: null,
    slots: [],
    unavailableReason: "no_branch",
  };
}

export async function getPickupSlots(branchSlug?: string): Promise<PickupSlots> {
  if (!supabaseConfigured()) return noBranchYet();

  const supabase = createPublicClient();
  // `p_at` is deliberately not passed. The clock that decides which windows
  // are still reachable is the database's, the same one place_order will use
  // when it books against them, and a clock sent from a browser is a clock an
  // attacker chooses.
  const { data, error } = await supabase.rpc("get_pickup_slots", {
    p_branch_slug: branchSlug ?? null,
  });

  if (error) {
    // Loud, for the same reason the menu reader is loud about a query that
    // fails against a database that really exists: this is an outage or a
    // misconfiguration, and quietly showing "no windows" would read to the
    // owner as a closed shop rather than a broken one.
    throw new Error(`get_pickup_slots failed: ${error.message}`);
  }

  return pickupSlotsSchema.parse(data);
}
