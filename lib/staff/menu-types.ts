import type { MenuImageOrigin } from "@/lib/menu/resolve-image";

/**
 * Every type the menu management screens share.
 *
 * Nothing here imports server-only, because the client components in
 * app/(workspace)/workspace/menu import from this file. The reader lives in
 * lib/staff/menu.ts and is server only. Same split as availability-types.ts.
 */

export type HoldKind = "today" | "until" | "indefinite";

export type ManagedHold = {
  branchId: string;
  branchShortName: string;
  kind: HoldKind;
  /** ISO 8601, or null for an indefinite hold. */
  unavailableUntil: string | null;
};

export type ManagedVariation = {
  id: string;
  slug: string;
  label: string;
  shortLabel: string;
  priceCents: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type ManagedOption = {
  id: string;
  groupId: string;
  slug: string;
  name: string;
  description: string | null;
  /**
   * Null means this option has no flat price and is priced per variation
   * through menu_option_variation_prices. It does NOT mean free, and nothing
   * may coalesce it to zero. See the comment on menu_options.price_cents.
   */
  priceCents: number | null;
  heatPercent: number | null;
  image: ManagedImage | null;
  isActive: boolean;
  sortOrder: number;
};

/**
 * A menu row's photograph as the workspace needs to think about it.
 *
 * origin is not decoration. An archive photograph is one this repository
 * ships and the storefront is already drawing; an uploaded one is a file in
 * Storage for this row alone. The workspace used to know only about the
 * second kind and so reported "no photo" for every row showing the first.
 * See lib/menu/resolve-image.ts.
 */
export type ManagedImage = {
  src: string;
  origin: MenuImageOrigin;
  /**
   * The picture a new crop is taken from, which is not the same file as src.
   *
   * src is the finished 900px tile. Cropping that again could only ever
   * tighten it, because everything outside the crop was discarded when it was
   * written. This is the uncropped photograph: the original kept beside an
   * upload, or, for an archive row, the committed derivative that is itself
   * the source. Null when neither exists, which is every photograph uploaded
   * before originals were kept.
   */
  editableSrc: string | null;
};

export type ManagedOptionGroup = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  options: ManagedOption[];
  /** Item ids this group is linked to, for the "used by" line. */
  linkedItemIds: string[];
};

export type ManagedItemOptionLink = {
  groupId: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
};

export type ManagedItem = {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  code: string | null;
  description: string | null;
  image: ManagedImage | null;
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
  variations: ManagedVariation[];
  optionLinks: ManagedItemOptionLink[];
  /** One per branch that currently holds this item. Empty when nothing holds it. */
  holds: ManagedHold[];
  /**
   * What each per size priced option costs on each of this item's sizes,
   * keyed option id then variation id. Absent pairs are genuinely unpriced and
   * resolve to the option's own price_cents, which for these options is null.
   */
  optionVariationPrices: Record<string, Record<string, number>>;
};

export type ManagedCategory = {
  id: string;
  slug: string;
  name: string;
  blurb: string | null;
  isActive: boolean;
  sortOrder: number;
  items: ManagedItem[];
};

export type ManagedBranch = {
  id: string;
  shortName: string;
};

export type ManagedMenu = {
  categories: ManagedCategory[];
  optionGroups: ManagedOptionGroup[];
  /**
   * Every branch the staff session can read, not just the ones the caller may
   * act on. "staff read branches" in 0009 is `for select using (is_staff())`
   * with no branch scope, and PostgREST cannot filter on
   * current_staff_can_access_branch, so this select always returns all nine.
   * The hold control's branch picker uses this list for a roving manager, and
   * a cashier ignores it and uses their own profile.branchId instead. The RPC
   * that writes a hold is what actually refuses a branch the caller may not
   * act on.
   */
  branches: ManagedBranch[];
};

/** The shape every Server Action in this feature returns. */
export type MenuActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export const HOLD_KIND_LABELS: Record<HoldKind, string> = {
  today: "Sold out for today",
  until: "Sold out until a time you pick",
  indefinite: "Sold out until someone puts it back",
};

/** What the row says under an item that is held somewhere. */
export function holdSummary(holds: ManagedHold[]): string | null {
  if (holds.length === 0) return null;
  const names = holds.map((hold) => hold.branchShortName).join(", ");
  return `Sold out at ${names}`;
}
