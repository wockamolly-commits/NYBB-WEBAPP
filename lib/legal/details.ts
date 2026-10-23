/**
 * The facts the Privacy Policy and the Terms of Service need from the owner.
 *
 * Everything the pages say about what the site collects, where it is kept and
 * who processes it was read from the code. These are the parts the code cannot
 * know, and they are deliberately not guessed. Null means "not supplied yet",
 * never an empty answer: the pages render a visible placeholder for every null
 * and carry a draft notice until there are none left. See `pendingDetails`.
 *
 * Fill a value here and both pages pick it up. Nothing else needs editing.
 *
 * A note on the business name. The footer, About, Contact and the franchise
 * page already name Five Brad Dragons Food Franchise Corporation at Latitude
 * Corporate Center, Cebu Business Park. That is the franchisor as the old site
 * presented it, and it is not copied here on purpose: a privacy policy names
 * the personal information controller, the entity registered with the NPC,
 * and whether that is the franchisor, a branch operator, or both is a question
 * for the owner (and their lawyer), not something to infer from a footer.
 */

export type LegalDetails = {
  /** The registered business name of the personal information controller. */
  businessName: string | null;
  /** Its registered address, in full. */
  businessAddress: string | null;
  /** The Data Protection Officer's name, as registered with the NPC. */
  dpoName: string | null;
  /** Where data subjects reach the DPO. An email is the usual minimum. */
  dpoEmail: string | null;
  dpoPhone: string | null;
  /**
   * How long each kind of record is kept. The site deletes nothing on a
   * schedule today, so this is a decision to be made, not a fact to report.
   */
  retentionPolicy: string | null;
  /** Refunds: when a paid order is refunded, in full or in part, and how fast. */
  refundPolicy: string | null;
  /** Uncollected orders (spec section 28, item 5b). Not decided as of 2026-10-21. */
  noShowPolicy: string | null;
  /** Whether a customer may cancel a paid order, and until when. */
  cancellationPolicy: string | null;
  /** The date the published text takes effect, as YYYY-MM-DD. */
  effectiveDate: string | null;
};

export const legalDetails: LegalDetails = {
  businessName: null,
  businessAddress: null,
  dpoName: null,
  dpoEmail: null,
  dpoPhone: null,
  retentionPolicy: null,
  refundPolicy: null,
  noShowPolicy: null,
  cancellationPolicy: null,
  effectiveDate: null,
};

/** Every detail still waiting on the owner, by field name. */
export function pendingDetails(details: LegalDetails): (keyof LegalDetails)[] {
  return (Object.keys(details) as (keyof LegalDetails)[]).filter(
    (key) => details[key] === null || details[key]?.trim() === "",
  );
}

/**
 * The NPC "DPO/DPS Registered" seal.
 *
 * TO SWAP IN A RENEWED SEAL: replace components/legal/npc-dpo-dps-seal.jpg
 * with the new file (same name) and change `validThrough` to the date printed
 * under VALIDITY PERIOD. Nothing else. The image is a static import, so its
 * URL carries a content hash and no cache can keep serving the old one, and
 * its dimensions are read from the file.
 *
 * The page stops showing the seal the day after `validThrough`, in Manila
 * time. A seal printed with a date that has passed tells a visitor the
 * registration has lapsed, which is worse than showing none, so an overdue
 * renewal makes the seal disappear rather than go stale.
 */
export const npcSeal = {
  validThrough: "2026-10-28",
} as const;

/** True while `validThrough` is today or later, on the Manila calendar. */
export function isSealCurrent(validThrough: string, now: Date): boolean {
  // The Philippines is UTC+8 all year, the same literal offset
  // lib/staff/manila-dates.ts uses.
  const manilaToday = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(validThrough) && manilaToday <= validThrough;
}
