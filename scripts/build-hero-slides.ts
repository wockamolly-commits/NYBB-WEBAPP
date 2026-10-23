/**
 * Build the landing hero's background stills.
 *
 * The source is the store's own wall artwork, re-laid out to 16:9 for this
 * hero. The print files are a different job: Wall Mural 2 is 3:1 and Wall Mural
 * 3 is 2.7:1 at up to 29370px wide, which is a wall, and no crop of a wall is a
 * hero. An earlier build tried to make one anyway, by placing each print mural
 * whole on a 2.05:1 canvas and filling the space above and below from its own
 * edges. It worked, and it was still a machine rebuilding a composition rather
 * than a composition. These files are the artwork actually arranged for this
 * shape, so all this script does is resize and encode.
 *
 * Run: npm run build:hero-slides
 *
 * THE WORDMARK IS OUT OF THE ARTWORK NOW, AT SOURCE.
 * ================================================================
 * Both murals carried the Hot Wings lockup in their top right corner, and the
 * header draws that same lockup about eighty pixels above it. Two wordmarks on
 * one screen is the duplicate The One Drawn Scene Per Page Rule is written
 * against, and it was previously going to be solved by cropping the panel off.
 * It is solved further upstream instead: the designer delivered both murals
 * with the lockup removed, so the crop is no longer load bearing and the full
 * composition can be shown. That is why nothing here cuts.
 *
 * WHAT IS STILL TRUE ABOUT CROPPING.
 * ================================================================
 * 16:9 is not the hero's shape. The section is about 2.05:1 at 1440x900 and
 * 2.28:1 at 1920x1080, so `object-fit: cover` fits these to the width and takes
 * 13 to 22 percent off the height. Both murals carry enough margin for that,
 * and `lib/hero/slideshow.ts` holds the picture above centre so that what goes
 * is the floor rather than the type over it.
 *
 * A phone is the harder case and it is not solved here either. The hero there
 * is taller than it is wide, so about a third of the width fits whatever this
 * script does. What a phone gets is a slow pan across the whole mural rather
 * than a fixed third of it; that is `.hero-pan-track` in app/globals.css, and
 * the ratio it needs to size itself is why the manifest below carries one.
 *
 * THE FOOT IS NOT BAKED IN ANY MORE.
 * ================================================================
 * This script used to fade the bottom sixth of each picture into the page's
 * ink, so the hero's bottom edge met the amber band below it as ink rather than
 * as pale wall. The join is real and it is still made, but it is made in CSS
 * (`.hero-foot`) rather than in the file, for two reasons that both come down
 * to where a number can be seen. Baked, it was a sixth of the artwork spent
 * before anybody had measured whether a sixth was needed, it cost a rebuild to
 * change, and it was cropped to a different depth at every viewport: at
 * 1920x1080 the bottom 138px of the picture is cut, which took most of the fade
 * away exactly where the page is widest. In the stylesheet it is one value, it
 * is the same depth on every screen because it is measured from the section's
 * own floor, and it can be tuned against a contrast reading in a second rather
 * than a minute. The committed files are now the artwork and nothing else.
 */

import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Where the 16:9 re-layouts are.
 *
 * Delivered 18 September 2026, alongside the print murals that
 * scripts/trace-mural.ts reads from NYBB_DESIGNS_DIR. They are 1672x941, which
 * is short of the 2400 this would otherwise commit. That is the resolution that
 * exists, and under a scrim that never falls below 10 percent ink it is not a
 * resolution anybody is reading detail out of. If a larger export arrives, drop
 * it in and re-run: nothing here assumes a size.
 */
const HERO_ART = process.env.NYBB_HERO_ART ?? "C:/Users/Steven/Downloads";

const OUT = path.join(process.cwd(), "public", "hero");
const MANIFEST = path.join(process.cwd(), "lib", "hero", "images.ts");

/** The width a slide is committed at, or the source's own if it is smaller. */
const SLIDE_WIDTH = 2400;

