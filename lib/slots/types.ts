/**
 * Pickup windows, as `get_pickup_slots()` returns them.
 *
 * Times are ISO strings rather than Dates because they cross a server to
 * client boundary and a Date does not survive that intact. Everything that
 * formats one is handed the branch's timezone explicitly: these windows are
 * the shop's local clock, not the customer's, and somebody ordering from
 * Manila must still read a Cebu closing time.
 */

export type PickupBranch = {
  slug: string;
  name: string;
  shortName: string;
  /** IANA zone. Every format call takes this; none of them infer it. */
  timezone: string;
  slotMinutes: number;
  prepMinutes: number;
};

export type PickupSlot = {
  startsAt: string;
  endsAt: string;
  capacity: number;
  reserved: number;
  /** Never negative. A full window is shown and disabled, not hidden. */
  remaining: number;
};

/**
 * Why there is nothing to choose from, when there is nothing to choose from.
 *
 * An empty list on its own is indistinguishable from a broken page, and two of
 * these are the *expected* state of this project rather than faults:
 * `no_branch` and `no_hours` are open questions 1 and 2 in spec section 28,
 * and only the owner can close them.
 */
export type SlotUnavailableReason =
  /** No branch is live yet. Nobody has said which one is the pilot. */
  | "no_branch"
  /** The branch or the whole platform has orders switched off. */
  | "not_accepting"
  /** The branch is live but its weekly hours have never been entered. */
  | "no_hours"
  /** It has hours, and none of them fall inside the horizon. Shut for now. */
  | "closed_now"
  /** Windows exist and every one of them is at capacity. */
  | "fully_booked";

export type PickupSlots = {
  /** Null only when no branch is live at all. */
  branch: PickupBranch | null;
  /** The server's clock when this was generated. The clock everything reads. */
  generatedAt: string;
  horizonHours: number | null;
  slots: PickupSlot[];
  unavailableReason: SlotUnavailableReason | null;
};
