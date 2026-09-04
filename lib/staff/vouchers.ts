import "server-only";

import { createStaffClient } from "@/lib/supabase/server";
import { toVoucher, voucherRowSchema, type Voucher } from "@/lib/vouchers/schema";
import { voucherStatus, type VoucherStatus } from "@/lib/vouchers/status";

/**
 * The reads behind /workspace/vouchers.
 *
 * Every one of them goes through the ordinary staff client, so RLS decides what
 * comes back: the policies from 0022 and 0064 admit these rows only to a
 * session holding vouchers:manage, and the page's own guard is the courtesy on
 * top rather than the rule. A service-role client here would quietly become the
 * authority and the policies would stop being load bearing.
 *
 * Nullable columns are carried through as nulls the whole way. `voucherRowSchema`
 * is where that is enforced and lib/vouchers/schema.ts explains why at length,
 * but the short version is that six of these columns mean something specific by
 * being null and not one of them means zero.
 */

export type VoucherScope = {
  branchIds: string[];
  itemIds: string[];
  categoryIds: string[];
  customerPhones: string[];
  customerUserIds: string[];
};

export type VoucherListRow = Voucher & {
  status: VoucherStatus;
  branchCount: number;
  itemCount: number;
  categoryCount: number;
  customerCount: number;
};

export type VoucherDetail = Voucher & {
  status: VoucherStatus;
  scope: VoucherScope;
  /**
   * Whether the terms are frozen, from migration 0067.
   *
   * True once any order has named this code, a cancelled one included. Asked of
   * SQL rather than worked out here: a branch-assigned manager cannot see
   * another counter's orders under the 0059 policies, so counting orders from
   * this side would report "editable" for a code used at a branch they do not
   * hold, open the form, and have the save refused.
   */
  locked: boolean;
};

export type VoucherUse = {
  id: string;
  orderShortCode: string | null;
  orderStatus: string | null;
  branchName: string | null;
  customerName: string | null;
  phoneDigits: string | null;
  discountCents: number;
  subtotalCents: number | null;
  totalCents: number | null;
  redeemedAt: string;
};

const COLUMNS =
  "id, code, description, note, amount_cents, percent_off, max_discount_cents, " +
  "min_order_cents, max_uses, max_uses_per_customer, uses_count, starts_at, " +
  "expires_at, is_active, owner_user_id, created_at";

/**
 * Every voucher, newest first, with its scope reduced to counts.
 *
 * Counts rather than names, because the list column has room for "2 branches"
 * and not for two branch names, and the editor is one click away for anybody
 * who needs to know which two. The four scope tables are read in one round trip
 * each rather than through a join, so a voucher with no scope rows costs
 * nothing and stays the cheap common case.
 */
export async function listVouchers(): Promise<VoucherListRow[]> {
  const supabase = await createStaffClient();

  const [vouchers, branches, items, categories, customers] = await Promise.all([
    supabase.from("vouchers").select(COLUMNS).order("created_at", { ascending: false }),
    supabase.from("voucher_branches").select("voucher_id"),
    supabase.from("voucher_items").select("voucher_id"),
    supabase.from("voucher_categories").select("voucher_id"),
    supabase.from("voucher_customers").select("voucher_id"),
  ]);

  if (vouchers.error) throw new Error(`voucher list failed: ${vouchers.error.message}`);

  const tally = (rows: { voucher_id: string }[] | null) => {
    const counts = new Map<string, number>();
    for (const row of rows ?? []) {
      counts.set(row.voucher_id, (counts.get(row.voucher_id) ?? 0) + 1);
    }
    return counts;
  };

  const branchCounts = tally(branches.data);
  const itemCounts = tally(items.data);
  const categoryCounts = tally(categories.data);
  const customerCounts = tally(customers.data);
  const now = new Date();

  return (vouchers.data ?? []).map((row) => {
    const voucher = toVoucher(voucherRowSchema.parse(row));
    return {
      ...voucher,
      status: voucherStatus(voucher, now),
      branchCount: branchCounts.get(voucher.id) ?? 0,
      itemCount: itemCounts.get(voucher.id) ?? 0,
      categoryCount: categoryCounts.get(voucher.id) ?? 0,
      customerCount: customerCounts.get(voucher.id) ?? 0,
    };
  });
}

