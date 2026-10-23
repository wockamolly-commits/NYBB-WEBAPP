import { z } from "zod";
import type { LatLng } from "./nearest";

/**
 * Asking Mapbox for the driving route to one counter, and reading the line.
 *
 * Pure: this builds the URL and parses the body, and `lib/branches/road.ts`
 * makes the request with the server token.
 *
 * ONE SOURCE FOR THE NUMBER AND THE LINE.
 *
 * Every distance on the store pages is the length of the route drawn on the
 * map. Mapbox's Matrix API was tried first, one request for every counter,
 * and it disagreed with this API about the same trip (270 m against 400 m
 * from one spot in Lahug), so a row could say one thing and the map show
 * another. One directions request per counter costs more requests and cannot
 * disagree with itself.
 */

const DIRECTIONS_ENDPOINT = "https://api.mapbox.com/directions/v5/mapbox/driving";

/** A route as the map draws it: [longitude, latitude] pairs, as GeoJSON has them. */
export type RoadRoute = {
  from: LatLng;
  to: LatLng;
  line: [number, number][];
  km: number;
};

function coordinate({ lat, lng }: LatLng): string {
  return `${lng.toFixed(6)},${lat.toFixed(6)}`;
}

/**
 * `overview=full` because the map is zoomed to street level and a simplified
 * line cuts corners across buildings there. No alternatives and no turn by
 * turn steps: the map shows one road, and the directions button hands off to
 * Google Maps for the drive itself.
 */
export function directionsUrl(from: LatLng, to: LatLng, token: string): string {
  const params = new URLSearchParams({
    geometries: "geojson",
    overview: "full",
    alternatives: "false",
    steps: "false",
    access_token: token,
  });
  return `${DIRECTIONS_ENDPOINT}/${coordinate(from)};${coordinate(to)}?${params.toString()}`;
}

/**
 * Where the customer is, as the browser reported it.
 *
 * Arrives from the client, so it is checked rather than trusted. A number on
 * the globe, nothing more: whether it is anywhere near Cebu is decided by the
 * caller, which already knows how far the counters are in a straight line.
 */
export const originSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

const directionsResponseSchema = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        distance: z.number().nonnegative(),
        geometry: z.object({
          type: z.literal("LineString"),
          coordinates: z.array(position),
        }),
      }),
    )
    .optional(),
});

/**
 * The first route, or null when there is none worth drawing.
 *
 * A line needs two points. Anything short of that (no route, a refusal, a body
 * of the wrong shape) is null, and the map shows the two pins without a line
 * rather than a line that is not the road.
 */
export function readRoute(body: unknown, from: LatLng, to: LatLng): RoadRoute | null {
  const parsed = directionsResponseSchema.safeParse(body);
  if (!parsed.success || parsed.data.code !== "Ok") return null;

  const route = parsed.data.routes?.[0];
  if (!route || route.geometry.coordinates.length < 2) return null;

  return {
    from,
    to,
    line: route.geometry.coordinates,
    km: route.distance / 1000,
  };
}
