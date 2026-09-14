import { branchFormatLabel } from "@/lib/catalog/branches";
import type { Branch } from "@/lib/catalog/types";
import { summarizeWeek, weekdayIn, weekFor, type DayHours, type StoreHoursRow } from "./hours";
import { directionsUrl, mapEmbedUrl } from "./map";
import type { Store } from "./types";

/**
 * One counter as its detail sheet shows it: map, address, phones and week.
 *
 * Built here rather than on a page because two pages open the same sheet. The
 * Branches directory opens it from any of its cards, and the counter picker
 * opens it from the nearest-counter suggestion. Both have to agree on which
 * name wins and where the map points, and that agreement is easier to keep in
 * one function with a test than in two pages that drift.
 *
 * Pure, and free of `server-only`, because the type is read by the client
 * sheet and the function is tested without a database.
 */
export type BranchEntry = {
  slug: string;
  shortName: string;
  formatLabel: string;
  addressLine: string;
  city: string;
  phones: string[];
  mapUrl: string;
  directionsUrl: string;
  /** False when the map is drawn from the street address rather than a pin. */
  pinned: boolean;
  /** Null when the counter's week is not published, or could not be read. */
  week: DayHours[] | null;
  /**
   * True when the hours read itself failed, so a null `week` says nothing
   * about whether this counter has a schedule and must not claim it has none.
   */
  hoursUnavailable: boolean;
  /** One line for the card, or null when the week cannot be one line. */
  summary: string | null;
  /** Null for a counter this platform is not live on, where nobody can say. */
  openNow: boolean | null;
  /** Today's weekday where the counter is, 0 for Sunday. */
  today: number;
};

/**
 * Every catalog counter, merged with what the database knows about it.
 *
 * `hours` is null when the read failed, never an empty list, so a failed read
 * is not rendered as a counter with no schedule. See `getStoreHours`.
 */
export function branchEntries(
  catalog: Branch[],
  stores: Store[],
  hours: StoreHoursRow[] | null,
): BranchEntry[] {
  const bySlug = new Map(stores.map((store) => [store.slug, store]));

  return catalog.map((branch) => {
    const live = bySlug.get(branch.slug)?.branch ?? null;
    const week = hours ? weekFor(hours, branch.slug) : null;

    return {
      slug: branch.slug,
      // The workspace can rename a live branch without a deploy, so the
      // database's name wins wherever it has one. The address and the pin
      // stay the catalog's, because the map has to agree with the street.
      shortName: live?.shortName ?? branch.shortName,
      formatLabel: branchFormatLabel[branch.format],
      addressLine: branch.addressLine,
      city: branch.city,
      phones: live?.phones.length ? live.phones : branch.phones,
      mapUrl: mapEmbedUrl(branch),
      directionsUrl: directionsUrl(branch),
      pinned: Boolean(branch.pin),
      week,
      hoursUnavailable: hours === null,
      summary: summarizeWeek(week),
      openNow: live ? live.isOpenNow : null,
      today: weekdayIn(live?.timezone ?? "Asia/Manila"),
    };
  });
}
