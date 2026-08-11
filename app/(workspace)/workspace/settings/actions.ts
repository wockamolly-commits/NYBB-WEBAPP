"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AvailabilityActionState } from "@/lib/staff/availability-types";
import { parseTime12 } from "@/lib/staff/availability-types";
import { getStaffProfile, hasStaffPermission } from "@/lib/staff/session";
import { createStaffClient } from "@/lib/supabase/server";

const branchSettingsSchema = z.object({
  branchId: z.uuid(),
  isActive: z.boolean(),
  prepMinutes: z.coerce.number().int().min(1).max(240),
  slotMinutes: z.coerce.number().int().min(5).max(120),
  slotCapacity: z.coerce.number().int().min(1).max(200),
});

const timeSchema = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
const hoursSchema = z.object({
  branchId: z.uuid(),
  hours: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    is_closed: z.boolean(),
    opens_at: timeSchema.nullable(),
    closes_at: timeSchema.nullable(),
  })).length(7),
});

const intakeSchema = z.object({
  acceptingOrders: z.boolean(),
  slotHorizonHours: z.coerce.number().int().min(1).max(168),
});

function errorFor(message: string | undefined, fallback: string): string {
  if (message?.includes("FORBIDDEN") || message?.includes("BRANCH_FORBIDDEN")) return "You do not have access to change these settings.";
  if (message?.includes("BUSINESS_WIDE_FORBIDDEN")) return "Only a business-wide manager can change this setting.";
  if (message?.includes("WINDOW_EMPTY")) return "Opening and closing times cannot be the same.";
  if (message?.includes("WINDOW_")) return "Each open day needs valid opening and closing times.";
  return fallback;
}

async function settingsProfile() {
  const profile = await getStaffProfile();
  return profile && hasStaffPermission(profile, "settings:manage") ? profile : null;
}

function refreshWorkspace() {
  revalidatePath("/workspace/settings");
  revalidatePath("/workspace/availability");
  revalidatePath("/workspace");
}

export async function saveBranchSettings(
  _previous: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const parsed = branchSettingsSchema.safeParse({
    branchId: formData.get("branchId"),
    isActive: formData.get("isActive") === "true",
    prepMinutes: formData.get("prepMinutes"),
    slotMinutes: formData.get("slotMinutes"),
    slotCapacity: formData.get("slotCapacity"),
  });
  if (!parsed.success) return { status: "error", message: "Prep, slot length, and capacity need valid values." };
  if (!(await settingsProfile())) return { status: "error", message: "You do not have access to change settings." };

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_set_branch_settings", {
    p_branch_id: parsed.data.branchId,
    p_is_active: parsed.data.isActive,
    p_prep_minutes: parsed.data.prepMinutes,
    p_slot_minutes: parsed.data.slotMinutes,
    p_slot_capacity: parsed.data.slotCapacity,
  });
  if (error) {
    console.error("[workspace] branch settings update failed:", error.message);
    return { status: "error", message: errorFor(error.message, "Branch settings could not be saved. Try again.") };
  }
  refreshWorkspace();
  return { status: "success", message: "Branch settings saved." };
}

export async function saveStoreHours(
  previous: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const hours = Array.from({ length: 7 }, (_unused, weekday) => {
    const isClosed = formData.get(`closed-${weekday}`) === "true";
    return {
      weekday,
      is_closed: isClosed,
      opens_at: parseTime12(String(formData.get(`opens-${weekday}`) ?? "")),
      closes_at: parseTime12(String(formData.get(`closes-${weekday}`) ?? "")),
    };
  });
  const parsed = hoursSchema.safeParse({ branchId: formData.get("branchId"), hours });
  if (!parsed.success) return { status: "error", message: "Every open day needs a valid time, such as 11:00 AM.", savedHours: previous.savedHours };
  if (!(await settingsProfile())) return { status: "error", message: "You do not have access to change settings.", savedHours: previous.savedHours };

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_set_store_hours", {
    p_branch_id: parsed.data.branchId,
    p_hours: parsed.data.hours,
  });
  if (error) {
    console.error("[workspace] store hours update failed:", error.message);
    return { status: "error", message: errorFor(error.message, "Opening hours could not be saved. Try again."), savedHours: previous.savedHours };
  }
  refreshWorkspace();
  return {
    status: "success",
    message: "Opening hours saved. Customers see the new schedule on their next visit.",
    savedHours: parsed.data.hours.map((day) => ({
      weekday: day.weekday,
      isClosed: day.is_closed,
      opensAt: day.opens_at,
      closesAt: day.closes_at,
    })),
  };
}

export async function saveOrderIntake(
  _previous: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const parsed = intakeSchema.safeParse({
    acceptingOrders: formData.get("acceptingOrders") === "true",
    slotHorizonHours: formData.get("slotHorizonHours"),
  });
  if (!parsed.success) return { status: "error", message: "The order horizon must be between 1 and 168 hours." };
  const profile = await settingsProfile();
  if (!profile) return { status: "error", message: "You do not have access to change settings." };
  if (profile.branchId !== null) return { status: "error", message: "Only a business-wide manager can change this setting." };

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_set_order_intake", {
    p_accepting_orders: parsed.data.acceptingOrders,
    p_slot_horizon_hours: parsed.data.slotHorizonHours,
  });
  if (error) {
    console.error("[workspace] order intake update failed:", error.message);
    return { status: "error", message: errorFor(error.message, "Order intake could not be saved. Try again.") };
  }
  refreshWorkspace();
  return { status: "success", message: "Business order intake saved." };
}
