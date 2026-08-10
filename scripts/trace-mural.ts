/**
 * Turn the store's delivered mural artwork into the SVG motifs the site ships.
 *
 * Run: npm run build:mural
 *
 * WHAT ARRIVED, AND WHY THIS SCRIPT EXISTS.
 * ================================================================
 * The marketing designer handed over twelve files and every visual one is
 * raster. No .ai, no .eps, no .svg, no .pdf, so there are no live paths to
 * export and a tracing step is unavoidable. Of the four files named as murals,
 * exactly one is line art: "Wall Mural 1.jpg" at 18283x15118, genuinely
 * greyscale and flat. The other three are advertising layouts built from food
 * photography on a grey studio ground, and two of those are the same layout at
 * different crops. So every drawn motif on this site comes out of one file.
 *
 * The source lives outside the repository, per AGENTS.md rule 5, and only the
 * optimized exports under public/mural/ are committed. Nothing here runs at
 * build or request time: it is run by hand when the artwork changes, exactly
 * like scripts/build-static-images.ts.
 *
 * THE SCALE CEILING, WHICH DECIDED THE CROPS.
 * ================================================================
 * Hatching in the source is about ten pixels wide against an eighteen thousand
 * pixel canvas. For those strokes to survive as discrete strokes rather than
 * merging into a tone, the working bitmap has to keep them at two pixels or
 * more, which pins the working width at roughly a fifth of the source width.
 * Scale the *whole* canyon down to anything a browser will show and the fine
 * strokes land under a pixel and smear, which is the one thing DESIGN.md's
 * hatching rule forbids outright.
 *
 * The answer is not a smaller export, it is a smaller subject. Every large
 * placement takes a crop of the scene rather than the scene, and the crop is
 * chosen so its own fine strokes still clear a pixel at the width it renders
 * at. Where a motif genuinely has to be small, the `cull` option removes the
 * fine strokes in the bitmap before tracing, so the small variant is a real
 * simplification rather than the same paths scaled into mud.
 */

import { createHash } from "node:crypto";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { traceBitmap, wrapSvg, type TraceOptions } from "./lib/trace";

const DESIGNS =
  process.env.NYBB_DESIGNS_DIR ??
  "C:/Users/Steven/Downloads/NYBB_DESIGNS-20260807T033848Z-1-001/NYBB_DESIGNS";

const OUT = path.join(process.cwd(), "public", "mural");

const SOURCES = {
  mural1: "Wall Mural 1.jpg",
  leftMural: "Left Mural After Cashier 153x130 inches.jpg",
  skylineOutline: "Silhouette_traced building copy.png",
} as const;

type Motif = TraceOptions & {
  slug: string;
  source: keyof typeof SOURCES;
  /** Source pixel rectangle. Omit to take the whole file. */
  crop?: { left: number; top: number; width: number; height: number };
  /** Width of the bitmap actually traced. This is the single most important
   *  number here: it sets how many pixels a hatching stroke gets. */
  workingWidth: number;
  /** Morphological opening radius, in working pixels. Removes ink features
   *  thinner than 2r+1, which is how a small variant loses its hatching
   *  deliberately instead of losing it to resampling. */
  cull?: number;
  /** Straighten a baseline bent by the curve of a cup. */
  flattenBaseline?: boolean;
  /** Turn an open outline into a solid silhouette by inking everything under it. */
  fillBelow?: boolean;
  title?: string;
};

/**
 * The motifs, and what each one is for.
 *
 * One mural surface per page, so these are deliberately few. Adding a motif
 * because it exists in the source is how a system ends up with eleven drawings
 * and no rule about when to use any of them.
 */
