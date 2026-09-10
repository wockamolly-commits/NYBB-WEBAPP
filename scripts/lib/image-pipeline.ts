/**
 * The image transform pipeline, shared by both jobs that read the archive.
 *
 * There are two consumers and exactly one set of rules:
 *
 *   scripts/build-static-images.ts   writes derivatives to public/img, Phase 0
 *   scripts/ingest-legacy-images.ts  uploads them to Supabase Storage, Phase 1
 *
 * They differ only in destination. Keeping the crop, the badge measurement and
 * the alpha handling here rather than in either script is what makes that
 * claim true instead of aspirational: a correction to the badge scan cannot
 * fix one job and leave the other shipping a watermark.
 *
 * The 357 MB source archive stays outside the repository, at C:\dev\nybb-assets
 * (override with NYBB_ASSETS).
 */

import path from "node:path";
import sharp from "sharp";

export const ARCHIVE = process.env.NYBB_ASSETS ?? "C:/dev/nybb-assets";
export const ORIGINALS = path.join(ARCHIVE, "originals");

/**
 * How a source image is composed, which decides how it is cropped and whether
 * it keeps an alpha channel.
 *
 * - `lifestyle`  full-bleed photograph (wings in a basket on pale wood). Square
 *                centre crop, opaque.
 * - `cutout`     product already flattened onto a flat orange ground by whoever
 *                exported it. Square centre crop, opaque. See the note on
 *                mismatched oranges below.
 * - `transparent` genuine alpha cutout. Alpha is preserved so the tile colour
 *                shows through; flattening these at ingest would throw away the
 *                only compositing freedom the library has.
 * - `scene`      a place, not a product. Cropped to 3:2, not to a square.
 * - `mark`       artwork whose own proportions are the point (the wordmark).
 *                Never cropped, alpha preserved.
 */
export type Treatment = "lifestyle" | "cutout" | "transparent" | "scene" | "mark";

export type Source = {
  /** Path inside the archive's originals/ tree. */
  file: string;
  treatment: Treatment;
  /**
   * Source is a small thumbnail and the only correctly labelled photo of this
   * item. Shipped knowingly, flagged for re-shoot. See README open questions.
   */
  lowRes?: boolean;
  /** Where the identification is inferred rather than read off the filename. */
  tentative?: string;
  /**
   * The region of the original that is usable, in pixels of the original.
   *
   * Only for sources that are promotional graphics rather than photographs.
   * The Iced Coffee Series files are the case this exists for: each is a
   * finished 1080x1080 social post with a headline set across the top and the
   * flavour name set beside the cup. Both are part of the pixels, and a tile
   * that reads "Iced Coffee Series / Hazelnut" beside eleven tiles that read
   * nothing is the same defect the corner badge was cropped out for.
   *
   * The badge is measured because it varies with the source. This does not
   * vary: the four files are one template, so the region is stated once rather
   * than scanned for. The treatment window is then taken inside this region,
   * so a cropped source is framed by exactly the same rules as an uncropped
   * one.
   */
  crop?: { left: number; top: number; width: number; height: number };
};

/** Square product tiles. */
export const TILE_WIDTH = 900;
/** Wide scene images (hero, branch cards). */
export const SCENE_WIDTH = 1600;

