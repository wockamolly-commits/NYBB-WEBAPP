"use server";

import { headers } from "next/headers";
import { branches } from "@/lib/catalog";
import { RECOMMEND_WITHIN_KM, distanceKm } from "@/lib/branches/nearest";
import { roadRoutes, roadRoutesConfigured } from "@/lib/branches/road";
import { originSchema, type RoadRoute } from "@/lib/branches/road-route";
import { clientAddress } from "@/lib/rate-limit/address";
import { withinAddressLimit } from "@/lib/rate-limit/limiter";

/**
 * The driving route from where the customer is standing to every counter.
 *
 * One call serves both store pages: the length of each route is the distance
 * a row shows, and its line is what the counter's map draws, so the two can
 * never disagree and opening a sheet costs no further request.
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
export async function fetchRoadRoutes(
  position: unknown,
): Promise<Record<string, RoadRoute> | null> {
  if (!roadRoutesConfigured()) return null;

  const origin = originSchema.safeParse(position);
  if (!origin.success) return null;

  const destinations = branches.flatMap((branch) =>
    branch.pin ? [{ slug: branch.slug, pin: branch.pin }] : [],
  );

  const inReach = destinations.some(
    (destination) => distanceKm(origin.data, destination.pin) <= RECOMMEND_WITHIN_KM,
  );
  if (!inReach) return null;

  // Each call is one Mapbox request per pinned counter. Generous enough for
  // an office sharing one connection, low enough that a script cannot empty
  // the free tier.
  const allowed = await withinAddressLimit({
    action: "road_routes",
    address: clientAddress(await headers()),
    limit: 20,
    windowSeconds: 600,
  });
  if (!allowed) return null;

  return roadRoutes(origin.data, destinations);
}
