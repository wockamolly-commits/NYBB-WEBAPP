"use client";

import { startTransition, useEffect, useState } from "react";
import { fetchRoadRoutes } from "@/app/actions/road-distances";
import type { LatLng, MeasuredKm } from "@/lib/branches/nearest";
import type { RoadRoute } from "@/lib/branches/road-route";

export type RoadRoutes = Record<string, RoadRoute>;

/**
 * The driving routes Mapbox found from this position, once they arrive.
 *
 * Null until then, and null for good when there is no answer (no token, a
 * failed request, a customer nowhere near Cebu), which leaves every row on its
 * estimate and every map on Google's frame. Keyed by the position it was asked
 * for, so an answer for where the customer stood a moment ago is never shown
 * against where they stand now. Pass null to ask for nothing.
 */
export function useRoadRoutes(position: LatLng | null): RoadRoutes | null {
  const key = position ? `${position.lat},${position.lng}` : null;
  const [answer, setAnswer] = useState<{ key: string; routes: RoadRoutes | null } | null>(null);

  useEffect(() => {
    if (!key || !position) return;
    // Already answered for this spot: a sheet closed and opened again.
    if (answer?.key === key) return;
    let current = true;
    startTransition(async () => {
      let routes: RoadRoutes | null = null;
      try {
        routes = await fetchRoadRoutes(position);
      } catch {
        // A network drop or a redeploy that retired the action. The estimate
        // is already on screen, so there is nothing to tell the customer.
      }
      if (current) setAnswer({ key, routes });
    });
    return () => {
      current = false;
    };
    // `position` is read through `key`, which changes exactly when it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return answer && answer.key === key ? answer.routes : null;
}

/** Each route's length, which is the distance a row shows. */
export function routeKm(routes: RoadRoutes | null): MeasuredKm | null {
  if (!routes) return null;
  return Object.fromEntries(Object.entries(routes).map(([slug, route]) => [slug, route.km]));
}
