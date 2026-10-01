/**
 * What a voucher poster upload is allowed to be, and where it lands.
 *
 * Split from voucher-poster.ts for the reason menu-image-limits.ts gives: that
 * file imports sharp, and PosterField.tsx is a client component that checks
 * the size and type before sending. Everything here is a plain value.
 *
 * The accepted formats are the menu's, imported rather than restated, so the
 * No-SVG ruling written down in menu-image-limits.ts covers posters too. A
 * poster is served from a public bucket on the same Storage origin, which is
 * exactly the case that ruling is about.
 */

import {
  MENU_IMAGE_ACCEPT,
  MENU_IMAGE_CACHE_CONTROL,
  MENU_IMAGE_CONTENT_TYPE,
  MENU_IMAGE_EXTENSION,
  isDecodableImageFile,
} from "./menu-image-limits";

/**
 * The Storage bucket every voucher poster lives in.
 *
 * Written as a literal in supabase/migrations/0077_voucher_posters.sql (the
 * bucket row and the policy), and read from here by the upload action and
 * next.config.ts. tests/sql/schema.test.ts checks the bucket row against this
 * constant so the SQL cannot drift from it unnoticed.
 */
export const VOUCHER_POSTER_BUCKET = "voucher-posters";

export const VOUCHER_POSTER_ACCEPT = MENU_IMAGE_ACCEPT;
export const VOUCHER_POSTER_CONTENT_TYPE = MENU_IMAGE_CONTENT_TYPE;
export const VOUCHER_POSTER_EXTENSION = MENU_IMAGE_EXTENSION;
export const VOUCHER_POSTER_CACHE_CONTROL = MENU_IMAGE_CACHE_CONTROL;

/**
 * The source file ceiling, before processing. Larger than a menu photograph's
 * because a poster is usually exported straight from a design tool at print
 * size. The bucket's own 3 MB ceiling is on the processed WebP, which at 1600px
 * on the long side lands far below it.
 */
export const VOUCHER_POSTER_MAX_BYTES = 8 * 1024 * 1024;

export function isAcceptablePosterFile(name: string, type: string): boolean {
  return isDecodableImageFile(name, type);
}

export const VOUCHER_POSTER_TYPE_MESSAGE =
  "Choose a JPEG, PNG, WebP or AVIF image. Other file types cannot be used.";

export const VOUCHER_POSTER_SIZE_MESSAGE = "That poster is over 8 MB. Choose a smaller file.";
