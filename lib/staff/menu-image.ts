import "server-only";

import sharp from "sharp";
import {
  MENU_IMAGE_FLATTEN_BACKGROUND,
  cropWindow,
  type MenuImageCrop,
} from "./menu-image-crop";
import {
  MENU_IMAGE_ACCEPT,
  MENU_IMAGE_BUCKET,
  MENU_IMAGE_CACHE_CONTROL,
  MENU_IMAGE_CONTENT_TYPE,
  MENU_IMAGE_EXTENSION,
  MENU_IMAGE_MAX_BYTES,
  MENU_IMAGE_SIZE_MESSAGE,
  MENU_IMAGE_TYPE_MESSAGE,
  isDecodableImageFile,
  isDecodableImageType,
  menuImageOriginalFor,
} from "./menu-image-limits";

// Imported above rather than only re-exported, because processMenuImage
// itself now reads MENU_IMAGE_TYPE_MESSAGE (see DECODABLE_SHARP_FORMATS
// below). `export { X } from "./m"` does not bind X locally, so a bare
// re-export would have made the constant unusable in this file.
export type { MenuImageCrop };

export {
  MENU_IMAGE_ACCEPT,
  MENU_IMAGE_BUCKET,
  MENU_IMAGE_CACHE_CONTROL,
  MENU_IMAGE_CONTENT_TYPE,
  MENU_IMAGE_EXTENSION,
  MENU_IMAGE_MAX_BYTES,
  MENU_IMAGE_SIZE_MESSAGE,
  MENU_IMAGE_TYPE_MESSAGE,
  isDecodableImageFile,
  isDecodableImageType,
  menuImageOriginalFor,
};

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

/**
 * The formats sharp may actually decode into a menu tile, keyed on sharp's
 * own `metadata().format`, not on the upload's declared Content-Type.
 *
 * isDecodableImageFile in menu-image-limits.ts judges the declared type and
 * the file name, both of which are whatever the multipart part header claims
 * and nothing more: a request that declares "image/png" while its bytes are
 * actually an SVG passes that check, and sharp will still decode and
 * rasterise it, which is exactly the input the No-SVG ruling in that file
 * exists to keep out. This is the same check made a second time against data
 * sharp has already read, the same way the type and size limits themselves
 * are checked again on the server rather than trusted from the client.
 */
const DECODABLE_SHARP_FORMATS = new Set(["jpeg", "png", "webp", "avif"]);

export type ProcessedMenuImage = {
  /** The encoded WebP. */
  data: Buffer;
  width: number;
  height: number;
  /** A 12x12 WebP as a data URI, for next/image's blur placeholder. */
  blurDataURL: string;
};

/**
 * The longest side an editable original is kept at.
 *
 * Not the file as uploaded. A phone photograph is several thousand pixels
 * wide and would sit in the bucket costing money to hold a detail no 900px
 * tile can show. 2000 leaves room to crop in hard (a quarter of the short
 * side, the tightest crop the editor allows) and still feed a full 900px
 * tile, which is the only thing the original has to be good for.
 */
const EDITABLE_ORIGINAL_MAX = 2000;

/**
 * The whole photograph, uncropped, kept so the crop can be changed later.
 *
 * rotate() with no argument does two jobs here, as it does for the tile: it
 * applies the EXIF orientation, and it drops the metadata. The second is not
 * optional. menu-images is a public bucket, a phone photograph carries GPS
 * coordinates, and an original stored with its metadata intact would publish
 * the owner's kitchen's location to anybody who guessed the URL. The tile has
 * always been stripped; the original has to be stripped for the same reason.
 *
 * No flatten. Transparency is preserved so that reopening a cutout and
 * re-cropping it does not bake the brand orange into the source, which would
 * then be flattened onto the brand orange again on every later edit.
 */
export async function renderEditableOriginal(file: File): Promise<Buffer> {
  const input = Buffer.from(await file.arrayBuffer());
  const sourceFormat = (await sharp(input).metadata()).format;
  if (!sourceFormat || !DECODABLE_SHARP_FORMATS.has(sourceFormat)) {
    throw new Error(MENU_IMAGE_TYPE_MESSAGE);
  }
  return sharp(input)
    .rotate()
    .resize(EDITABLE_ORIGINAL_MAX, EDITABLE_ORIGINAL_MAX, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 90, effort: 5 })
    .toBuffer();
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

  // Checked against the RAW input, before rotate().toBuffer() below touches
  // it. That call re-encodes whatever it is handed, and for an SVG source
  // sharp's default re-encode target is PNG: reading meta.format from its
  // *output* instead of here would see "png" and wave the very SVG the
  // No-SVG ruling exists to keep out straight through, having already
  // rasterised it before the check ever ran.
  const sourceFormat = (await sharp(input).metadata()).format;
  if (!sourceFormat || !DECODABLE_SHARP_FORMATS.has(sourceFormat)) {
    throw new Error(MENU_IMAGE_TYPE_MESSAGE);
  }

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
    .flatten({ background: MENU_IMAGE_FLATTEN_BACKGROUND })
    .webp({ quality: 80, effort: 5 })
    .toBuffer({ resolveWithObject: true });

  const placeholder = await sharp(upright)
    .extract(window)
    .resize(12, 12, { fit: "fill" })
    .flatten({ background: MENU_IMAGE_FLATTEN_BACKGROUND })
    .webp({ quality: 40 })
    .toBuffer();

  return {
    data: rendered.data,
    width: rendered.info.width,
    height: rendered.info.height,
    blurDataURL: `data:image/webp;base64,${placeholder.toString("base64")}`,
  };
}
