import type { Store } from "./types";

/**
 * Which counter is nearest the customer, worked out from where their device
 * says they are.
 *
 * THE LOCATION NEVER LEAVES THE BROWSER.
 *
 * This module is pure and is only ever called from a client component with a
 * position the browser handed over. Nothing here is sent to the server, stored
 * or logged, which is the same promise `lib/branches/map.ts` makes for
 * directions. The suggestion is a convenience, and a convenience is not worth
 * a shop keeping a record of where its customers stand.
 *
 * AN ESTIMATE OF THE ROAD, AND THE COPY SAYS SO.
 *
 * The true road distance for every row would need a routing service, which is
 * a third party this site's Content Security Policy keeps out and a place the
 * location would have to be sent nine times over. A bare straight line is the
 * other honest answer, but customers hold it up against Google Maps, which
 * measures the road, and read the gap as the page being wrong. So the straight
 * line is stretched by a fixed road factor and every distance is written as
 * "about ... by road". The factor is the same for every counter, so the order
 * the counters rank in is exactly the straight line order.
 */

export type LatLng = { lat: number; lng: number };

/**
 * Past this, nothing is suggested.
 *
 * Every counter is on Cebu, and the furthest apart (North Gateway and Naga)
 * are well under fifty kilometres even by road. Measured, like every distance
 * here, as the road estimate. Somebody further than this from every
 * counter is browsing from somewhere else, and a button offering to "collect
 * from here" a counter a flight away is the page not listening.
 */
export const RECOMMEND_WITHIN_KM = 50;

const EARTH_RADIUS_KM = 6371.0088;

/**
 * How much longer the road is than the straight line, on average.
 *
 * Urban road networks typically run 1.3 to 1.5 times the straight line
 * distance. Cebu City's grid is broken by the hills above Lahug, the rivers
 * and the reclaimed coast, so it sits toward the upper end. An average, so any
 * one trip can still come out shorter or longer on Google Maps.
 */
export const ROAD_FACTOR = 1.4;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great circle distance, by the haversine formula. */
export function distanceKm(from: LatLng, to: LatLng): number {
  const dLat = radians(to.lat - from.lat);
  const dLng = radians(to.lng - from.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** About how far it is by road: the straight line, stretched by the road factor. */
export function roadKm(from: LatLng, to: LatLng): number {
  return distanceKm(from, to) * ROAD_FACTOR;
}

/**
 * The estimated road distance to every counter that has a pin, keyed by slug.
 *
 * Orderable or not: a phone-only counter round the corner is worth knowing
 * about even though it cannot be chosen here. A counter with no pin is absent
 * rather than guessed.
 */
export function distancesBySlug(stores: Store[], from: LatLng): Map<string, number> {
  const distances = new Map<string, number>();
  for (const store of stores) {
    if (store.pin) distances.set(store.slug, roadKm(from, store.pin));
  }
  return distances;
}

export type NearestSuggestion =
  /** A counter to offer, within reach. */
  | { kind: "nearest"; store: Store; km: number }
  /** The nearest orderable counter is past the cutoff. Named, not offered. */
  | { kind: "far"; store: Store; km: number }
  /** No orderable counter has a pin to measure to. */
  | { kind: "none" };

/**
 * The nearest counter that can take an order.
 *
 * Only orderable counters, because what the suggestion offers is a button that
 * chooses this counter for the order. On a tie the earlier store wins, which
 * keeps the order the business publishes its counters in.
 */
export function suggestNearest(stores: Store[], from: LatLng): NearestSuggestion {
  let best: { store: Store; km: number } | null = null;

  for (const store of stores) {
    if (!store.orderable || !store.pin) continue;
    const km = roadKm(from, store.pin);
    if (!best || km < best.km) best = { store, km };
  }

  if (!best) return { kind: "none" };
  return { kind: best.km <= RECOMMEND_WITHIN_KM ? "nearest" : "far", ...best };
}

/**
 * Counters nearest first.
 *
 * A counter with no pin has no distance, so it goes after every counter that
 * has one rather than being ranked by a guess. Ties, and the unpinned among
 * themselves, keep the order they came in, which is the order the business
 * publishes its counters in. Returns a new array.
 */
export function rankByDistance<T extends { slug: string }>(
  stores: T[],
  distances: Map<string, number>,
): T[] {
  return stores
    .map((store, index) => ({ store, index, km: distances.get(store.slug) }))
    .sort((a, b) => {
      if (a.km === undefined || b.km === undefined) {
        if (a.km !== b.km) return a.km === undefined ? 1 : -1;
        return a.index - b.index;
      }
      return a.km - b.km || a.index - b.index;
    })
    .map(({ store }) => store);
}

const wholeKilometres = new Intl.NumberFormat("en-PH", {
  maximumFractionDigits: 0,
});

/**
 * A distance as a person says it.
 *
 * Coarse on purpose. A phone's position is often only good to tens of metres,
 * so "about 450 m" is as precise as the reading honestly is, and "0 m" is never
 * written for somebody who is merely close.
 */
export function formatDistance(km: number): string {
  if (km < 0.1) return "under 100 m";

  const metres = Math.round((km * 1000) / 50) * 50;
  if (metres < 1000) return `${metres} m`;

  if (km < 10) return `${Math.max(km, 1).toFixed(1)} km`;
  return `${wholeKilometres.format(km)} km`;
}

/**
 * The line a counter row carries: "About 2.5 km away by road", or "Under 100 m
 * away", where the road makes no difference worth naming.
 */
export function distanceLabel(km: number): string {
  if (km < 0.1) return "Under 100 m away";
  return `About ${formatDistance(km)} away by road`;
}
