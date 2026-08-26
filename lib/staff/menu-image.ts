import "server-only";

import sharp from "sharp";

export {
  MENU_IMAGE_ACCEPT,
  MENU_IMAGE_BUCKET,
  MENU_IMAGE_CACHE_CONTROL,
  MENU_IMAGE_CONTENT_TYPE,
  MENU_IMAGE_EXTENSION,
  MENU_IMAGE_MAX_BYTES,
  MENU_IMAGE_SIZE_MESSAGE,
  MENU_IMAGE_TYPE_MESSAGE,
  isDecodableImageType,
} from "./menu-image-limits";

/**
 * One uploaded photograph, turned into the tile the storefront draws.
 *
 * This is scripts/lib/image-pipeline.ts's renderDerivative with the archive
 * taken out of it. The crop, the encode and the twelve pixel placeholder are
 * the same rules, because the tile grid does not care whether a photograph
 * arrived in the 2024 shoot or from the owner's phone this morning, and two
 * sets of rules would drift.
 *
 * Three things differ from that function, all of them because the input is an
 * upload rather than a known file:
 *
 *  - There is no treatment to look up. The archive distinguishes lifestyle
 *    shots, flattened cutouts, genuine alpha, wide scenes and the wordmark.
 *    An owner replacing a product photograph is always replacing a square
 *    tile, so there is one path here and it is the tile path.
 *  - There is no corner badge to measure. That scan exists for one
 *    photographer's watermark on one set of originals.
 *  - The crop window is placed by the person uploading, through zoom and
 *    offsetY, rather than being centred and then nudged off the watermark.
 *
 * Alpha is flattened onto the brand orange, matching the pipeline's cutout
 * path. A PNG with transparency otherwise renders on whatever happens to be
 * behind the tile, which is a different colour on the flavour grid than on
 * the product page.
 */

/** Square product tiles, the same width scripts/lib/image-pipeline.ts uses. */
export const TILE_WIDTH = 900;

/** The cutout ground from the pipeline. Uploads are flattened onto it. */
const BRAND_BACKGROUND = "#ef6212";

/**
 * How far the crop window may shrink, as a fraction of the source's short
 * side. A quarter is four times magnification, which is already more than a
 * 900px tile can carry from anything but a very large original, and a floor
 * is what stops a stray value producing a one pixel crop.
 */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 1;

export type ProcessedMenuImage = {
  /** The encoded WebP. */
  data: Buffer;
  width: number;
  height: number;
  /** A 12x12 WebP as a data URI, for next/image's blur placeholder. */
  blurDataURL: string;
};

export type MenuImageCrop = {
  /**
   * A multiplier on the crop window's side length, so a SMALLER number is a
   * closer crop. 1 takes the largest square the source allows.
   *
   * The control in ImageField.tsx is a magnification instead, which is what a
   * person means by zoom, and it sends 1 / magnification. Keeping the
   * primitive as a window multiplier is what makes the clamp below legible:
   * the window has to fit inside the source, and that is a statement about
   * side length.
   */
  zoom: number;
  /**
   * Where the window sits vertically, -1 at the top edge of the source and 1
   * at the bottom, across whatever travel the window's size leaves. 0 is
   * centred, and is the whole travel when the window fills the short side.
   */
  offsetY: number;
};

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, value));
}

/**
 * The square crop window, inside the source by construction.
 *
 * Both inputs are clamped rather than rejected. They arrive from a range
 * control and from a Server Action's form data, so an out of range value is a
 * stale form or a hand-built request, not something worth failing an upload
 * over. The archive pipeline makes the same choice for the same reason.
 */
function cropWindow(width: number, height: number, crop: MenuImageCrop) {
  const full = Math.min(width, height);
  const zoom = clamp(crop.zoom, MIN_ZOOM, MAX_ZOOM);
  const size = clamp(Math.round(full * zoom), 1, full);

  const offsetY = clamp(crop.offsetY, -1, 1);
  const travelY = height - size;
  const travelX = width - size;

  return {
    left: Math.round(travelX / 2),
    top: Math.round((travelY * (offsetY + 1)) / 2),
    width: size,
    height: size,
  };
}

/**
 * Crop, resize, flatten and encode one uploaded photograph.
 *
 * Never enlarges. A 400px source becomes a 400px tile rather than a blurry
 * 900px one, which is what withoutEnlargement buys and what the second test
 * in tests/unit/menu-image.test.ts pins.
 *
 * rotate() with no argument applies the EXIF orientation and then drops the
 * metadata, which is both the correct rendering and the strip: a phone
 * photograph carries GPS coordinates, and a menu tile served from a public
 * bucket must not.
 */
export async function processMenuImage(
  file: File,
  options: MenuImageCrop,
): Promise<ProcessedMenuImage> {
  const input = Buffer.from(await file.arrayBuffer());

  // rotate() before reading the size, so a portrait photograph tagged sideways
  // is measured the way it will be drawn rather than the way it was stored.
  const upright = await sharp(input).rotate().toBuffer();
  const meta = await sharp(upright).metadata();
  if (!meta.width || !meta.height) {
    throw new Error("That file could not be read as an image.");
  }

  const window = cropWindow(meta.width, meta.height, options);
  const targetWidth = Math.min(TILE_WIDTH, window.width);

  const rendered = await sharp(upright)
    .extract(window)
    .resize(targetWidth, undefined, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: BRAND_BACKGROUND })
    .webp({ quality: 80, effort: 5 })
    .toBuffer({ resolveWithObject: true });

  const placeholder = await sharp(upright)
    .extract(window)
    .resize(12, 12, { fit: "fill" })
    .flatten({ background: BRAND_BACKGROUND })
    .webp({ quality: 40 })
    .toBuffer();

  return {
    data: rendered.data,
    width: rendered.info.width,
    height: rendered.info.height,
    blurDataURL: `data:image/webp;base64,${placeholder.toString("base64")}`,
  };
}
