import { z } from "zod";

/**
 * The map location form, parsed before staff_set_branch_location().
 *
 * One text field rather than two number inputs, because the fastest way to an
 * exact pin is to right-click the counter in Google Maps, which copies
 * "10.3107153, 123.8962067" as one string. The map picker writes the same
 * string, so both routes arrive here in one shape.
 *
 * No coercion anywhere (AGENTS.md, rule 6): an empty field is not 0, 0. It
 * fails to parse, and clearing a pin is its own button with its own intent.
 */

export type LatLngPoint = { lat: number; lng: number };

const PAIR = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** Null for anything that is not two numbers separated by a comma. */
export function parseCoordinates(text: string): LatLngPoint | null {
  const match = PAIR.exec(text);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function formatCoordinates(point: LatLngPoint): string {
  return `${point.lat.toFixed(7)}, ${point.lng.toFixed(7)}`;
}

/**
 * The Philippines with a margin, the same box the database checks. Here only
 * to say so before a round trip: a pair typed the wrong way round is a valid
 * point in the Indian Ocean, and only this box notices.
 */
export function insidePhilippines(point: LatLngPoint): boolean {
  return point.lat >= 4.5 && point.lat <= 21.5 && point.lng >= 116 && point.lng <= 127;
}

export type BranchLocationResult =
  | { ok: true; branchId: string; point: LatLngPoint | null }
  | { ok: false; message: string };

export function readBranchLocationForm(formData: FormData): BranchLocationResult {
  const intent = formData.get("intent") === "clear" ? "clear" : "save";
  const branchId = String(formData.get("branchId") ?? "");
  if (!z.uuid().safeParse(branchId).success) {
    return { ok: false, message: "The branch could not be identified. Reload and try again." };
  }
  if (intent === "clear") return { ok: true, branchId, point: null };

  const point = parseCoordinates(String(formData.get("coordinates") ?? ""));
  if (!point) return { ok: false, message: "Place the pin on the map, or paste coordinates such as 10.3107153, 123.8962067." };
  if (!insidePhilippines(point)) return { ok: false, message: "That point is outside the Philippines. Check the two numbers are not the wrong way round." };
  return { ok: true, branchId, point };
}
