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
