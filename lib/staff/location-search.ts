import { z } from "zod";
import type { LatLngPoint } from "./branch-location-schema";

/**
 * Searching for a place to pin, through Mapbox's Search Box API.
 *
 * The Search Box API rather than Geocoding v6, because v6 finds addresses
 * only, and the way somebody looks for a counter is by the place it is in:
 * "Ayala Center Cebu", "Shell Banilad". Search Box finds both points of
 * interest and addresses in one request.
 *
 * Called from the browser with the public token, which the Content Security
 * Policy already admits to api.mapbox.com wherever maps are enabled. Results
 * are held to the Philippines and ranked from near `near` outward, so a
 * search for "SM City" lands in Cebu rather than Manila.
 */

/** Cebu City, where a search with no pin yet is centred. */
export const CEBU_CENTER: LatLngPoint = { lat: 10.3157, lng: 123.8854 };

export type PlaceResult = { id: string; name: string; detail: string; point: LatLngPoint };

export function placeSearchUrl(query: string, token: string, near: LatLngPoint = CEBU_CENTER): string {
  const params = new URLSearchParams({
    q: query.trim(),
    access_token: token,
    country: "ph",
    language: "en",
    limit: "6",
    proximity: `${near.lng},${near.lat}`,
  });
  return `https://api.mapbox.com/search/searchbox/v1/forward?${params.toString()}`;
}

const featureSchema = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.object({
    mapbox_id: z.string().optional(),
    name: z.string(),
    full_address: z.string().optional(),
    place_formatted: z.string().optional(),
  }),
});

/**
 * The results a picker can offer. A feature that does not parse is dropped
 * rather than failing the list, because one odd entry should not hide five
 * good ones.
 */
export function parsePlaceResults(body: unknown): PlaceResult[] {
  const features = z.object({ features: z.array(z.unknown()) }).safeParse(body);
  if (!features.success) return [];
  return features.data.features.flatMap((raw, index) => {
    const feature = featureSchema.safeParse(raw);
    if (!feature.success) return [];
    const [lng, lat] = feature.data.geometry.coordinates;
    const { properties } = feature.data;
    return [
      {
        id: properties.mapbox_id ?? `${index}-${lat},${lng}`,
        name: properties.name,
        detail: properties.full_address ?? properties.place_formatted ?? "",
        point: { lat, lng },
      },
    ];
  });
}
