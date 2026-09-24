import "server-only";
import type { LatLng } from "./nearest";
import { matrixUrl, readMatrix, type RoadDestination } from "./road-matrix";

/**
 * The road distance to each counter, from Mapbox.
 *
 * FLAG GATED ON THE TOKEN, AND IT NEVER THROWS.
 *
 * With no `MAPBOX_ACCESS_TOKEN` this is switched off and returns null, the same
 * as a failed request, and the page carries on with its straight line
 * estimate. A road distance is a nicety on a list the customer can already
 * choose from, so nothing that goes wrong here is allowed to become an error
 * they see. This mirrors `lib/email/client.ts`.
 *
 * THE LOCATION IS USED FOR THIS ONE REQUEST AND KEPT NOWHERE.
 *
 * It goes to Mapbox inside the request URL, because that is the only way the
 * Matrix API takes coordinates. Nothing here stores it or logs it: on failure
 * only the status is logged, never the URL, which carries both the position
 * and the token.
 */

/**
 * Past this the page stops waiting and keeps its estimate. A customer who has
 * just been located is looking at the list already, and a number that arrives
 * late only makes the rows jump.
 */
const TIMEOUT_MS = 4_000;

export function roadDistancesConfigured(): boolean {
  return Boolean(process.env.MAPBOX_ACCESS_TOKEN?.trim());
}

export async function roadDistances(
  origin: LatLng,
  destinations: RoadDestination[],
): Promise<Record<string, number> | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  if (!token || destinations.length === 0) return null;

  try {
    const response = await fetch(matrixUrl(origin, destinations, token), {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("[road] Mapbox matrix refused:", response.status);
      return null;
    }
    const km = readMatrix(await response.json(), destinations);
    if (!km) console.error("[road] Mapbox matrix answer could not be read");
    return km;
  } catch (error) {
    console.error(
      "[road] Mapbox matrix failed:",
      error instanceof Error ? error.name : "unknown",
    );
    return null;
  }
}