type Slide = {
  slug: string;
  file: string;
  /** What the mural shows, for whoever opens this file next. */
  note: string;
};

const SLIDES: readonly Slide[] = [
  {
    slug: "eating",
    file: "wall mural 2 (without logo).png",
    note: "someone biting into a wing, a rice bowl and a basket of wings, TASTY four times",
  },
  {
    slug: "spread",
    file: "wall mural 3 (without logo).png",
    note: "cheese sauced wings, carbonara, seasoned fries and a drink, SAUCY CRISPY YUMMY",
  },
];

type ManifestEntry = {
  src: string;
  width: number;
  height: number;
  blurDataURL: string;
  source: string;
};

async function build() {
  // Cleared rather than merged, the same as public/img: filenames carry a
  // content hash, so a rebuild would otherwise leave the old file behind.
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await mkdir(path.dirname(MANIFEST), { recursive: true });

  const manifest: Record<string, ManifestEntry> = {};

  for (const slide of SLIDES) {
    const input = path.join(HERO_ART, slide.file);

    const laid = await sharp(input)
      .resize(SLIDE_WIDTH, undefined, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();

    // quality 74 rather than the catalog's 80. A tile is looked at; this is
    // looked through, and the difference is well over 100 KB of a hero that a
    // phone on a Cebu connection has to have before it can read the headline.
    const rendered = await sharp(laid)
      .webp({ quality: 74, effort: 6 })
      .toBuffer({ resolveWithObject: true });

    const placeholder = await sharp(laid)
      .resize(12, 12, { fit: "fill" })
      .webp({ quality: 40 })
      .toBuffer();

    // Content addressed, for the reason public/img is: next.config.ts holds
    // optimized images for a year, so replacing an image has to replace its URL.
    const digest = createHash("sha256").update(rendered.data).digest("hex").slice(0, 8);
    const outputName = `${slide.slug}.${digest}.webp`;
    await writeFile(path.join(OUT, outputName), rendered.data);

    manifest[slide.slug] = {
      src: `/hero/${outputName}`,
      width: rendered.info.width,
      height: rendered.info.height,
      blurDataURL: `data:image/webp;base64,${placeholder.toString("base64")}`,
      source: slide.file,
    };

    const kb = Math.round(rendered.data.byteLength / 1024);
    console.log(
      `${slide.slug.padEnd(8)} ${rendered.info.width}x${rendered.info.height} ${String(kb).padStart(4)} KB  <- ${slide.file} (${slide.note})`,
    );
  }

  const entries = Object.entries(manifest)
    .map(
      ([slug, entry]) =>
        `  "${slug}": {\n` +
        `    src: "${entry.src}",\n` +
        `    width: ${entry.width},\n` +
        `    height: ${entry.height},\n` +
        `    blurDataURL:\n      "${entry.blurDataURL}",\n` +
        `  },`,
    )
    .join("\n");

  const file = `/**
 * GENERATED by scripts/build-hero-slides.ts. Do not edit.
 *
 * Run \`npm run build:hero-slides\` to regenerate. Each entry is one of the
 * store's wall murals in its 16:9 re-layout, with the wordmark already removed
 * at source: the hashed path under public/hero/, its intrinsic size, and a
 * 12x12 placeholder for the connection that will be a while getting the rest.
 *
 * The size is load bearing rather than informational. A phone pans across these
 * rather than holding a third of one, and the track that pans is sized from
 * this ratio (\`.hero-pan-track\` in app/globals.css).
 *
 * The order the hero plays these in is not here. See lib/hero/slideshow.ts.
 */

export type HeroImage = {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly blurDataURL: string;
};

export const HERO_IMAGES = {
${entries}
} as const satisfies Record<string, HeroImage>;

export type HeroImageName = keyof typeof HERO_IMAGES;
`;

  await writeFile(MANIFEST, file, "utf8");
  console.log(`\n${SLIDES.length} slides written to public/hero`);
  console.log("manifest lib/hero/images.ts");
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
