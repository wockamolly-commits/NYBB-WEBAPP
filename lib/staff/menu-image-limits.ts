/**
 * What a menu photograph upload is allowed to be, and where it lands.
 *
 * Split out of menu-image.ts for one reason: that file imports sharp, which is
 * a native Node module, and ImageField.tsx is a client component that has to
 * check the size and the type before it sends a file. Importing the processor
 * from the browser bundle to read two constants would drag sharp in with it
 * and fail the build. Everything here is a plain value, safe on both sides,
 * and menu-image.ts re-exports it so the server keeps one import.
 *
 * The client check is a courtesy, not a boundary. Both actions in
 * app/(workspace)/workspace/menu/actions.ts run these same checks again.
 */

/**
 * The Storage bucket every menu photograph lives in.
 *
 * This name has to agree everywhere it appears, and it appears in five
 * places: this constant; the two upload actions in actions.ts, which import
 * it; next.config.ts's remotePattern, which decides whether next/image will
 * optimize the URL at all, also imported; scripts/ingest-legacy-images.ts,
 * also imported; and supabase/migrations/0055_menu_image_storage.sql, which
 * writes the literal "menu-images" twice, once for the bucket row and once
 * for the Storage policy's bucket_id check, because SQL cannot import a
 * TypeScript constant. Everything on the JavaScript side reads this one
 * value and cannot drift from it. The SQL migration is the one place a
 * rename here would silently stop being true, which is why
 * tests/sql/schema.test.ts checks the bucket row's id against this constant
 * rather than against a second literal of its own.
 */
export const MENU_IMAGE_BUCKET = "menu-images";

export const MENU_IMAGE_CONTENT_TYPE = "image/webp";
export const MENU_IMAGE_EXTENSION = "webp";
/** A year, matching next.config.ts. Safe because every upload gets a fresh path. */
export const MENU_IMAGE_CACHE_CONTROL = "31536000";
export const MENU_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * The types sharp can decode and this app is willing to accept.
 *
 * image/svg+xml is deliberately absent. An SVG is a document that can carry
 * script and a stylesheet, it would be served from the same Storage origin as
 * everything else in the bucket, and nothing on a menu needs one. sharp can
 * rasterise it, which is exactly why leaving it off the list has to be a
 * decision written down rather than an oversight.
 */
const DECODABLE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

/** What the file input offers, so the picker does not show files we refuse. */
export const MENU_IMAGE_ACCEPT = DECODABLE_IMAGE_TYPES.join(",");

export function isDecodableImageType(type: string): boolean {
  return (DECODABLE_IMAGE_TYPES as readonly string[]).includes(type);
}

/** The sentence both the client and the server print for a file we refuse. */
export const MENU_IMAGE_TYPE_MESSAGE =
  "Choose a JPEG, PNG, WebP or AVIF photograph. Other file types cannot be used.";

/** The sentence both sides print for a file that is too large. */
export const MENU_IMAGE_SIZE_MESSAGE = "That photograph is over 5 MB. Choose a smaller file.";
