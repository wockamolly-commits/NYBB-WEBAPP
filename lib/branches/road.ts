import "server-only";
import type { LatLng } from "./nearest";
import { directionsUrl, readRoute, type RoadRoute } from "./road-route";

/**
 * The driving route to each counter, from Mapbox.
 *
 * FLAG GATED ON THE TOKEN, AND IT NEVER THROWS.
 *
 * With no `MAPBOX_ACCESS_TOKEN` this is switched off and returns null, the same
 * as a failed request, and the page carries on with its straight line
 * estimate and the Google map. A road distance is a nicety on a list the
 * customer can already choose from, so nothing that goes wrong here is allowed
 * to become an error they see. This mirrors `lib/email/client.ts`.
 *
 * THE LOCATION IS USED FOR THESE REQUESTS AND KEPT NOWHERE.
 *
 * It goes to Mapbox inside the request URL, because that is the only way the
 * Directions API takes coordinates. Nothing here stores it or logs it: on
 * failure only the status is logged, never the URL, which carries both the
 * position and the token.
 */

export type RoadDestination = { slug: string; pin: LatLng };

/**
 * Past this the page stops waiting and keeps its estimate. A customer who has
 * just been located is looking at the list already, and a number that arrives
 * late only makes the rows jump.
 */
const TIMEOUT_MS = 4_000;

export function roadRoutesConfigured(): boolean {
  return Boolean(process.env.MAPBOX_ACCESS_TOKEN?.trim());
}

async function roadRoute(from: LatLng, to: LatLng, token: string): Promise<RoadRoute | null> {
  try {
    const response = await fetch(directionsUrl(from, to, token), {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("[road] Mapbox directions refused:", response.status);
      return null;
    }
    const route = readRoute(await response.json(), from, to);
    if (!route) console.error("[road] Mapbox directions answer could not be read");
    return route;
  } catch (error) {
    console.error(
      "[road] Mapbox directions failed:",
      error instanceof Error ? error.name : "unknown",
    );
    return null;
  }
}

/**
 * The route to every destination, keyed by slug, asked for all at once.
 *
 * A counter Mapbox could not route to is absent and keeps its estimate. Null
 * only when switched off or when not one route came back, so the caller can
 * tell "no answer" from "an answer with gaps".
 */
export async function roadRoutes(
  from: LatLng,
  destinations: RoadDestination[],
): Promise<Record<string, RoadRoute> | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  if (!token || destinations.length === 0) return null;

  const routes = await Promise.all(
    destinations.map((destination) => roadRoute(from, destination.pin, token)),
  );

  const bySlug: Record<string, RoadRoute> = {};
  destinations.forEach((destination, index) => {
    const route = routes[index];
    if (route) bySlug[destination.slug] = route;
  });
  return Object.keys(bySlug).length > 0 ? bySlug : null;
}
