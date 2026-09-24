"use client";

import { startTransition, useEffect, useState } from "react";
import { fetchRoadDistances } from "@/app/actions/road-distances";
import type { LatLng, MeasuredKm } from "@/lib/branches/nearest";

/**
 * The road distances Mapbox measured from this position, once they arrive.
 *
 * Null until then, and null for good when there is no answer (no token, a
 * failed request, a customer nowhere near Cebu), which leaves every row on its
 * estimate. Keyed by the position it was asked for, so an answer for where the
 * customer stood a moment ago is never shown against where they stand now.
 */
export function useRoadDistances(position: LatLng | null): MeasuredKm | null {
  const key = position ? `${position.lat},${position.lng}` : null;
  const [answer, setAnswer] = useState<{ key: string; km: MeasuredKm | null } | null>(null);

  useEffect(() => {
    if (!key || !position) return;
    let current = true;
    startTransition(async () => {
      let km: MeasuredKm | null = null;
      try {
        km = await fetchRoadDistances(position);
      } catch {
        // A network drop or a redeploy that retired the action. The estimate
        // is already on screen, so there is nothing to tell the customer.
      }
      if (current) setAnswer({ key, km });
    });
    return () => {
      current = false;
    };
    // `position` is read through `key`, which changes exactly when it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return answer && answer.key === key ? answer.km : null;
}