export const sources: Record<string, Source> = {
  // --- Wing flavours -------------------------------------------------------
  // Only filename-labelled photographs are mapped to a flavour. The archive
  // also holds seven unlabelled 2511x2560 wing shots; they are visually
  // ambiguous between flavours, so they are used as generic imagery or not at
  // all rather than being guessed onto a menu row.
  "wings-classic-buffalo": { file: "2024/05/Classic-Buffalo.jpg", treatment: "lifestyle" },
  "wings-bbq-lime": { file: "2024/05/BBQ-Lime-1.jpg", treatment: "lifestyle" },
  "wings-garlic-parmesan": { file: "2024/05/Garlic-Parmesan-1.jpg", treatment: "lifestyle" },
  "wings-honey-mustard": { file: "2024/05/Honey-Mustard-1.jpg", treatment: "lifestyle" },
  "wings-honey-garlic": { file: "2024/05/Honey-Garlic-1.jpg", treatment: "lifestyle" },
  "wings-sweet-spicy": { file: "2024/05/Sweet-Spicy-1.jpg", treatment: "lifestyle" },
  // The tenth flavour. 2025/03/Brads-Gravy.jpg is the Hot Wings refresh's own
  // copy, but at 1059x692 against this one's 5184x3456, so the 2024/05 shoot
  // wins on the same reasoning as the six above. It carries an NY3 corner
  // badge, which measureCornerBadge() crops.
  "wings-brads-gravy": { file: "2024/05/Brads-Gravy-3.jpg", treatment: "lifestyle" },
  // These three exist only as 300x300 thumbnails. Correct-but-small beats
  // large-but-wrong, so they ship at their real size and are on the re-shoot ask.
  "wings-cheezy": {
    file: "2025/03/Cheezy.jpg",
    treatment: "lifestyle",
    lowRes: true,
  },
  "wings-salted-egg": {
    file: "2025/03/Salted-Egg.jpg",
    treatment: "lifestyle",
    lowRes: true,
  },
  "wings-smokey-barbecue": {
    file: "2025/03/Smokey-Barbecue.jpg",
    treatment: "lifestyle",
    lowRes: true,
  },

  // --- Ribs ----------------------------------------------------------------
  "ribs-original": { file: "2025/03/RIBS-ORIG.jpg", treatment: "cutout" },
  "ribs-spicy": { file: "2025/03/RIBS-SPICY.jpg", treatment: "cutout" },

  // --- NY Burgers ----------------------------------------------------------
  "burger-rookie": { file: "2024/05/Rookie-Burger-1.jpg", treatment: "cutout" },
  "burger-quarterback": { file: "2024/05/The-Quarter-Burger.jpg", treatment: "cutout" },
  "burger-blt": { file: "2024/05/BLT-Burger.jpg", treatment: "cutout" },
  "burger-buffalo-chicken": { file: "2024/05/Buffalo-Chicken-Burger.jpg", treatment: "cutout" },
  "burger-angus": { file: "2024/05/Brads-Angus-Burger.jpg", treatment: "cutout" },

  // --- NY Chicken Burgers --------------------------------------------------
  "chicken-burger-cheezy": { file: "2025/03/Cheezy-Burger-bundle-1.jpg", treatment: "cutout" },
  "chicken-burger-honey-garlic": { file: "2025/03/honey-Burger-bundle-1.jpg", treatment: "cutout" },
  "chicken-burger-smokey-bbq": { file: "2025/03/smoky-Burger-bundle-1.jpg", treatment: "cutout" },

  // --- NY Hotdogs ----------------------------------------------------------
  "hotdog-classic": { file: "2024/05/Classic-Hotdog.jpg", treatment: "cutout" },
  "hotdog-jalapeno-cheese": { file: "2024/05/Jalapeno-Cheese-Dog.jpg", treatment: "cutout" },
  "hotdog-chili-cheese": { file: "2024/05/Chili-Cheese-Dog.jpg", treatment: "cutout" },
  "hotdog-hawaiian-bbq": { file: "2024/05/Hawaiian-BBQ-Dog.jpg", treatment: "cutout" },
  "hotdog-hungarian": { file: "2024/05/Hungarian-Sausage.jpg", treatment: "cutout" },

  // --- Pasta ---------------------------------------------------------------
  "pasta-spaghetti": { file: "2025/03/spag.jpg", treatment: "cutout" },
  "pasta-carbonara": { file: "2025/03/carbonara.jpg", treatment: "cutout" },

  // --- Sides and value meals -----------------------------------------------
  "side-nuggets": { file: "2024/05/Chicken-Nuggets-1.jpg", treatment: "cutout" },
  "side-mozzarella-sticks": {
    file: "2024/05/Untitled-design-2024-05-22T160627.766.png",
    treatment: "lifestyle",
    tentative: "Breaded sticks in a branded basket, identified by sight, not by filename.",
  },
  "value-meals": { file: "2024/05/Value-Meals.jpg", treatment: "cutout" },

  // --- Waffles -------------------------------------------------------------
  // The three genuinely transparent files in the archive, and the highest
  // resolution product cutouts in it. Alpha is preserved on purpose.
  "waffle-chocolate": { file: "2025/03/chocolate-coffee.png", treatment: "transparent" },
  "waffle-bavarian": { file: "2025/03/bavarian-coffee.png", treatment: "transparent" },
  "waffle-sunrise": { file: "2025/03/egg-coffee.png", treatment: "transparent" },

  // --- Iced Coffee Series --------------------------------------------------
  // One template, four flavours, each a finished social post. The crop keeps
  // the cup and its garnish and drops the headline above it and the flavour
  // name beside it; see `crop` on the Source type. The ground left behind is
  // the same flat orange the burger and hotdog cutouts sit on, so these tile
  // with them rather than against them.
  //
  // 2025/03/Ice-Coffee-FB-complete-no-price-1.jpg is the same series as a
  // four-cup lineup. It is a category image, not an item image, so it is not
  // mapped to any of the four rows.
  "coffee-americano": {
    file: "2025/03/AMERICANO.jpg",
    treatment: "cutout",
    crop: { left: 110, top: 320, width: 690, height: 690 },
  },
  "coffee-vanilla": {
    file: "2025/03/VANILLA.jpg",
    treatment: "cutout",
    crop: { left: 110, top: 320, width: 690, height: 690 },
  },
  "coffee-dark-mocha": {
    file: "2025/03/DARK-MOCHA.jpg",
    treatment: "cutout",
    crop: { left: 110, top: 320, width: 690, height: 690 },
  },
  "coffee-hazelnut": {
    file: "2025/03/HAZELNUT.jpg",
    treatment: "cutout",
    crop: { left: 110, top: 320, width: 690, height: 690 },
  },

  // --- Brand ---------------------------------------------------------------
  wordmark: { file: "2024/05/hotWingsLogo.png", treatment: "mark" },

  // --- Places --------------------------------------------------------------
  // Deliberately excluded: 2024/06/Untitled-design-47.png, which is the Sports
  // Lounge frontage. That venue closed in August 2026 and nothing in this app
  // may reference it.
  "scene-alfresco-dusk": { file: "2024/06/Untitled-design-41.png", treatment: "scene" },
  "scene-food-hall": { file: "2024/07/Untitled-design-5.png", treatment: "scene" },
  "scene-kiosk": { file: "2024/06/Untitled-design-46.png", treatment: "scene" },
  "scene-counter": { file: "2024/07/Untitled-design-4.png", treatment: "scene" },
  "branch-sm-city": { file: "2025/03/SM-Store-copy.jpg", treatment: "scene" },
  "branch-mango-avenue": { file: "2024/05/BUFFALO-BRADS-MANGO-29.jpg", treatment: "scene" },
};

