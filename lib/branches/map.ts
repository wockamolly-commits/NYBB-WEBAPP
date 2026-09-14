import type { Branch } from "@/lib/catalog/types";

/**
 * Where a branch is, as two URLs: one the page frames, one the customer leaves
 * for.
 *
 * WHY A FRAME AND NOT THE MAPS SCRIPT API.
 *
 * The Maps JavaScript API would need a script origin, an XHR origin, an image
 * origin and an API key, and under `strict-dynamic` a third party script is the
 * one thing this Content Security Policy exists to keep out. The embed is a
 * document on Google's own origin inside a frame, so its scripts run under
 * Google's policy and none of them run under ours. The only allowance it costs
 * is one `frame-src` host.
 *
 * WHY THE PIN WINS OVER THE ADDRESS.
 *
 * A query like "SM City Cebu Food Hall" resolves to whatever Google ranks
 * first, which is a mall with five entrances. The pin is the listing's own
 * coordinate, so it lands on the counter. The address is the fallback for a
 * branch whose pin has not been confirmed, and it is honest about that by
 * construction: it shows the street, which is all the address claims.
 */

function destination(branch: Pick<Branch, "pin" | "addressLine" | "city">): string {
  if (branch.pin) return `${branch.pin.lat},${branch.pin.lng}`;
  return `${branch.addressLine}, ${branch.city}, Philippines`;
}

/** The framed map. Zoomed to street level when there is a pin to zoom to. */
export function mapEmbedUrl(branch: Pick<Branch, "pin" | "addressLine" | "city">): string {
  const params = new URLSearchParams({
    q: destination(branch),
    z: branch.pin ? "17" : "16",
    output: "embed",
  });
  return `https://www.google.com/maps?${params.toString()}`;
}

/**
 * Turn-by-turn from wherever the customer is standing.
 *
 * The documented Maps URL scheme, which opens the Google Maps app on a phone
 * that has it and the website on one that does not. No origin is sent: the
 * customer's location is decided on their device, never by this site.
 */
export function directionsUrl(branch: Pick<Branch, "pin" | "addressLine" | "city">): string {
  const params = new URLSearchParams({ api: "1", destination: destination(branch) });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
