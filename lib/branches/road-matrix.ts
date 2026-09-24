import { z } from "zod";
import type { LatLng } from "./nearest";

/**
 * Asking Mapbox how far each counter is by road, and reading what comes back.
 *
 * Pure: it builds a URL and parses a body, and never makes the request. The
 * request is `lib/branches/road.ts`, which is server only because it carries
 * the access token.
 *
 * ONE SOURCE, EVERY COUNTER AS A DESTINATION.
 *
 * The Matrix API bills per origin and destination pair, so the customer is the
 * only source and the counters are the only destinations: nine pairs a lookup
 * rather than the hundred a full matrix would cost. Driving, not
 * driving-traffic: traffic moves the time, not the length of the road, and the
 * plain profile allows 25 coordinates where the traffic one allows 10.
 */

export type RoadDestination = { slug: string; pin: LatLng };

const MATRIX_ENDPOINT = "https://api.mapbox.com/directions-matrix/v1/mapbox/driving";

/** The plain driving profile's own ceiling, the customer included. */
export const MAX_MATRIX_COORDINATES = 25;

/** Mapbox reads coordinates as longitude first. Six places is about 10 cm. */
function coordinate({ lat, lng }: LatLng): string {
  return `${lng.toFixed(6)},${lat.toFixed(6)}`;
}

export function matrixUrl(origin: LatLng, destinations: RoadDestination[], token: string): string {
  const coordinates = [origin, ...destinations.map((destination) => destination.pin)]
    .map(coordinate)
    .join(";");
  const params = new URLSearchParams({
    sources: "0",
    destinations: destinations.map((_, index) => index + 1).join(";"),
    annotations: "distance",
    access_token: token,
  });
  return `${MATRIX_ENDPOINT}/${coordinates}?${params.toString()}`;
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

/**
 * The part of Mapbox's answer this reads.
 *
 * `distances[0][i]` is metres from the customer to destination i, and null
 * where Mapbox found no road, which is a real answer: that counter keeps its
 * estimate rather than being given a number. `code` is "Ok" on success and
 * "NoRoute" when nothing could be routed at all.
 */
const matrixResponseSchema = z.object({
  code: z.string(),
  distances: z.array(z.array(z.number().nonnegative().nullable())).optional(),
});

/**
 * Kilometres by road, keyed by slug, or null when the answer cannot be used.
 *
 * Null covers a refusal, a body of the wrong shape, and a row of the wrong
 * length. A row that does not line up with the destinations asked for cannot
 * be matched to them safely, and a distance printed against the wrong counter
 * is worse than the estimate it would replace.
 */
export function readMatrix(
  body: unknown,
  destinations: RoadDestination[],
): Record<string, number> | null {
  const parsed = matrixResponseSchema.safeParse(body);
  if (!parsed.success || parsed.data.code !== "Ok") return null;

  const row = parsed.data.distances?.[0];
  if (!row || row.length !== destinations.length) return null;

  const km: Record<string, number> = {};
  destinations.forEach((destination, index) => {
    const metres = row[index];
    if (metres !== null) km[destination.slug] = metres / 1000;
  });
  return km;
}
