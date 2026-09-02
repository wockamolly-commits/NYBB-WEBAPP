import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  MENU_IMAGE_MAX_BYTES,
  isDecodableImageType,
  processMenuImage,
} from "@/lib/staff/menu-image";

/**
 * These run in Node against the real sharp, so every assertion below is made
 * about an actual encoded image rather than about a mock's call log. That is
 * the point: the failure this pipeline can ship is a crop that is off, and no
 * amount of "was extract called with these numbers" catches that.
 */

const ORANGE = { r: 239, g: 98, b: 18 };
const INK = { r: 20, g: 20, b: 20 };

/**
 * A rectangle in two horizontal bands, orange over ink.
 *
 * A solid fill was the obvious sample and it cannot test the thing that
 * matters: two crops taken from different heights of a solid rectangle encode
 * to byte-identical WebP, so the offset assertion would pass whether or not
 * offsetY did anything at all. The bands make the vertical position of the
 * window observable in the output pixels.
 */
async function sampleFile(width = 1600, height = 900): Promise<File> {
  const half = Math.max(1, Math.round(height / 2));
  const png = await sharp({
    create: { width, height, channels: 3, background: ORANGE },
  })
    .composite([
      {
        input: { create: { width, height: half, channels: 3, background: INK } },
        top: height - half,
        left: 0,
      },
    ])
    .png()
    .toBuffer();
  // sharp's Buffer types as Uint8Array<ArrayBufferLike>, which BlobPart
  // (File's constructor) refuses because ArrayBufferLike also covers
  // SharedArrayBuffer. Uint8Array's own copy constructor allocates a fresh,
  // definitely-not-shared backing buffer, which File accepts.
  return new File([new Uint8Array(png)], "sample.png", { type: "image/png" });
}

/** A square PNG that is genuinely transparent, for the flatten assertion. */
async function transparentFile(size = 500): Promise<File> {
  const png = await sharp({
    create: { width: size, height: size, channels: 4, background: { ...INK, alpha: 0 } },
  })
    .png()
    .toBuffer();
  return new File([new Uint8Array(png)], "cutout.png", { type: "image/png" });
}

/** Mean brightness of the first channel, which separates the two bands. */
async function meanRed(data: Buffer): Promise<number> {
  const stats = await sharp(data).stats();
  return stats.channels[0].mean;
}

describe("processMenuImage", () => {
  it("crops to a square at the tile width", async () => {
    const processed = await processMenuImage(await sampleFile(), { zoom: 1, offsetY: 0 });
    expect(processed.width).toBe(processed.height);
    expect(processed.width).toBe(900);
  });

  it("never enlarges a source smaller than the tile width", async () => {
    const processed = await processMenuImage(await sampleFile(400, 400), { zoom: 1, offsetY: 0 });
    expect(processed.width).toBe(400);
  });

  it("produces a webp buffer", async () => {
    const processed = await processMenuImage(await sampleFile(), { zoom: 1, offsetY: 0 });
    expect((await sharp(processed.data).metadata()).format).toBe("webp");
  });

  it("produces a blur placeholder small enough to inline", async () => {
    const processed = await processMenuImage(await sampleFile(), { zoom: 1, offsetY: 0 });
    expect(processed.blurDataURL.startsWith("data:image/webp;base64,")).toBe(true);
    expect(processed.blurDataURL.length).toBeLessThan(400);
  });

  it("moves the crop window with the offset", async () => {
    const top = await processMenuImage(await sampleFile(900, 1600), { zoom: 1, offsetY: -1 });
    const bottom = await processMenuImage(await sampleFile(900, 1600), { zoom: 1, offsetY: 1 });
    expect(top.data.equals(bottom.data)).toBe(false);

    // Not merely different: the right way round. The sample is orange over
    // ink, so the top of the window is the bright band and the bottom is the
    // dark one. A sign error here would still pass the inequality above.
    expect(await meanRed(top.data)).toBeGreaterThan(await meanRed(bottom.data));
  });

  it("takes a closer square as the zoom multiplier shrinks", async () => {
    const full = await processMenuImage(await sampleFile(1600, 1600), { zoom: 1, offsetY: 0 });
    const closer = await processMenuImage(await sampleFile(1600, 1600), { zoom: 0.5, offsetY: 0 });
    // Both cap at the 900px tile, so the proof is the pixels and not the size:
    // a half-width window centred on a 1600px square sits entirely inside the
    // orange band, where the full window is half orange and half ink.
    expect(full.width).toBe(900);
    expect(closer.width).toBe(800);
    expect(await meanRed(closer.data)).toBeGreaterThan(await meanRed(full.data));
  });

  it("clamps a zoom that would crop outside the source", async () => {
    // Pinned, not just "does not throw": on the default 1600x900 sample the
    // short side is 900, so MIN_ZOOM (0.25) gives a 225px window and
    // MAX_ZOOM (1) gives the full 900px window. Asserting only that these
    // resolve would let MIN_ZOOM or MAX_ZOOM drift in menu-image.ts without
    // any test noticing that the 1x-4x slider in ImageField.tsx had silently
    // stopped matching what it clamps to.
    const tooClose = await processMenuImage(await sampleFile(), { zoom: 0.01, offsetY: 0 });
    expect(tooClose.width).toBe(225);
    const tooFar = await processMenuImage(await sampleFile(), { zoom: 99, offsetY: 0 });
    expect(tooFar.width).toBe(900);
    await expect(
      processMenuImage(await sampleFile(), { zoom: Number.NaN, offsetY: 12 }),
    ).resolves.toBeTruthy();
  });

  it("flattens transparency onto the brand ground", async () => {
    const processed = await processMenuImage(await transparentFile(), { zoom: 1, offsetY: 0 });
    const meta = await sharp(processed.data).metadata();
    expect(meta.hasAlpha).toBe(false);
    // Orange, not whatever happened to be behind the tile.
    expect(await meanRed(processed.data)).toBeGreaterThan(200);
  });

  it("refuses an SVG whose upload declares a different type", async () => {
    // file.type is whatever the multipart part header claims, not what the
    // bytes actually are. isDecodableImageType alone would let this through
    // ("image/png" passes it), which is exactly the input the No-SVG ruling
    // in menu-image-limits.ts exists to keep out: sharp can and will
    // rasterise an SVG regardless of what the request called it. This pins
    // that processMenuImage itself, not just the client's declared type,
    // is what stops it.
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
    const file = new File([new Uint8Array(svg)], "sneaky.png", { type: "image/png" });
    await expect(processMenuImage(file, { zoom: 1, offsetY: 0 })).rejects.toThrow();
  });

  it("names the types it can decode and the size it accepts", () => {
    expect(isDecodableImageType("image/jpeg")).toBe(true);
    expect(isDecodableImageType("image/webp")).toBe(true);
    expect(isDecodableImageType("image/svg+xml")).toBe(false);
    expect(isDecodableImageType("application/pdf")).toBe(false);
    expect(MENU_IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});
