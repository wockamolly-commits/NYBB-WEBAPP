import "server-only";

import { z } from "zod";
import { createReadOnlyStaffClient } from "@/lib/supabase/server";
import { toWeek, type BranchAvailability, type OrderIntakeSettings, type StoreHoursDay } from "./availability-types";

export type { BranchAvailability, OrderIntakeSettings } from "./availability-types";

const hoursRowSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  is_closed: z.boolean(),
  opens_at: z.string().nullable(),
  closes_at: z.string().nullable(),
});

const availabilityRowSchema = z.object({
  branch_id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  short_name: z.string(),
  timezone: z.string(),
  is_active: z.boolean(),
  is_accepting_orders: z.boolean(),
  prep_minutes_default: z.number().int(),
  pickup_slot_minutes: z.number().int(),
  pickup_slot_capacity: z.number().int(),
  is_open_now: z.boolean(),
  accepts_orders_now: z.boolean(),
  hours: z.array(hoursRowSchema),
});

const settingsSchema = z.object({
  accepting_orders: z.boolean(),
  slot_horizon_hours: z.number().int(),
});

export function toBranchAvailability(value: unknown): BranchAvailability | null {
  const parsed = availabilityRowSchema.safeParse(value);
  if (!parsed.success) return null;

  const row = parsed.data;
  const rows: StoreHoursDay[] = row.hours.map((entry) => ({
    weekday: entry.weekday,
    isClosed: entry.is_closed,
    opensAt: entry.opens_at,
    closesAt: entry.closes_at,
  }));

  return {
    branchId: row.branch_id,
    slug: row.slug,
    name: row.name,
    shortName: row.short_name,
    timezone: row.timezone,
    isActive: row.is_active,
    isAcceptingOrders: row.is_accepting_orders,
    prepMinutes: row.prep_minutes_default,
    slotMinutes: row.pickup_slot_minutes,
    slotCapacity: row.pickup_slot_capacity,
    isOpenNow: row.is_open_now,
    acceptsOrdersNow: row.accepts_orders_now,
    week: toWeek(rows),
    hasPublishedHours: rows.some((entry) => !entry.isClosed),
  };
}

/**
 * Every branch this staff member may work, newest state first hand.
 *
 * There is no branch argument, for the same reason the audit log has none:
 * staff_list_store_availability() scopes to the caller's own branch inside the
 * database, so a page that forgot to pass one is still scoped and a page that
 * passed the wrong one could not widen it. Returns null when the read failed,
 * which the screen says differently from an empty list.
 */
export async function getStoreAvailability(): Promise<BranchAvailability[] | null> {
  const supabase = await createReadOnlyStaffClient();
  const { data, error } = await supabase.rpc("staff_list_store_availability");
  if (error) {
    console.error("[workspace] store availability read failed:", error.message);
    return null;
  }

  const rows = Array.isArray(data) ? data : [];
  const branches = rows
    .map((row) => {
      const branch = toBranchAvailability(row);
      if (!branch) console.error("[workspace] skipped an unreadable branch row");
      return branch;
    })
    .filter((branch): branch is BranchAvailability => branch !== null);
  return branches;
}

/** The two genuinely global values, read through the staff session's own RLS. */
export async function getOrderIntakeSettings(): Promise<OrderIntakeSettings | null> {
  const supabase = await createReadOnlyStaffClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("accepting_orders, slot_horizon_hours")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("[workspace] order intake settings read failed:", error.message);
    return null;
  }

  const parsed = settingsSchema.safeParse(data);
  if (!parsed.success) return null;
  return {
    acceptingOrders: parsed.data.accepting_orders,
    slotHorizonHours: parsed.data.slot_horizon_hours,
  };
}
