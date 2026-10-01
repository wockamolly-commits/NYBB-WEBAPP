import type { Store } from "./types";

/**
 * Which counter is nearest the customer, worked out from where their device
 * says they are.
 *
 * This module is pure. Nothing here is sent anywhere, stored or logged. The
 * suggestion is a convenience, and a convenience is not worth a shop keeping a
 * record of where its customers stand.
 *
 * MEASURED BY ROAD WHERE WE CAN, ESTIMATED WHERE WE CANNOT.
 *
 * Customers hold these numbers up against Google Maps, which measures the
 * road, so a straight line reads as the page being wrong. The road distance
 * is the length of Mapbox's driving route to each counter, through
 * `app/actions/road-distances.ts`, which sends the position for that lookup
 * and keeps it nowhere. Until it answers, or if
 * it cannot, each row shows the straight line stretched by a fixed road
 * factor, and says "about" to mark it as the estimate it is.
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

/** Kilometres by road, the length of each Mapbox route, keyed by slug. A counter it could not route is absent. */
export type MeasuredKm = Record<string, number>;

/**
 * The road distance to every counter that has a pin, keyed by slug: measured
 * where Mapbox answered for it, estimated from the straight line otherwise.
 *
 * Orderable or not: a phone-only counter round the corner is worth knowing
 * about even though it cannot be chosen here. A counter with no pin is absent
 * rather than guessed, even if a measurement came back for it.
 */
export function distancesBySlug(
  stores: Store[],
  from: LatLng,
  measured: MeasuredKm | null = null,
): Map<string, number> {
  const distances = new Map<string, number>();
  for (const store of stores) {
    if (!store.pin) continue;
    distances.set(store.slug, measured?.[store.slug] ?? roadKm(from, store.pin));
  }
  return distances;
}

export type NearestSuggestion =
  /** A counter to offer, within reach. `measured` when Mapbox gave the km. */
  | { kind: "nearest"; store: Store; km: number; measured: boolean }
  /** The nearest orderable counter is past the cutoff. Named, not offered. */
  | { kind: "far"; store: Store; km: number; measured: boolean }
  /** No orderable counter has a pin to measure to. */
  | { kind: "none" };

/**
 * The nearest counter that can take an order.
 *
 * Only orderable counters, because what the suggestion offers is a button that
 * chooses this counter for the order. Read from the same distances the rows
 * show, so the suggestion and the top of the list always agree. On a tie the
 * earlier store wins, which keeps the order the business publishes its
 * counters in.
 */
export function suggestNearest(
  stores: Store[],
  distances: Map<string, number>,
  measured: MeasuredKm | null = null,
): NearestSuggestion {
  let best: { store: Store; km: number } | null = null;

  for (const store of stores) {
    const km = distances.get(store.slug);
    // A counter shut at this minute cannot be chosen, so it is not suggested.
    if (!store.orderable || store.closedNow || km === undefined) continue;
    if (!best || km < best.km) best = { store, km };
  }

  if (!best) return { kind: "none" };
  return {
    kind: best.km <= RECOMMEND_WITHIN_KM ? "nearest" : "far",
    ...best,
    measured: measured?.[best.store.slug] !== undefined,
  };
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
 * The line a counter row carries: "2.3 km away by road" when Mapbox measured
 * it, "About 2.3 km away by road" while it is the estimate, and "Under 100 m
 * away" where the road makes no difference worth naming.
 */
export function distanceLabel(km: number, measured = false): string {
  if (km < 0.1) return "Under 100 m away";
  const label = `${formatDistance(km)} away by road`;
  return measured ? label : `About ${label}`;
}
