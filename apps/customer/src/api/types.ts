/**
 * The read models the app receives, described only as far as the app reads
 * them.
 *
 * Deliberately narrower than the server's own types. The app renders a menu, a
 * grid of pickup windows and one order; it has no opinion about anything else
 * in those payloads, and typing fields it does not use would turn every server
 * addition into an app change.
 *
 * Every money field below is a display value. The app never sends one back, and
 * it never adds a server total to a locally computed one.
 */

export type MenuImage = {
  src: string;
  width: number;
  height: number;
  blurDataURL: string;
  treatment?: string | null;
  source?: string | null;
};

export type MenuVariation = {
  slug: string;
  name: string;
  shortName: string;
  priceCents: number;
};

export type MenuOption = {
  slug: string;
  name: string;
  description: string | null;
  /** Null means the variation decides. See variationPriceCents. */
  priceCents: number | null;
  /** Price per variation slug, which is how heat is priced by wing size. */
  variationPriceCents: Record<string, number>;
  heatPercent: number | null;
  image: MenuImage | null;
};

export type MenuOptionGroup = {
  slug: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: MenuOption[];
};

export type MenuItem = {
  slug: string;
  name: string;
  code: string | null;
  description: string | null;
  categorySlug: string;
  featured: boolean;
  pricingNote: string | null;
  image: MenuImage | null;
  variations: MenuVariation[];
  optionGroups: MenuOptionGroup[];
};

export type MenuCategory = {
  slug: string;
  name: string;
  blurb: string;
  items: MenuItem[];
};

export type StorefrontMenu = {
  categories: MenuCategory[];
  /**
   * "static" means the server answered from its build-time catalog because no
   * database was configured. The prices are a published list rather than a live
   * one, and an order placed against them will be repriced or refused.
   */
  source: "database" | "static";
};

export type PickupSlot = {
  startsAt: string;
  endsAt: string;
  capacity: number;
  reserved: number;
  remaining: number;
};

export type PickupBranch = {
  slug: string;
  name: string;
  shortName: string;
  timezone: string;
  slotMinutes: number;
  prepMinutes: number;
};

export type PickupSlots = {
  branch: PickupBranch | null;
  generatedAt: string;
  horizonHours: number | null;
  slots: PickupSlot[];
  unavailableReason:
    | "no_branch"
    | "not_accepting"
    | "no_hours"
    | "closed_now"
    | "fully_booked"
    | null;
};

/** What the app may send as an order. Note that nothing here is money. */
export type PlaceOrderRequest = {
  attemptId: string;
  branchSlug: string | null;
  pickupSlotStart: string;
  details: { name: string; phone: string; email: string; notes: string };
  paymentMethod: "qrph" | "gcash" | "maya" | "card" | "counter";
  lines: {
    itemSlug: string;
    variationSlug: string;
    quantity: number;
    options: { groupSlug: string; optionSlug: string }[];
  }[];
};

export type PlacedOrder = {
  orderId: string;
  shortCode: string;
  /** Bearer credential. Keep it out of logs, URLs and analytics. */
  trackingToken: string;
  pickupCode: string;
  status: string;
  paymentMethod: string;
  pickupSlotStart: string;
  pickupSlotEnd: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  branch: { slug: string; name: string; shortName: string; timezone: string };
};

export type OrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready"
  | "claimed"
  | "rejected"
  | "cancelled"
  | "no_show";

export type TrackedOrder = {
  shortCode: string;
  status: OrderStatus;
  placedAt: string;
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
  items: {
    name: string;
    variationLabel: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    notes: string | null;
    options: { group: string; name: string; priceCents: number; heatPercent: number | null }[];
  }[];
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
