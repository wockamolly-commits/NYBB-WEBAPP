"use server";

import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStorefrontSession } from "@/lib/auth/session";
import { clientAddress } from "@/lib/rate-limit/address";
import { withinAddressLimit } from "@/lib/rate-limit/limiter";
import { mergeCarts, sanitizeCart, type CartSyncResult } from "@/lib/cart/sync";
import type { Cart } from "@/lib/cart/types";

async function storedCart(supabase: SupabaseClient, userId: string): Promise<Cart> {
  const { data, error } = await supabase
    .from("customer_carts")
    .select("lines")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`customer cart read failed: ${error.message}`);
  return sanitizeCart(data?.lines);
}

async function writeCart(
  supabase: SupabaseClient,
  userId: string,
  cart: Cart,
): Promise<CartSyncResult> {
  const { error } = await supabase.from("customer_carts").upsert(
    { user_id: userId, lines: cart.lines },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`customer cart write failed: ${error.message}`);
  return { signedIn: true, userId, cart };
}

async function cartWriteAllowed(): Promise<boolean> {
  return withinAddressLimit({
    action: "customer_cart_write",
    address: clientAddress(await headers()),
    limit: 60,
    windowSeconds: 60,
  });
}

export async function fetchAccountCart(): Promise<CartSyncResult> {
  const session = await getStorefrontSession();
  if (!session) return { signedIn: false };
  return {
    signedIn: true,
    userId: session.user.id,
    cart: await storedCart(session.supabase, session.user.id),
  };
}

export async function saveAccountCart(value: unknown): Promise<CartSyncResult> {
  const session = await getStorefrontSession();
  if (!session) return { signedIn: false };
  if (!(await cartWriteAllowed())) return fetchAccountCart();
  return writeCart(session.supabase, session.user.id, sanitizeCart(value));
}

export async function mergeAccountCart(value: unknown): Promise<CartSyncResult> {
  const session = await getStorefrontSession();
  if (!session) return { signedIn: false };
  const local = sanitizeCart(value);
  const account = await storedCart(session.supabase, session.user.id);
  if (local.lines.length === 0) {
    return { signedIn: true, userId: session.user.id, cart: account };
  }
  if (!(await cartWriteAllowed())) {
    return { signedIn: true, userId: session.user.id, cart: account };
  }
  return writeCart(
    session.supabase,
    session.user.id,
    mergeCarts(local, account),
  );
}
