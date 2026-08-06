/**
 * One order, as the customer holding it sees it.
 *
 * Every string in here came out of a snapshot column rather than off the live
 * menu, which is the point of those columns: a receipt has to keep describing
 * the thing that was actually bought, at the price actually charged, however
 * the menu has been edited since.
 */

/** Spec section 12. The enum in migration 0001, in the same order. */
export type OrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready"
  | "claimed"
  | "rejected"
  | "cancelled"
  | "no_show";

export type TrackedOption = {
  group: string;
  name: string;
  priceCents: number;
  /** 0 to 100 for the Level of Hotness, null for everything else. */
  heatPercent: number | null;
};

export type TrackedItem = {
  name: string;
  variationLabel: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  notes: string | null;
  options: TrackedOption[];
};

export type TrackedOrder = {
  shortCode: string;
  status: OrderStatus;
  placedAt: string;
  /** The four digit counter code. The reason this page needs a token. */
  pickupCode: string;
  pickup: { startsAt: string; endsAt: string } | null;
  branch: {
    slug: string;
    name: string;
    shortName: string;
    timezone: string;
    addressLine: string;
    city: string;
    phones: string[];
  };
  customer: { name: string; phone: string; email: string | null };
  items: TrackedItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  notes: string | null;
  payment: {
    method: string;
    status: string;
    amountCents: number;
    paidAt: string | null;
  } | null;
  /**
   * Every lifecycle stamp. A null is not missing data, it is a step that has
   * not happened, which is what lets the page say what is still ahead.
   */
  timeline: {
    acceptedAt: string | null;
    preparingAt: string | null;
    readyAt: string | null;
    claimedAt: string | null;
    rejectedAt: string | null;
    rejectedReason: string | null;
    cancelledAt: string | null;
    cancelledReason: string | null;
    customerArrivedAt: string | null;
    noShowAt: string | null;
  };
};
