import "server-only";

import { cache } from "react";
import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  createReadOnlyCustomerClient,
  createReadOnlyStaffClient,
  supabaseConfigured,
} from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/orders/types";

export type CustomerProfile = {
  displayName: string;
  phone: string;
};

export type AccountOrder = {
  shortCode: string;
  status: OrderStatus;
  placedAt: string;
  totalCents: number;
};

const accountOrdersSchema = z.array(
  z.object({
    short_code: z.string().min(1),
    status: z.enum([
      "pending",
      "accepted",
      "preparing",
      "ready",
      "claimed",
      "rejected",
      "cancelled",
      "no_show",
    ]),
    placed_at: z.string().min(1),
    total_cents: z.number().int().nonnegative(),
  }),
);

export type StorefrontSession = {
  user: User;
  supabase: SupabaseClient;
  source: "customer" | "staff";
};

/**
 * The Storefront accepts either cookie family as the same signed-in person.
 * Customer cookies win when both exist. A staff-only browser remains signed in
 * without copying its refresh token into a second cookie family.
 */
export async function readStorefrontSession(): Promise<StorefrontSession | null> {
  if (!supabaseConfigured()) return null;
  const customer = await createReadOnlyCustomerClient();
  const customerResult = await customer.auth.getUser();
  if (customerResult.data.user) {
    return { user: customerResult.data.user, supabase: customer, source: "customer" };
  }

  const staff = await createReadOnlyStaffClient();
  const staffResult = await staff.auth.getUser();
  if (staffResult.data.user) {
    return { user: staffResult.data.user, supabase: staff, source: "staff" };
  }

  return null;
}

export const getStorefrontSession = cache(readStorefrontSession);

export const getCurrentCustomer = cache(async (): Promise<User | null> =>
  (await getStorefrontSession())?.user ?? null,
);

export async function getCustomerProfile(): Promise<CustomerProfile | null> {
  const session = await getStorefrontSession();
  if (!session) return null;

  const { data, error } = await session.supabase
    .from("customer_profiles")
    .select("display_name, phone")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) console.error("[auth] customer profile read failed:", error.message);
  return {
    displayName: typeof data?.display_name === "string" ? data.display_name : "",
    phone: typeof data?.phone === "string" ? data.phone : "",
  };
}

export async function getAccountOrders(): Promise<AccountOrder[]> {
  const session = await getStorefrontSession();
  if (!session) return [];

  const { data, error } = await session.supabase
    .from("orders")
    .select("short_code, status, placed_at, total_cents")
    .eq("user_id", session.user.id)
    .order("placed_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[auth] account order history read failed:", error.message);
    return [];
  }

  const parsed = accountOrdersSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[auth] account order history had an unreadable shape", parsed.error.issues);
    return [];
  }

  return parsed.data.map((order) => ({
    shortCode: order.short_code,
    status: order.status,
    placedAt: order.placed_at,
    totalCents: order.total_cents,
  }));
}
