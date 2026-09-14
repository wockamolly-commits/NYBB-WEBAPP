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
 * STRAIGHT LINE, AND THE COPY SAYS SO.
 *
 * Road distance would need a routing service, which is a third party this
 * site's Content Security Policy keeps out and a place the location would have
 * to be sent. Across Cebu City a straight line ranks counters the same way the
 * roads mostly do, and every distance on the page is written as "about".
 */

export type LatLng = { lat: number; lng: number };

/**
 * Past this, nothing is suggested.
 *
 * Every counter is on Cebu, and the furthest apart (North Gateway and Naga)
 * are well under fifty kilometres. Somebody further than this from every
 * counter is browsing from somewhere else, and a button offering to "collect
 * from here" a counter a flight away is the page not listening.
 */
export const RECOMMEND_WITHIN_KM = 50;

const EARTH_RADIUS_KM = 6371.0088;

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

/**
 * The distance to every counter that has a pin, keyed by slug.
 *
 * Orderable or not: a phone-only counter round the corner is worth knowing
 * about even though it cannot be chosen here. A counter with no pin is absent
 * rather than guessed.
 */
export function distancesBySlug(stores: Store[], from: LatLng): Map<string, number> {
  const distances = new Map<string, number>();
  for (const store of stores) {
    if (store.pin) distances.set(store.slug, distanceKm(from, store.pin));
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
    const km = distanceKm(from, store.pin);
    if (!best || km < best.km) best = { store, km };
  }

  if (!best) return { kind: "none" };
  return { kind: best.km <= RECOMMEND_WITHIN_KM ? "nearest" : "far", ...best };
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

/** The line a counter row carries: "About 2.5 km away", or "Under 100 m away". */
export function distanceLabel(km: number): string {
  if (km < 0.1) return "Under 100 m away";
  return `About ${formatDistance(km)} away`;
}
