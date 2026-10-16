import { z } from "zod";
import type { VoucherStatus } from "@/lib/vouchers/status";

/**
 * The owner's storefront order for promo codes (migration 0078), as the
 * workspace reads and writes it.
 *
 * Kept out of the "use server" actions file so it can be unit tested: that
 * file may only export async functions, and AGENTS.md rule 6 records what
 * happens to logic nothing can test.
 */

/** The payload the order panel posts: every placed code, first to last. */
export const voucherOrderSchema = z.array(z.uuid()).max(200);

/**
 * Parse the panel's `order` field, a JSON array of ids.
 *
 * An empty array is meaningful ("back to automatic") and is accepted; a
 * missing or malformed field is not, because reading it as empty would wipe
 * the owner's order on a broken request.
 */
export function parseVoucherOrder(
  raw: FormDataEntryValue | null,
): { ok: true; ids: string[] } | { ok: false } {
  if (typeof raw !== "string") return { ok: false };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  const parsed = voucherOrderSchema.safeParse(value);
  if (!parsed.success || new Set(parsed.data).size !== parsed.data.length) {
    return { ok: false };
  }
  return { ok: true, ids: parsed.data };
}

export type OrderableVoucher = {
  id: string;
  code: string;
  publicise: boolean;
  status: VoucherStatus;
  /** Null is "not placed", never rank 0. */
  displayPriority: number | null;
  /** Null is "never ends". */
  expiresAt: string | null;
};

/**
 * The advertised codes in the order the storefront lists them.
 *
 * The same three keys list_customer_promos sorts on, in the same order:
 * placed codes by rank, then unplaced codes soonest ending first (a code that
 * never ends goes last), then by code. The panel draws this list, so what the
 * owner sees here is what customers see, minus whatever is not live.
 *
 * One addition the database does not need: among UNPLACED codes, the ones
 * customers cannot currently see (scheduled, ended, used up, switched off) go
 * after the live ones. The database never lists them, so their place among
 * the unplaced is not something any customer sees, and sorting an ended code
 * by its end date put it at number one, above every promo that is running.
 * Placed codes keep the owner's rank whatever their status.
 */
export function storefrontOrder<T extends OrderableVoucher>(vouchers: readonly T[]): T[] {
  const ends = (v: OrderableVoucher) =>
    v.expiresAt === null ? Number.POSITIVE_INFINITY : new Date(v.expiresAt).getTime();
  return vouchers
    .filter((v) => v.publicise)
    .toSorted((a, b) => {
      if (a.displayPriority !== b.displayPriority) {
        if (a.displayPriority === null) return 1;
        if (b.displayPriority === null) return -1;
        return a.displayPriority - b.displayPriority;
      }
      if (a.displayPriority === null) {
        const aLive = a.status === "active";
        if (aLive !== (b.status === "active")) return aLive ? -1 : 1;
      }
      const byEnd = ends(a) - ends(b);
      if (byEnd !== 0) return byEnd;
      return a.code.localeCompare(b.code);
    });
}

/**
 * The code customers see as featured: the first placed code that is live.
 *
 * Null while nothing is placed, which is how the storefront behaves too. A
 * placed code that is scheduled, expired, used up or switched off is skipped,
 * because customers never see it and so it cannot be what leads.
 */
export function featuredVoucherId(ordered: readonly OrderableVoucher[]): string | null {
  return ordered.find((v) => v.displayPriority !== null && v.status === "active")?.id ?? null;
}

/** The list with one code moved one place, for the panel's Up and Down. */
export function moveVoucher<T extends { id: string }>(
  list: readonly T[],
  id: string,
  direction: -1 | 1,
): T[] {
  const from = list.findIndex((v) => v.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

type RankedVoucher = { id: string; status: VoucherStatus; displayPriority: number | null };

/**
 * The whole order after one LIVE code moves, for a panel that shows only live
 * codes.
 *
 * The panel hides codes customers cannot see (scheduled, ended, used up,
 * switched off), but admin_set_voucher_order un-ranks every placed code the
 * posted list leaves out. Posting only the visible codes would quietly throw
 * away a scheduled campaign's place the first time anything above it moved.
 *
 * So the move happens among the live codes only, every hidden code keeps the
 * slot it holds in `full`, and the result is renumbered. Live codes are all
 * placed (that is what moving means, as before); a hidden code keeps a rank
 * only if it already had one, so an ended code nobody placed stays unplaced.
 * The ids to post are the rows whose displayPriority is not null, in order.
 */
export function moveLiveVoucher<T extends RankedVoucher>(
  full: readonly T[],
  id: string,
  direction: -1 | 1,
): T[] {
  const moved = moveVoucher(
    full.filter((v) => v.status === "active"),
    id,
    direction,
  );
  let next = 0;
  let rank = 0;
  return full
    .map((v) => (v.status === "active" ? moved[next++] : v))
    .map((v) =>
      v.status === "active" || v.displayPriority !== null
        ? { ...v, displayPriority: ++rank }
        : v,
    );
}

/**
 * When the next advertised code goes live or ends, as epoch milliseconds, or
 * null if no date ahead would change what the storefront shows.
 *
 * The panel refreshes itself at that moment, so a code drops out of (or into)
 * the order on its own date without anybody reloading the page. Used up is
 * not a date and cannot be scheduled; it shows on the next page load.
 */
export function nextStatusChange(
  vouchers: readonly { startsAt: string | null; expiresAt: string | null }[],
  now: number = Date.now(),
): number | null {
  let soonest: number | null = null;
  for (const v of vouchers) {
    for (const at of [v.startsAt, v.expiresAt]) {
      // Null is "live already" or "never ends", never a moment.
      if (at === null) continue;
      const ms = new Date(at).getTime();
      if (ms > now && (soonest === null || ms < soonest)) soonest = ms;
    }
  }
  return soonest;
}
