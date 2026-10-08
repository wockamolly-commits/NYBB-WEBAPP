"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AvailabilityActionState } from "@/lib/staff/availability-types";
import { readBranchCreateForm, readBranchEditForm } from "@/lib/staff/branch-create-schema";
import { insidePhilippines, parseCoordinates, readBranchLocationForm } from "@/lib/staff/branch-location-schema";
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
    message: "Opening hours saved. The branches page shows the new schedule straight away.",
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

const CREATE_ERRORS: Record<string, string> = {
  DUPLICATE_SHORT_NAME: "Another branch already uses that short name. Choose a different one.",
  PRICE_LIST_REQUIRED: "Choose which price list this branch uses.",
  PRICE_LIST_NOT_FOUND: "That price list no longer exists. Reload the page and choose again.",
  TOO_MANY_PHONES: "A branch can list up to four phone numbers.",
  FIELD_TOO_LONG: "One of the fields is too long. Shorten it and try again.",
};

export async function createBranch(
  _previous: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const parsed = readBranchCreateForm(formData);
  if (!parsed.success) {
    return { status: "error", message: "Fill in the name, short name, format, address and city. Phones are up to four, separated by commas." };
  }
  // The pin is optional, and checked before anything is written, so a typo in
  // it cannot leave a branch created and the person unsure whether it was.
  const coordinates = String(formData.get("coordinates") ?? "").trim();
  const pin = coordinates ? parseCoordinates(coordinates) : null;
  if (coordinates && !pin) return { status: "error", message: "The coordinates are not two numbers, such as 10.3107153, 123.8962067. Fix them or clear the field." };
  if (pin && !insidePhilippines(pin)) return { status: "error", message: "That pin is outside the Philippines. Check the two numbers are not the wrong way round." };
  const profile = await settingsProfile();
  if (!profile) return { status: "error", message: "You do not have access to change settings." };
  if (profile.branchId !== null) return { status: "error", message: "Only a business-wide manager can add a branch." };

  const supabase = await createStaffClient();
  const { data: branchId, error } = await supabase.rpc("staff_create_branch", {
    p_name: parsed.data.name,
    p_short_name: parsed.data.shortName,
    p_format: parsed.data.format,
    p_address_line: parsed.data.addressLine,
    p_barangay: parsed.data.barangay,
    p_city: parsed.data.city,
    p_phones: parsed.data.phones,
    p_price_list_id: parsed.data.priceListId,
  });
  if (error) {
    console.error("[workspace] branch create failed:", error.message);
    const code = Object.keys(CREATE_ERRORS).find((key) => error.message.includes(key));
    return { status: "error", message: code ? CREATE_ERRORS[code] : errorFor(error.message, "The branch could not be added. Try again.") };
  }

  // Two calls rather than one, because the pin has its own audited setter
  // (0082) and creating a branch has no reason to restate it. The branch
  // exists by now, so a failure here is said plainly instead of as an error.
  let pinNote = "";
  if (pin && typeof branchId === "string") {
    const { error: pinError } = await supabase.rpc("staff_set_branch_location", {
      p_branch_id: branchId,
      p_lat: pin.lat,
      p_lng: pin.lng,
    });
    if (pinError) {
      console.error("[workspace] new branch pin failed:", pinError.message);
      pinNote = " Its map location could not be saved, so set it from Edit branch.";
    }
  }
  refreshWorkspace();
  revalidatePath("/contact");
  revalidatePath("/stores");
  return {
    status: "success",
    message: `${parsed.data.shortName} added, switched off. Open it below to set its hours, then turn it on.${pinNote}`,
  };
}

export async function saveBranchLocation(
  _previous: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const parsed = readBranchLocationForm(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };
  if (!(await settingsProfile())) return { status: "error", message: "You do not have access to change settings." };

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_set_branch_location", {
    p_branch_id: parsed.branchId,
    p_lat: parsed.point?.lat ?? null,
    p_lng: parsed.point?.lng ?? null,
  });
  if (error) {
    console.error("[workspace] branch location update failed:", error.message);
    if (error.message.includes("LOCATION_OUTSIDE_PHILIPPINES")) {
      return { status: "error", message: "That point is outside the Philippines. Check the two numbers are not the wrong way round." };
    }
    return { status: "error", message: errorFor(error.message, "The location could not be saved. Try again.") };
  }
  refreshWorkspace();
  revalidatePath("/contact");
  revalidatePath("/stores");
  return {
    status: "success",
    message: parsed.point ? "Location saved. The Branches page map now points here." : "Pin removed.",
  };
}

export async function saveBranchDetails(
  _previous: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const parsed = readBranchEditForm(formData);
  if (!parsed.success) {
    return { status: "error", message: "Fill in the name, short name, format, address and city. Phones are up to four, separated by commas." };
  }
  if (!(await settingsProfile())) return { status: "error", message: "You do not have access to change settings." };

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_update_branch_details", {
    p_branch_id: parsed.data.branchId,
    p_name: parsed.data.name,
    p_short_name: parsed.data.shortName,
    p_format: parsed.data.format,
    p_address_line: parsed.data.addressLine,
    p_barangay: parsed.data.barangay,
    p_city: parsed.data.city,
    p_phones: parsed.data.phones,
  });
  if (error) {
    console.error("[workspace] branch details update failed:", error.message);
    const code = Object.keys(CREATE_ERRORS).find((key) => error.message.includes(key));
    return { status: "error", message: code ? CREATE_ERRORS[code] : errorFor(error.message, "The branch details could not be saved. Try again.") };
  }
  refreshWorkspace();
  revalidatePath("/", "layout");
  return { status: "success", message: "Branch details saved. The Branches page shows them straight away." };
}

const DELETE_ERRORS: Record<string, string> = {
  BRANCH_ACTIVE: "Switch the branch off first: untick Live on the ordering platform and save, then delete it.",
  BRANCH_HAS_ORDERS: "This branch has taken orders, so it cannot be deleted. Its sales and refunds stay on record. Switch it off instead.",
  BRANCH_HAS_STAFF: "Staff are assigned or invited to this branch. Move them to another branch on the Team screen first.",
  BRANCH_HAS_PROMOS: "A promo code is limited to this branch. Change or delete that code first, or it would become valid at every branch.",
  BRANCH_NOT_FOUND: "This branch was already deleted.",
};

export async function deleteBranch(
  _previous: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const parsed = z.uuid().safeParse(formData.get("branchId"));
  if (!parsed.success) return { status: "error", message: "The branch could not be identified. Reload and try again." };
  const profile = await settingsProfile();
  if (!profile) return { status: "error", message: "You do not have access to change settings." };
  if (profile.branchId !== null) return { status: "error", message: "Only a business-wide manager can delete a branch." };

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_delete_branch", { p_branch_id: parsed.data });
  if (error) {
    console.error("[workspace] branch delete failed:", error.message);
    const code = Object.keys(DELETE_ERRORS).find((key) => error.message.includes(key));
    return { status: "error", message: code ? DELETE_ERRORS[code] : errorFor(error.message, "The branch could not be deleted. Try again.") };
  }
  refreshWorkspace();
  revalidatePath("/", "layout");
  return { status: "success", message: "Branch deleted." };
}