const MOTIFS: Motif[] = [
  {
    // The page ground on every storefront route, where the buffalo mark used
    // to be. The whole canyon, uncropped: the curtain wall on the left, the
    // marquee, the signal, the traffic and the crossing.
    //
    // WHY THIS ONE IS TRACED WHOLE WHEN NOTHING ELSE IS.
    // ================================================================
    // Every other placement takes a crop, because a crop is how a drawing
    // survives being shown small with its hatching intact. This one cannot be
    // cropped, because what it has to carry is the composition: it is the
    // ground behind a page, it is read at a glance and never looked at, and a
    // corner of a building at 9% is a texture rather than a street.
    //
    // The Hatching Stays Strokes Rule bites here and the answer is not the
    // `cull` option. Opening this scene at any radius fragments it: the marker
    // strokes in the source run one to two working pixels at the widths this
    // has to trace at, so an erosion breaks them into dashes and the marquee
    // lettering comes apart. Culled at 1600 and at 2800 both read as damage
    // rather than as simplification, which is the failure the option exists to
    // avoid, arriving from the other side.
    //
    // What works is leaving the strokes alone and admitting more of them. The
    // rule's real subject is ink turning into neutral grey, and that is a
    // statement about ink at full strength on white. At 9% char on the amber
    // there is no grey available: a hatch field that merges below a pixel
    // composites to a slightly deeper amber, which is the same thing the
    // buffalo silhouette did to the same ground, deliberately. So this is a
    // stated exemption for the ground layer and not a new default. See
    // DESIGN.md.
    slug: "wall",
    source: "mural1",
    // 2200 puts the viewBox just above the width the layer renders at on a
    // desktop, so the browser is scaling down slightly rather than up, and
    // holds the file at 150kB. 1800 traced heavier, not lighter: below the
    // source's stroke pitch the resampler smears neighbouring hatch lines
    // together and the tracer then has more, longer outlines to follow.
    workingWidth: 2200,
    simplify: 1,
    minArea: 10,
    title: "The Buffalo Brad's street scene painted on the branch walls",
  },
  {
    // The 404. The corner of the shop, its marquee, and the awning below it.
    // A crop rather than the whole canyon: at the width a 404 renders, the
    // canyon's hatching would be under a pixel everywhere.
    slug: "storefront",
    source: "mural1",
    // LANDSCAPE, AND CROPPED FOR THE SHAPE IT IS SHOWN IN.
    // The first crop was portrait, 0.78, and the 404 shows it in a landscape
    // box at about 1.35. `cover` therefore sliced a horizontal band out of a
    // tall drawing, and the band it happened to land on was the sparse patch
    // under the awning: the drawing looked like it stopped short of the section
    // and left a gap of bare amber. Nothing was mis-sized, the artwork simply
    // had nothing to say in that stripe. Cropping to the aspect the placement
    // actually uses fixes it at the source, which is the only place it can be
    // fixed. Ink density now runs 18% to 32% across eight horizontal bands with
    // no empty stripe anywhere.
    crop: { left: 4200, top: 5600, width: 6000, height: 4450 },
    workingWidth: 1600,
    simplify: 0.85,
    minArea: 8,
    title: "The Buffalo Brad's marquee on a New York street corner",
  },
  {
    // The same corner, with the hatching culled, for widths where the detailed
    // trace cannot hold. The storefront's fine strokes are 3.3 units in a 1500
    // unit viewBox, so they clear a pixel down to about 450px of render width
    // and go under it on a phone. Rather than let the browser antialias them
    // into a wash, this variant loses them at the bitmap and keeps the ruled
    // lines and the marker outlines, which are what carry the drawing anyway.
    // Swapped by breakpoint in app/not-found.tsx, never scaled into.
    slug: "storefront-small",
    source: "mural1",
    // Same crop as the detailed variant, so the phone and the desktop are
    // looking at one drawing rather than two different corners.
    crop: { left: 4200, top: 5600, width: 6000, height: 4450 },
    // Sized to land at the same working scale as before (about 0.17 of source),
    // which is the scale at which an opening radius of 1 removes the fine
    // hatching and leaves the ruled lines and marker outlines standing.
    workingWidth: 1000,
    cull: 1,
    simplify: 1.05,
    minArea: 12,
    title: "The Buffalo Brad's marquee on a New York street corner",
  },
  {
    // The empty cart. A signal at rest is the right subject for a screen whose
    // whole message is that nothing has moved yet.
    slug: "signal",
    source: "mural1",
    crop: { left: 13950, top: 3850, width: 2500, height: 2250 },
    workingWidth: 1100,
    simplify: 0.8,
    minArea: 7,
    title: "A New York traffic signal",
  },
  // The tile motifs. Small, rotated in a grid, and culled: at tile size the
  // fine strokes cannot render, so they are removed at the bitmap rather than
  // left to resampling, which would grey them.
  //
  // THREE, AND WHY NOT MORE. Seven crops were traced and rendered at 260px
  // before these three were kept. A crosswalk, an awning, a run of mid-distance
  // traffic and an ornate cornice all read as abstract scratches once the fine
  // strokes were culled: the eye needs a recognisable object at that size, and
  // architectural texture on its own is not one. They were dropped rather than
  // shipped, because a tile carrying unreadable marks is the "looks broken"
  // failure the NoPhotoTile exists to avoid, just at a different angle.
  {
    slug: "tile-signal",
    source: "mural1",
    // Tight on the two lamp hoods. The first pass took the whole signal plus
    // the building behind it and the hoods disappeared into the facade.
    crop: { left: 14450, top: 4080, width: 1700, height: 1800 },
    workingWidth: 600,
    cull: 1,
    simplify: 1.1,
    minArea: 14,
  },
  {
    slug: "tile-car",
    source: "mural1",
    crop: { left: 3050, top: 10750, width: 6000, height: 3600 },
    workingWidth: 700,
    cull: 1,
    simplify: 1.1,
    minArea: 14,
  },
  {
    slug: "tile-crowd",
    source: "mural1",
    crop: { left: 100, top: 10150, width: 3900, height: 4100 },
    workingWidth: 640,
    cull: 1,
    simplify: 1.1,
    minArea: 14,
  },
  {
    // The footer. Traced off the printed cup rather than from the delivered
    // "Silhouette_traced building copy.png", because that file is an anonymous
    // hollow outline and the packaging carries a filled skyline with the
    // Liberty figure and the bridge in it. The footer's whole argument is that
    // it matches the box in the customer's hand, and the delivered file does
    // not. Traced from a photograph of a cylinder, so the baseline is
    // straightened afterwards.
    // The plain city that carries the footer across its full width.
    //
    // The packaging skyline is a compact emblem centred on the Liberty figure,
    // roughly 1.28:1, because it wraps a cup. It cannot be a full width band:
    // stretched across a footer it would stand four hundred pixels tall, and
    // repeating it puts four Statues of Liberty in a row. So the width is
    // carried by the designer's own traced outline, which is 15:1 and was drawn
    // for exactly this job, filled here so it matches the packaging's weight.
    // The two sit on one baseline in the footer: plain buildings running the
    // width, the landmarks anchored at the right.
    slug: "skyline-band",
    source: "skylineOutline",
    workingWidth: 1560,
    threshold: 160,
    simplify: 0.5,
    minArea: 20,
    fillBelow: true,
  },
  {
    slug: "skyline",
    source: "leftMural",
    // The middle of the printed band only. Towards the cup's edges the print
    // foreshortens into the curve and the baseline correction below cannot help
    // with that, because there the distortion is a horizontal compression
    // rather than a vertical shift.
    crop: { left: 669, top: 7600, width: 761, height: 596 },
    workingWidth: 1100,
    threshold: 118,
    simplify: 0.7,
    minArea: 25,
    flattenBaseline: true,
    title: "The New York skyline from the Buffalo Brad's packaging",
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });

  const manifest: Array<Record<string, unknown>> = [];
  const registry: Array<{ slug: string; file: string; width: number; height: number }> = [];
  const written = new Set<string>();

  for (const motif of MOTIFS) {
    const file = path.join(DESIGNS, SOURCES[motif.source]);

    let pipeline = sharp(file, { limitInputPixels: 4_000_000_000 });
    if (motif.crop) pipeline = pipeline.extract(motif.crop);

    const { data, info } = await pipeline
      // Flatten first: the transparent PNGs would otherwise composite their
      // alpha against black and arrive as solid ink.
      .flatten({ background: "#ffffff" })
      .greyscale()
      .resize({ width: motif.workingWidth, fit: "inside" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Annotated rather than inferred. Bare `Uint8Array` means
    // `Uint8Array<ArrayBufferLike>` in current TypeScript, which is what the
    // helpers below return, while an inferred local from `Uint8Array.from`
    // narrows to `Uint8Array<ArrayBuffer>` and then refuses to take one back.
    let grey: Uint8Array = Uint8Array.from(data);

    if (motif.cull) grey = cullThinStrokes(grey, info.width, info.height, motif.cull, motif.threshold ?? 128);
    if (motif.fillBelow) grey = fillBelow(grey, info.width, info.height, motif.threshold ?? 128);
    if (motif.flattenBaseline) grey = flattenBaseline(grey, info.width, info.height, motif.threshold ?? 128);

    const traced = traceBitmap(grey, info.width, info.height, {
      threshold: motif.threshold,
      simplify: motif.simplify,
      minArea: motif.minArea,
    });

    const svg = wrapSvg(traced, { title: motif.title });

    // Content-hashed, for the reason recorded as trap 2 in docs/HANDOFF.md:
    // next.config.ts sets a one year minimumCacheTTL, so a derivative that
    // keeps its path keeps being served after the artwork behind it changed.
    // The buffalo mark already does this and the murals follow it.
    const hash = createHash("sha256").update(svg).digest("hex").slice(0, 8);
    const exportName = `${motif.slug}.${hash}.svg`;
    await writeFile(path.join(OUT, exportName), svg, "utf8");
    written.add(exportName);

    registry.push({
      slug: motif.slug,
      file: exportName,
      width: traced.width,
      height: traced.height,
    });

    const kb = Buffer.byteLength(svg) / 1024;
    manifest.push({
      slug: motif.slug,
      viewBox: `${traced.width}x${traced.height}`,
      loops: traced.loops,
      points: traced.points,
      kb: Number(kb.toFixed(1)),
    });

    console.log(
      `${motif.slug.padEnd(16)} ${String(traced.width).padStart(5)}x${String(traced.height).padEnd(5)}` +
        ` loops=${String(traced.loops).padStart(5)} points=${String(traced.points).padStart(6)}` +
        ` ${kb.toFixed(1)}kB${kb > 200 ? "   *** OVER BUDGET" : ""}`,
    );
  }

  // Sweep the exports a previous run left behind. Content hashing means an
  // edited crop writes a new filename rather than replacing one, so without
  // this public/mural/ accumulates every version ever traced.
  for (const existing of await readdir(OUT)) {
    if (existing.endsWith(".svg") && !written.has(existing)) {
      await unlink(path.join(OUT, existing));
      console.log(`swept ${existing}`);
    }
  }

  await writeFile(path.join(process.cwd(), "lib", "mural", "assets.ts"), renderRegistry(registry), "utf8");
  console.table(manifest);
}

/**
 * The generated registry.
 *
 * Committed rather than read at runtime, because the hashed filename and the
 * intrinsic size both have to be known while rendering, and a component that
 * fetched a manifest to find out how tall a drawing is would be doing work the
 * build already did. `lib/catalog/` carries its image manifest the same way.
 */
function renderRegistry(
  entries: Array<{ slug: string; file: string; width: number; height: number }>,
): string {
  const rows = entries
    .map(
      (entry) =>
        `  "${entry.slug}": { src: "/mural/${entry.file}", width: ${entry.width}, height: ${entry.height} },`,
    )
    .join("\n");

  return `/**
 * GENERATED by scripts/trace-mural.ts. Do not edit.
 *
 * Run \`npm run build:mural\` to regenerate. Each entry is a traced motif from
 * the store's wall artwork: the hashed path under public/mural/, and the
 * intrinsic size of its viewBox so a caller can reserve the right aspect ratio
 * without loading the file.
 */

export type MuralMotif = {
  readonly src: string;
  readonly width: number;
  readonly height: number;
};

export const MURAL_MOTIFS = {
${rows}
} as const satisfies Record<string, MuralMotif>;

export type MuralMotifName = keyof typeof MURAL_MOTIFS;
`;
}

/**
 * Remove ink features thinner than `2r+1` working pixels.
 *
 * A morphological opening: erode, then dilate by the same radius. Anything
 * narrower than the kernel disappears in the erosion and has nothing to grow
 * back from, while a thick stroke loses its edge and gets it back. Separable,
 * so the cost is linear in the radius rather than quadratic.
 *
 * This is what makes a small variant honest. The alternative, scaling the
 * detailed paths down until the hatching is a third of a pixel, hands the
 * browser something it can only render as a grey wash, and there is no neutral
 * grey in this system.
 */
function cullThinStrokes(
  grey: Uint8Array,
  width: number,
  height: number,
  radius: number,
  threshold: number,
): Uint8Array {
  // 1 where there is ink.
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = grey[i] < threshold ? 1 : 0;

  const eroded = separable(mask, width, height, radius, Math.min);
  const opened = separable(eroded, width, height, radius, Math.max);

  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = opened[i] === 1 ? 0 : 255;
  return out;
}

function separable(
  source: Uint8Array,
  width: number,
  height: number,
  radius: number,
  pick: (a: number, b: number) => number,
): Uint8Array {
  const horizontal = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = source[y * width + x];
      for (let d = -radius; d <= radius; d++) {
        const nx = x + d;
        if (nx < 0 || nx >= width) continue;
        value = pick(value, source[y * width + nx]);
      }
      horizontal[y * width + x] = value;
    }
  }

  const vertical = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = horizontal[y * width + x];
      for (let d = -radius; d <= radius; d++) {
        const ny = y + d;
        if (ny < 0 || ny >= height) continue;
        value = pick(value, horizontal[ny * width + x]);
      }
      vertical[y * width + x] = value;
    }
  }

  return vertical;
}

