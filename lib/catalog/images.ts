import generated from "./generated-images.json";
import type { CatalogImage } from "./types";

/**
 * Typed access to the derivatives produced by `npm run build:static-images`.
 *
 * Phase 0 only. From Phase 1 the image lives on the `menu_items` row as a
 * Supabase Storage URL under a randomUUID() path, and this module goes away.
 * Until then the manifest is the single source of truth for what photography
 * exists, so a missing key is a designed empty tile rather than a broken image.
 */
const images = generated as Record<string, CatalogImage>;

export function catalogImage(key: string | undefined): CatalogImage | null {
  if (!key) return null;
  return images[key] ?? null;
}

/** Every key in the manifest, for the integrity tests. */
export function imageKeys(): string[] {
  return Object.keys(images);
}

/**
 * The same derivatives, indexed by the archive path they came from.
 *
 * This is the bridge that keeps photography on the page during the window
 * where the database is authoritative but Storage has not been filled yet.
 * `supabase/seed.sql` writes `image_source` (provenance) but deliberately not
 * `image_url`, because scripts/ingest-legacy-images.ts writes that after it
 * uploads. Between those two events a database-backed menu would otherwise
 * render every tile as a designed-but-empty square.
 *
 * Matching on the archive path rather than on the item slug is the point: it
 * is the same identifier both sides already record, so nothing has to be kept
 * in sync by hand.
 */
const bySource = new Map<string, CatalogImage>(
  Object.values(images)
    .filter((image) => Boolean(image.source))
    .map((image) => [image.source, image]),
);

export function catalogImageBySource(source: string | null | undefined): CatalogImage | null {
  if (!source) return null;
  return bySource.get(source) ?? null;
}
