import type { Branch } from "@/lib/catalog/types";

/**
 * A branch as `get_orderable_branches()` returns it: one that is live and can
 * therefore be chosen.
 *
 * Two booleans rather than one, because they fail differently and the customer
 * has to be told which. `isOpenNow` false means come back later, and the store
 * stays selectable because its windows may still fall inside the horizon.
 * `acceptsOrdersNow` false means this counter is not taking anything today.
 */
export type OrderableBranch = {
  slug: string;
  name: string;
  shortName: string;
  format: Branch["format"];
  addressLine: string;
  city: string;
  phones: string[];
  /** IANA zone. Every window on this branch is formatted through it. */
  timezone: string;
  slotMinutes: number;
  prepMinutes: number;
  acceptsOrdersNow: boolean;
  isOpenNow: boolean;
};

/**
 * Why a store cannot be ordered from, when it cannot be.
 *
 * `offline` is the expected answer for eight of the nine counters and is not a
 * fault: they are real shops with real phone numbers that this platform has
 * not been switched on for. Saying so, with the number, is the whole point of
 * listing them.
 */
export type StoreBlockedReason =
  /** Not on online ordering yet. Call them. */
  | "offline"
  /** Live, but the accepting-orders switch is off right now. */
  | "not_accepting";

/**
 * One counter, as the storefront thinks about it.
 *
 * The merge of two sources that answer two different questions. The catalog
 * says which shops exist and how to phone them, which is published fact and
 * does not need a database. The RPC says which of them can take an order
 * today, which is operational truth and cannot come from anywhere else.
 */
export type Store = {
  slug: string;
  name: string;
  shortName: string;
  format: Branch["format"];
  addressLine: string;
  city: string;
  phones: string[];
  /** Present only for a store the platform is live on. */
  branch: OrderableBranch | null;
  /** Whether a customer may choose this store and reach checkout on it. */
  orderable: boolean;
  /** Null exactly when `orderable` is true. */
  blockedReason: StoreBlockedReason | null;
  /** Live but shut at this minute. Still selectable: later windows may exist. */
  closedNow: boolean;
};

/**
 * The answer to "make this my counter".
 *
 * Declared here rather than in `app/actions/store.ts` because that file
 * carries "use server", and a `"use server"` module may export only async
 * functions. A type export there type-checks, passes the unit tests, and then
 * fails `next build`, which is the trap AGENTS.md names explicitly.
 */
export type ChooseStoreResult =
  | { ok: true; shortName: string }
  | { ok: false; error: string };