/**
 * Measure the photographer's corner badge, in pixels.
 *
 * Several shots carry a flat orange triangle in the top-left carrying the
 * flavour's menu code (NY1, NY3, NY6). It is part of the pixels, and it still
 * has to be cropped out: a number burned into a photograph cannot be
 * reordered, corrected or read aloud, and it lands wherever the crop puts it.
 *
 * Cropping it does not discard it. The same number lives on
 * menu_options.code, added in migration 0068 and read out of the 2025/03
 * shoot's badges, and FlavourGrid draws it from there. Do not take the
 * numbers off the 2024/05 shoot: it numbers Brad's Gravy NY3 and Sweet Spicy
 * NY10, from the nine-flavour menu that predates Brad's Gravy.
 *
 * A fixed percentage inset was the obvious first answer and it was wrong: the
 * badge is a different fraction of the frame on a 5184px original than on a
 * 300px thumbnail, so one number either left a triangle showing or ate a third
 * of the photograph. This measures the run of badge-coloured pixels along the
 * top edge instead, which is exact for every source and needs no per-file
 * tuning.
 *
 * Only ever called for lifestyle photographs. The flattened cutouts sit on a
 * flat orange ground, so on those the scan would match the entire top edge.
 */
async function measureCornerBadge(input: string, width: number): Promise<number> {
  const stripHeight = Math.max(2, Math.round(width * 0.004));
  const { data, info } = await sharp(input)
    .extract({ left: 0, top: 0, width, height: stripHeight })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const isBadge = (x: number) => {
    const offset = x * channels;
    const [r, g, b] = [data[offset], data[offset + 1], data[offset + 2]];
    return r > 195 && g > 60 && g < 150 && b < 90;
  };

  let run = 0;
  while (run < width && isBadge(run)) run += 1;

  // A run covering most of the top edge is not a badge, it is an orange
  // background, so nothing is cropped.
  if (run > width * 0.5) return 0;

  return run > 0 ? Math.ceil(run * 1.04) : 0;
}

/**
 * The square crop window.
 *
 * The badge is a right triangle in the top-left corner, so it covers roughly
 * the pixels where `x + y < badgeWidth`. Any window whose top-left corner sits
 * outside that line contains none of it.
 *
 * That gives two ways to escape and one is much better than the other. Pushing
 * the window right is what the first attempt did, and on a 5184px original
 * where the badge spans 1801px it threw away the left third of the frame and
 * cut the basket in half. Pushing it down instead costs headroom, which these
 * shots have plenty of because the food sits low on a table.
 *
 * Size is traded for framing on purpose. Even a window at 80 percent of the
 * short side is around 2700px against a 900px output, so shrinking costs
 * nothing visible while a badly placed crop costs the photograph.
 */
