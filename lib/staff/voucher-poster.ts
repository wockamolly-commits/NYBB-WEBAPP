import "server-only";

import sharp from "sharp";
import { VOUCHER_POSTER_TYPE_MESSAGE } from "./voucher-poster-limits";

/**
 * One uploaded poster, turned into the image the storefront draws.
 *
 * Unlike a menu tile there is no crop. A poster is artwork somebody composed
 * edge to edge, usually with the code and the dates printed near a border, so
 * cutting any of it away would cut the message. It keeps its own shape and is
 * only ever scaled down.
 *
 * Transparency goes onto white rather than the menu's brand orange. A poster
 * is drawn inside a light card and a light popup, and orange behind a
 * transparent PNG would read as a colour the designer never chose.
 */

/** The longest side a poster is kept at. Sharp on a phone at 3x, and small. */
export const POSTER_MAX_SIDE = 1600;

/** The blur placeholder's width. Its height follows the poster's own shape. */
const PLACEHOLDER_WIDTH = 12;

const POSTER_BACKGROUND = "#ffffff";

/** Keyed on sharp's reading of the bytes, for the reason menu-image.ts gives. */
const DECODABLE_SHARP_FORMATS = new Set(["jpeg", "png", "webp", "avif"]);

export type ProcessedPoster = {
  data: Buffer;
  width: number;
  height: number;
  /** A tiny WebP with the poster's aspect ratio, for next/image's blur placeholder. */
  blurDataURL: string;
};

/**
 * Orient, scale down, flatten and encode one poster.
 *
 * rotate() with no argument applies the EXIF orientation and drops the
 * metadata, GPS included. The bucket is public, so the strip is not optional.
 */
export async function processPosterImage(file: File): Promise<ProcessedPoster> {
  const input = Buffer.from(await file.arrayBuffer());

  // Checked on the raw input, before any re-encode, for the SVG reason
  // processMenuImage records.
  const sourceFormat = (await sharp(input).metadata()).format;
  if (!sourceFormat || !DECODABLE_SHARP_FORMATS.has(sourceFormat)) {
    throw new Error(VOUCHER_POSTER_TYPE_MESSAGE);
  }

  const upright = await sharp(input).rotate().toBuffer();

  const rendered = await sharp(upright)
    .resize(POSTER_MAX_SIDE, POSTER_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: POSTER_BACKGROUND })
    .webp({ quality: 82, effort: 5 })
    .toBuffer({ resolveWithObject: true });

  const placeholder = await sharp(upright)
    .resize(PLACEHOLDER_WIDTH, undefined)
    .flatten({ background: POSTER_BACKGROUND })
    .webp({ quality: 40 })
    .toBuffer();

  return {
    data: rendered.data,
    width: rendered.info.width,
    height: rendered.info.height,
    blurDataURL: `data:image/webp;base64,${placeholder.toString("base64")}`,
  };
}
