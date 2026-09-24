"use server";

import { headers } from "next/headers";
import { branches } from "@/lib/catalog";
import { RECOMMEND_WITHIN_KM, distanceKm } from "@/lib/branches/nearest";
import { roadDistances, roadDistancesConfigured } from "@/lib/branches/road";
import { MAX_MATRIX_COORDINATES, originSchema } from "@/lib/branches/road-matrix";
import { clientAddress } from "@/lib/rate-limit/address";
import { withinAddressLimit } from "@/lib/rate-limit/limiter";

/**
 * How far each counter is by road from where the customer is standing.
 *
 * Only the position comes from the browser. The counters are read from the
 * catalog here, so a caller cannot use this to route between points of their
 * own choosing on this site's Mapbox account.
 *
 * Returns null whenever there is no road answer, and the page keeps its
 * estimate. That includes a customer who is nowhere near Cebu: the page will
 * not suggest a counter to them anyway, so there is nothing to spend a lookup
 * on.
 */
export async function fetchRoadDistances(
  position: unknown,
): Promise<Record<string, number> | null> {
  if (!roadDistancesConfigured()) return null;

  const origin = originSchema.safeParse(position);
  if (!origin.success) return null;

  const destinations = branches
    .flatMap((branch) => (branch.pin ? [{ slug: branch.slug, pin: branch.pin }] : []))
    .slice(0, MAX_MATRIX_COORDINATES - 1);

  const inReach = destinations.some(
    (destination) => distanceKm(origin.data, destination.pin) <= RECOMMEND_WITHIN_KM,
  );
  if (!inReach) return null;

  // Each lookup is nine billed pairs. Generous enough for an office sharing
  // one connection, low enough that a script cannot empty the free tier.
  const allowed = await withinAddressLimit({
    action: "road_distances",
    address: clientAddress(await headers()),
    limit: 20,
    windowSeconds: 600,
  });
  if (!allowed) return null;

  return roadDistances(origin.data, destinations);
}