/**
 * Turn an open outline into a solid silhouette.
 *
 * The designer's traced skyline is a single stepped hairline: the top edge of a
 * city and nothing else, open along the bottom. That is the correct shape for a
 * footer band and the wrong weight, because the packaging prints its skyline
 * filled, and a hairline next to a solid emblem would read as two different
 * drawings rather than one city.
 *
 * Filling it is one pass: find the highest ink in each column and ink
 * everything below. Columns with no ink at all stay empty, which is what keeps
 * a genuine gap in the skyline a gap rather than a block.
 */
function fillBelow(
  grey: Uint8Array,
  width: number,
  height: number,
  threshold: number,
): Uint8Array {
  const out = new Uint8Array(width * height).fill(255);

  for (let x = 0; x < width; x++) {
    let top = -1;
    for (let y = 0; y < height; y++) {
      if (grey[y * width + x] < threshold) {
        top = y;
        break;
      }
    }
    if (top < 0) continue;
    for (let y = top; y < height; y++) out[y * width + x] = 0;
  }

  return out;
}

/**
 * Straighten a baseline bent by the curve of the cup it is printed on.
 *
 * The packaging skyline is only available as a photograph of a cylinder, so its
 * base arcs. Every column is shifted vertically until the lowest ink in it sits
 * on the same row, which is exactly right for a cylinder seen head on: the
 * distortion along a vertical line is a translation, not a scale.
 *
 * It does not correct the horizontal foreshortening towards the cup's edges,
 * which is why the crop takes the middle of the printed band and leaves the
 * ends alone.
 */
function flattenBaseline(
  grey: Uint8Array,
  width: number,
  height: number,
  threshold: number,
): Uint8Array {
  const baseline = new Int32Array(width).fill(-1);

  for (let x = 0; x < width; x++) {
    for (let y = height - 1; y >= 0; y--) {
      if (grey[y * width + x] < threshold) {
        baseline[x] = y;
        break;
      }
    }
  }

  const known = [...baseline].filter((value) => value >= 0);
  if (known.length === 0) return grey;
  const target = Math.max(...known);

  const out = new Uint8Array(width * height).fill(255);
  for (let x = 0; x < width; x++) {
    if (baseline[x] < 0) continue;
    const shift = target - baseline[x];
    for (let y = 0; y < height; y++) {
      const sy = y - shift;
      if (sy < 0 || sy >= height) continue;
      out[y * width + x] = grey[sy * width + x];
    }
  }

  return out;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
