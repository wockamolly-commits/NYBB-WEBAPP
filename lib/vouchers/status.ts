import { formatPeso } from "@/lib/format";

/**
 * What a voucher's row says about itself, and how it reads in a sentence.
 *
 * Both of these are pure and live outside any `"use server"` file, so they are
 * unit tested rather than checked by opening the screen. That is the same
 * reasoning `lib/staff/menu-schemas.ts` records: the heat_percent bug survived
 * lint, types, 900 tests and a production build precisely because the logic
 * that was wrong had no place it could be tested from.
 */

export type VoucherStatus = "disabled" | "expired" | "exhausted" | "scheduled" | "active";

/** What a voucher needs to carry for its status to be decidable. */
export type VoucherStatusInput = {
  isActive: boolean;
  /** Null means live from creation. Never default this to now. */
  startsAt: string | null;
  /** Null means it never expires. */
  expiresAt: string | null;
  /** Null means unlimited. Zero would mean unusable, which is not the same. */
  maxUses: number | null;
  usesCount: number;
};

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> = {
  disabled: "Off",
  expired: "Expired",
  exhausted: "Used up",
  scheduled: "Scheduled",
  active: "Live",
};

/**
 * The single word the list column shows.
 *
 * THE ORDER IS THE INTERESTING PART, because a voucher can be several of these
 * at once and the column has room for one. A code that was switched off in
 * March and also expired in April is both, and the question somebody scanning
 * this list is asking is "why is this not working, and what do I do about it".
 *
 * So the switch comes first: it is the only one of these an admin set
 * deliberately, and the only one a single click can undo. Then expiry, then the
 * cap, then a start date in the future, because those three are facts about the
 * code rather than decisions about it, and the first of them that is true is the
 * one that would still stop it if the others were fixed.
 */
export function voucherStatus(
  voucher: VoucherStatusInput,
  now: Date = new Date(),
): VoucherStatus {
  if (!voucher.isActive) return "disabled";

  const at = now.getTime();
  if (voucher.expiresAt !== null && new Date(voucher.expiresAt).getTime() <= at) {
    return "expired";
  }
  // Null is unlimited. Reading it as a number here is the trap spec section 18
  // names: a null turned into 0 makes every open promo code report itself as
  // used up on the day it is created.
  if (voucher.maxUses !== null && voucher.usesCount >= voucher.maxUses) {
    return "exhausted";
  }
  if (voucher.startsAt !== null && new Date(voucher.startsAt).getTime() > at) {
    return "scheduled";
  }
  return "active";
}

/** Whether the code would be refused right now, whatever the reason. */
export function isRedeemableNow(voucher: VoucherStatusInput, now: Date = new Date()): boolean {
  return voucherStatus(voucher, now) === "active";
}

/** "3 of 100" or "3, no limit". Null max_uses is unlimited, never zero. */
export function usageLabel(usesCount: number, maxUses: number | null): string {
  return maxUses === null ? `${usesCount}, no limit` : `${usesCount} of ${maxUses}`;
}

export type VoucherSummaryInput = {
  amountCents: number | null;
  percentOff: number | null;
  maxDiscountCents: number | null;
  minOrderCents: number;
  branchNames: readonly string[];
  itemNames: readonly string[];
  categoryNames: readonly string[];
  customerCount: number;
};

/** "and" lists, so a scope reads as a sentence rather than as a CSV. */
function joinNames(names: readonly string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The voucher as one sentence, shown above the form as it is edited.
 *
 * Scope is the part an admin gets wrong, and six controls spread down a form do
 * not tell anybody what they add up to. A sentence does, and it can be checked
 * against what the promotion was supposed to be in about a second.
 *
 * Empty lists are silence rather than "everywhere", because a sentence that
 * recited every dimension a voucher does not restrict would bury the one or two
 * it does.
 */
export function voucherSummary(voucher: VoucherSummaryInput): string {
  const parts: string[] = [];

  if (voucher.percentOff !== null) {
    const capped =
      voucher.maxDiscountCents !== null
        ? `, up to ${formatPeso(voucher.maxDiscountCents)}`
        : "";
    parts.push(`${voucher.percentOff}% off${capped}`);
  } else if (voucher.amountCents !== null) {
    parts.push(`${formatPeso(voucher.amountCents)} off`);
  } else {
    // Neither set is a half-filled form, not a voucher. The database refuses
    // it; this says so while it is still being typed.
    return "Choose a fixed amount or a percentage.";
  }

  const what = [...voucher.itemNames, ...voucher.categoryNames];
  parts.push(what.length > 0 ? `on ${joinNames(what)}` : "on the whole order");

  if (voucher.branchNames.length > 0) parts.push(`at ${joinNames(voucher.branchNames)}`);
  if (voucher.minOrderCents > 0) {
    parts.push(`once that reaches ${formatPeso(voucher.minOrderCents)}`);
  }
  if (voucher.customerCount > 0) {
    parts.push(
      voucher.customerCount === 1
        ? "for one named customer"
        : `for ${voucher.customerCount} named customers`,
    );
  }

  return `${parts.join(", ")}.`;
}