function squareWindow(width: number, height: number, badgeWidth: number) {
  const full = Math.min(width, height);

  if (badgeWidth <= 0) {
    return {
      left: Math.round((width - full) / 2),
      top: Math.round((height - full) / 2),
      width: full,
      height: full,
    };
  }

  for (const scale of [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65]) {
    const size = Math.round(full * scale);
    const left = Math.round((width - size) / 2);
    const centredTop = Math.round((height - size) / 2);

    // Horizontally centred, as high up as the badge allows.
    for (const top of [centredTop, Math.min(height - size, badgeWidth - left)]) {
      if (top >= 0 && top + size <= height && left + top >= badgeWidth) {
        return { left, top, width: size, height: size };
      }
    }
  }

  // Nothing centred fits, so fall back to clearing the badge horizontally.
  const available = width - badgeWidth;
  const size = Math.min(available, height);
  return {
    left: badgeWidth + Math.round((available - size) / 2),
    top: Math.round((height - size) / 2),
    width: size,
    height: size,
  };
}

/** 3:2 centre crop for scenes, biased slightly up so signage survives. */
function sceneWindow(width: number, height: number) {
  const targetRatio = 3 / 2;
  let cropWidth = width;
  let cropHeight = Math.round(width / targetRatio);

  if (cropHeight > height) {
    cropHeight = height;
    cropWidth = Math.round(height * targetRatio);
  }

  return {
    left: Math.round((width - cropWidth) / 2),
    top: Math.round((height - cropHeight) * 0.35),
    width: cropWidth,
    height: cropHeight,
  };
}

export type Derivative = {
  /** The encoded WebP. */
  data: Buffer;
  width: number;
  height: number;
  /** A 12x12 WebP as a data URI, for the blur placeholder. */
  blurDataURL: string;
  treatment: Treatment;
  /** Path inside the archive's originals/ tree. */
  source: string;
  lowRes?: boolean;
  tentative?: string;
};

/**
 * Read one archive image and produce the derivative both jobs ship.
 *
 * Everything specific to this archive lives here: which shots can carry the
 * photographer's corner badge, which keep their alpha, what a scene is cropped
 * to against what a product tile is cropped to.
 */
export async function renderDerivative(key: string): Promise<Derivative> {
  const source = sources[key];
  if (!source) throw new Error(`no archive source registered for "${key}"`);

  const input = path.join(ORIGINALS, source.file);
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`${source.file} has no dimensions`);
  }

  const keepAlpha = source.treatment === "transparent" || source.treatment === "mark";
  const isScene = source.treatment === "scene";

  // The usable region of the original. Without a declared crop that is the
  // whole file, which is every source but the four coffee posts.
  const region = source.crop ?? { left: 0, top: 0, width: meta.width, height: meta.height };
  if (
    region.left < 0 ||
    region.top < 0 ||
    region.left + region.width > meta.width ||
    region.top + region.height > meta.height
  ) {
    throw new Error(
      `crop for "${key}" falls outside ${source.file} (${meta.width}x${meta.height})`,
    );
  }

  // Only the lifestyle shots can carry the badge, and only they can be
  // measured for it safely. A declared crop is already the statement of what
  // to remove, so scanning the original's top edge would measure pixels the
  // region has excluded.
  const badgeWidth =
    source.treatment === "lifestyle" && !source.crop
      ? await measureCornerBadge(input, meta.width)
      : 0;

  // A mark keeps its own proportions. Everything else is cropped: scenes to
  // 3:2, products to the square that the tile grid is built on. The window is
  // measured inside the region and then offset back onto the original, so a
  // cropped source is framed by the same rules as an uncropped one.
  const framed =
    source.treatment === "mark"
      ? { left: 0, top: 0, width: region.width, height: region.height }
      : isScene
        ? sceneWindow(region.width, region.height)
        : squareWindow(region.width, region.height, badgeWidth);
  const window = {
    ...framed,
    left: framed.left + region.left,
    top: framed.top + region.top,
  };
  const targetWidth = Math.min(isScene ? SCENE_WIDTH : TILE_WIDTH, window.width);

  // Every opaque source in this archive still carries an alpha channel it
  // never uses. Seventeen of them do, one across 8.9 MB. Dropping it is free.
  const pipeline = sharp(input)
    .extract(window)
    .resize(targetWidth, undefined, { fit: "inside", withoutEnlargement: true })
    .rotate();

  const rendered = keepAlpha
    ? pipeline.webp({ quality: 82, effort: 5 })
    : pipeline.flatten({ background: "#ef6212" }).webp({ quality: 80, effort: 5 });

  const buffer = await rendered.toBuffer({ resolveWithObject: true });

  const placeholder = await sharp(input)
    .extract(window)
    .resize(12, 12, { fit: "fill" })
    .webp({ quality: 40 })
    .toBuffer();

  return {
    data: buffer.data,
    width: buffer.info.width,
    height: buffer.info.height,
    blurDataURL: `data:image/webp;base64,${placeholder.toString("base64")}`,
    treatment: source.treatment,
    source: source.file,
    ...(source.lowRes ? { lowRes: true } : {}),
    ...(source.tentative ? { tentative: source.tentative } : {}),
  };
}