/** One voucher and its whole scope, for the editor. Null when it is not there. */
export async function getVoucher(id: string): Promise<VoucherDetail | null> {
  const supabase = await createStaffClient();

  const [voucher, branches, items, categories, customers, locked] = await Promise.all([
    supabase.from("vouchers").select(COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("voucher_branches").select("branch_id").eq("voucher_id", id),
    supabase.from("voucher_items").select("item_id").eq("voucher_id", id),
    supabase.from("voucher_categories").select("category_id").eq("voucher_id", id),
    supabase.from("voucher_customers").select("user_id, phone_digits").eq("voucher_id", id),
    supabase.rpc("admin_voucher_locked", { p_voucher_id: id }),
  ]);

  if (voucher.error) throw new Error(`voucher read failed: ${voucher.error.message}`);
  if (!voucher.data) return null;

  const parsed = toVoucher(voucherRowSchema.parse(voucher.data));

  return {
    ...parsed,
    status: voucherStatus(parsed),
    // A failed lock read is treated as locked. The safe direction is refusing
    // an edit that would have been allowed, not offering one the write will
    // reject after somebody has retyped the form.
    locked: locked.error ? true : locked.data === true,
    scope: {
      branchIds: (branches.data ?? []).map((row) => row.branch_id),
      itemIds: (items.data ?? []).map((row) => row.item_id),
      categoryIds: (categories.data ?? []).map((row) => row.category_id),
      customerPhones: (customers.data ?? [])
        .map((row) => row.phone_digits)
        .filter((value): value is string => value !== null),
      customerUserIds: (customers.data ?? [])
        .map((row) => row.user_id)
        .filter((value): value is string => value !== null),
    },
  };
}

/**
 * Who has redeemed a voucher, newest first.
 *
 * The redemption row carries its own copies of the money and the phone number
 * rather than joining back for them, so this reads what was true at the moment
 * the code was used even if the order has since been refunded or rejected. The
 * order is joined only for the things a person would want to click through to:
 * its short code, its current status and the counter.
 */
export async function listVoucherUses(voucherId: string, limit = 100): Promise<VoucherUse[]> {
  const supabase = await createStaffClient();

  const { data, error } = await supabase
    .from("voucher_redemptions")
    .select(
      "id, amount_cents, subtotal_cents, total_cents, phone_digits, redeemed_at, " +
        "orders ( short_code, status, customer_name ), branches ( short_name )",
    )
    .eq("voucher_id", voucherId)
    .order("redeemed_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`voucher usage read failed: ${error.message}`);

  type Joined = {
    id: string;
    amount_cents: number | string;
    subtotal_cents: number | string | null;
    total_cents: number | string | null;
    phone_digits: string | null;
    redeemed_at: string;
    orders: { short_code: string; status: string; customer_name: string } | null;
    branches: { short_name: string } | null;
  };

  return ((data ?? []) as unknown as Joined[]).map((row) => ({
    id: row.id,
    orderShortCode: row.orders?.short_code ?? null,
    orderStatus: row.orders?.status ?? null,
    branchName: row.branches?.short_name ?? null,
    customerName: row.orders?.customer_name ?? null,
    phoneDigits: row.phone_digits,
    // amount_cents is `not null`, so coercion is the right reading here and
    // the two nullable ones are branched on instead.
    discountCents: Number(row.amount_cents),
    subtotalCents: row.subtotal_cents === null ? null : Number(row.subtotal_cents),
    totalCents: row.total_cents === null ? null : Number(row.total_cents),
    redeemedAt: row.redeemed_at,
  }));
}

export type ScopeChoices = {
  branches: { id: string; name: string }[];
  items: { id: string; name: string; categoryId: string }[];
  categories: { id: string; name: string }[];
};

/** What the editor offers in its branch, item and category pickers. */
export async function getScopeChoices(): Promise<ScopeChoices> {
  const supabase = await createStaffClient();

  const [branches, items, categories] = await Promise.all([
    supabase.from("branches").select("id, short_name, is_active").order("short_name"),
    supabase.from("menu_items").select("id, name, category_id, is_active").order("name"),
    supabase.from("menu_categories").select("id, name, is_active").order("sort_order"),
  ]);

  return {
    // Inactive rows are kept out of the pickers but never removed from a
    // voucher that already names one: a counter closed for renovation should
    // not silently widen a code that was limited to it.
    branches: (branches.data ?? [])
      .filter((row) => row.is_active)
      .map((row) => ({ id: row.id, name: row.short_name })),
    items: (items.data ?? [])
      .filter((row) => row.is_active)
      .map((row) => ({ id: row.id, name: row.name, categoryId: row.category_id })),
    categories: (categories.data ?? [])
      .filter((row) => row.is_active)
      .map((row) => ({ id: row.id, name: row.name })),
  };
}

/**
 * Whether the voucher engine is switched on at all.
 *
 * app_settings.vouchers_enabled has defaulted false since 0008, and spec
 * section 18 explains why at length: a half-deployed voucher feature shows a
 * discount on screen and charges full price, so the whole path stays dark until
 * all of it is live. Both place_order and preview_voucher read this flag
 * themselves, so the screen showing it is a courtesy and not the gate.
 */
export async function getVouchersEnabled(): Promise<boolean> {
  const supabase = await createStaffClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("vouchers_enabled")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("[workspace] voucher flag read failed:", error.message);
    return false;
  }
  return data?.vouchers_enabled === true;
}
