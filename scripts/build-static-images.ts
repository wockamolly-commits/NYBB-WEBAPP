/**
 * Build the static-catalog image derivatives.
 *
 * This is NOT the Supabase ingest job from spec section 5.6. That one
 * (scripts/ingest-legacy-images.ts) uploads to Storage under a randomUUID()
 * path and writes menu_items.image_url, and it cannot run until a Supabase
 * project exists. This script is its Phase 0 stand-in: it produces committed
 * derivatives under public/img so the static pages have real photography.
 *
 * Both jobs read the same transform rules from scripts/lib/image-pipeline.ts,
 * so the eventual ingest is a change of destination rather than a change of
 * pipeline.
 *
 * Run: npm run build:static-images
 *
 * The 357 MB source archive stays outside the repository, at C:\dev\nybb-assets
 * (override with NYBB_ASSETS). Only the derivatives are committed.
 */

import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderDerivative, sources, type Treatment } from "./lib/image-pipeline";

const PUBLIC_DIR = path.join(process.cwd(), "public", "img");
const MANIFEST = path.join(process.cwd(), "lib", "catalog", "generated-images.json");

type ManifestEntry = {
  src: string;
  width: number;
  height: number;
  blurDataURL: string;
  treatment: Treatment;
  source: string;
  lowRes?: boolean;
  tentative?: string;
};

async function build() {
  // Cleared rather than merged: filenames carry a content hash, so a stale
  // build would otherwise leave orphans behind on every re-crop.
  await rm(PUBLIC_DIR, { recursive: true, force: true });
  await mkdir(PUBLIC_DIR, { recursive: true });
  await mkdir(path.dirname(MANIFEST), { recursive: true });

  const manifest: Record<string, ManifestEntry> = {};
  const keys = Object.keys(sources).sort();

  for (const key of keys) {
    const derivative = await renderDerivative(key);

    // Content-addressed filenames, for the same reason the Supabase ingest
    // uses a randomUUID() path: next.config.ts holds optimized images for a
    // year, and that is only safe if replacing an image also changes its URL.
    //
    // This is not theoretical. Re-cropping every wing photograph and rebuilding
    // changed nothing in the browser, because the optimizer kept serving the
    // variants it had already derived from the unchanged path, watermark and
    // all. A hash in the name makes a new file a new URL.
    const digest = createHash("sha256").update(derivative.data).digest("hex").slice(0, 8);
    const outputName = `${key}.${digest}.webp`;
    await writeFile(path.join(PUBLIC_DIR, outputName), derivative.data);

    manifest[key] = {
      src: `/img/${outputName}`,
      width: derivative.width,
      height: derivative.height,
      blurDataURL: derivative.blurDataURL,
      treatment: derivative.treatment,
      source: derivative.source,
      ...(derivative.lowRes ? { lowRes: true } : {}),
      ...(derivative.tentative ? { tentative: derivative.tentative } : {}),
    };

    const kb = Math.round(derivative.data.byteLength / 1024);
    console.log(
      `${key.padEnd(30)} ${String(derivative.width).padStart(4)}x${String(derivative.height).padEnd(4)} ${String(kb).padStart(4)} KB  <- ${derivative.source}`,
    );
  }

  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(MANIFEST, json, "utf8");

  const digest = createHash("sha256").update(json).digest("hex").slice(0, 12);
  console.log(`\n${keys.length} images written to public/img`);
  console.log(`manifest lib/catalog/generated-images.json (${digest})`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
