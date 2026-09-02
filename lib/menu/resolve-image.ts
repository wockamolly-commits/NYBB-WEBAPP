import { catalogImageBySource } from "@/lib/catalog/images";
import type { MenuImage } from "./types";

/**
 * Which of the two places a menu row's photograph actually came from.
 *
 * The distinction is invisible to a customer and it is the whole story for
 * whoever manages the menu: an archive photograph is one this repository
 * ships, identical for every deployment and replaceable only by uploading
 * over it, while an uploaded one is a file in Storage that belongs to this
 * row alone.
 */
export type MenuImageOrigin = "uploaded" | "archive";

/** A menu row's image columns, as the database holds them. */
export type StoredMenuImage = {
  src?: string | null;
  width?: number | null;
  height?: number | null;
  blurDataURL?: string | null;
  /** Absent on option photography, which the schema does not classify. */
  treatment?: string | null;
  /** Path inside the legacy archive. The bridge back to a local derivative. */
  source?: string | null;
} | null;

export type ResolvedMenuImage = MenuImage & { origin: MenuImageOrigin };

/**
 * The photograph a menu row actually shows, from either place it can live.
 *
 * `image_url` and its dimensions stay null until an upload or
 * scripts/ingest-legacy-images.ts has put a file in Storage, while
 * `image_source` is written by the seed. A row can therefore legitimately
 * carry provenance and no picture of its own, and the storefront draws the
 * committed derivative that came from the same archive file so the menu is
 * not full of empty squares in the meantime.
 *
 * EVERY READER RESOLVES A PHOTOGRAPH THROUGH HERE.
 *
 * This function is shared rather than duplicated because the alternative was
 * shipped and was wrong: the storefront fell back to the archive and the
 * workspace read image_url alone, so on 2026-08-27 twenty-three of thirty-one
 * items and nine of fifteen options showed the customer a photograph and told
 * the owner they had none. Two readers of the same row disagreeing about
 * whether it has a picture is not a display detail, it is the kind of thing
 * that gets a photograph "fixed" that was never broken.
 *
 * Once Storage holds a file for the row, src is populated and the fallback
 * retires itself for that row.
 */
export function resolveMenuImage(
  image: StoredMenuImage | undefined,
): ResolvedMenuImage | null {
  if (image?.src && image.width && image.height && image.blurDataURL) {
    return {
      src: image.src,
      width: image.width,
      height: image.height,
      blurDataURL: image.blurDataURL,
      treatment: image.treatment,
      source: image.source,
      origin: "uploaded",
    };
  }

  const local = catalogImageBySource(image?.source);
  if (!local) return null;

  return {
    src: local.src,
    width: local.width,
    height: local.height,
    blurDataURL: local.blurDataURL,
    treatment: local.treatment,
    source: local.source,
    origin: "archive",
  };
}

/**
 * The same photograph with the provenance dropped.
 *
 * The storefront's payload is a public contract shaped by
 * `get_storefront_menu()` and lib/menu/types.ts, and a customer's page has no
 * use for where a picture came from. Stripping it here keeps that payload
 * exactly what it was before the workspace needed to know.
 */
export function menuImageOf(resolved: ResolvedMenuImage | null): MenuImage | null {
  if (!resolved) return null;
  return {
    src: resolved.src,
    width: resolved.width,
    height: resolved.height,
    blurDataURL: resolved.blurDataURL,
    treatment: resolved.treatment,
    source: resolved.source,
  };
}
