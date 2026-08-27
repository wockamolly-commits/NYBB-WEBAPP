import { describe, expect, it } from "vitest";
import {
  cropPreviewLayout,
  cropWindow,
  type MenuImageCrop,
} from "@/lib/staff/menu-image-crop";
import { isDecodableImageFile } from "@/lib/staff/menu-image-limits";

/**
 * The editor draws its live crop in the browser and the upload cuts the real
 * one with sharp, from the same numbers. These assertions are what keeps those
 * two from drifting: cropPreviewLayout is not allowed to be an approximation
 * of cropWindow, it has to be the same window expressed in CSS.
 *
 * What this file cannot check is whether a browser agrees, because there is
 * no browser here. That was checked once by hand, on 2026-08-27, with a
 * throwaway Playwright script: it rendered ImageField's markup at the real
 * tile size for six crops of a patterned source, screenshotted the tile, and
 * compared it against processMenuImage's output for the same crop. The worst
 * mean channel difference was 1.27 of 255, which is WebP and two different
 * resamplers, not a misplaced window. Redo that if the tile's markup changes
 * shape; the arithmetic below is what guards the numbers themselves.
 */

/** Every combination worth checking, rather than one hand-picked case. */
const SOURCES = [
  { width: 1600, height: 900 },
  { width: 900, height: 1600 },
  { width: 1000, height: 1000 },
  { width: 640, height: 481 },
];
const CROPS: MenuImageCrop[] = [
  { zoom: 1, offsetY: 0 },
  { zoom: 1, offsetY: -1 },
  { zoom: 1, offsetY: 1 },
  { zoom: 0.5, offsetY: 0 },
  { zoom: 0.5, offsetY: -0.35 },
  { zoom: 0.25, offsetY: 0.8 },
  // Out of range on both fields, the way a stale form or a hand-built
  // request sends them. Both sides have to clamp identically or the preview
  // stops matching the upload at exactly the values nobody tests by hand.
  { zoom: 4, offsetY: -9 },
  { zoom: 0, offsetY: 9 },
  { zoom: Number.NaN, offsetY: Number.NaN },
];

/**
 * Reads the crop window back out of the CSS layout.
 *
 * The layout places the source image inside a square box measured 0 to 100 in
 * both axes, so one source pixel is worth `widthPercent / sourceWidth` of the
 * box. Dividing back out recovers the window in source pixels, which is
 * exactly what sharp is handed.
 */
function windowFromLayout(source: { width: number; height: number }, crop: MenuImageCrop) {
  const layout = cropPreviewLayout(source.width, source.height, crop);
  const percentPerPixel = layout.widthPercent / source.width;
  return {
    left: -layout.leftPercent / percentPerPixel,
    top: -layout.topPercent / percentPerPixel,
    width: 100 / percentPerPixel,
    height: 100 / percentPerPixel,
  };
}

describe("cropPreviewLayout", () => {
  it("places the same window the server extracts", () => {
    for (const source of SOURCES) {
      for (const crop of CROPS) {
        const expected = cropWindow(source.width, source.height, crop);
        const actual = windowFromLayout(source, crop);
        const where = `${source.width}x${source.height} zoom=${crop.zoom} offsetY=${crop.offsetY}`;
        expect(actual.left, `left, ${where}`).toBeCloseTo(expected.left, 6);
        expect(actual.top, `top, ${where}`).toBeCloseTo(expected.top, 6);
        expect(actual.width, `width, ${where}`).toBeCloseTo(expected.width, 6);
        expect(actual.height, `height, ${where}`).toBeCloseTo(expected.height, 6);
      }
    }
  });

  it("keeps the whole crop inside the box and the box inside the source", () => {
    for (const source of SOURCES) {
      for (const crop of CROPS) {
        const layout = cropPreviewLayout(source.width, source.height, crop);
        // The image must cover the box on both axes, otherwise the live
        // preview shows a strip of empty tile the upload will not contain.
        expect(layout.leftPercent).toBeLessThanOrEqual(0.000001);
        expect(layout.topPercent).toBeLessThanOrEqual(0.000001);
        expect(layout.leftPercent + layout.widthPercent).toBeGreaterThanOrEqual(99.999999);
        expect(layout.topPercent + layout.heightPercent).toBeGreaterThanOrEqual(99.999999);
      }
    }
  });
});

describe("isDecodableImageFile", () => {
  it("takes the four formats by their declared type", () => {
    expect(isDecodableImageFile("shot.jpg", "image/jpeg")).toBe(true);
    expect(isDecodableImageFile("shot.png", "image/png")).toBe(true);
    expect(isDecodableImageFile("shot.webp", "image/webp")).toBe(true);
    expect(isDecodableImageFile("shot.avif", "image/avif")).toBe(true);
  });

  /**
   * The reason this function exists. A browser gets file.type from the
   * operating system, and Windows has no registry entry for .avif or .webp
   * unless something installed one, so the picker hands over a File whose
   * type is the empty string. Judging that on the declared type alone
   * refused perfectly good AVIF and WebP photographs with a message telling
   * the person to choose an AVIF or WebP photograph.
   */
  it("falls back to the extension when the browser declares no type", () => {
    expect(isDecodableImageFile("shot.avif", "")).toBe(true);
    expect(isDecodableImageFile("shot.webp", "")).toBe(true);
    expect(isDecodableImageFile("SHOT.JPEG", "")).toBe(true);
    expect(isDecodableImageFile("shot.pdf", "")).toBe(false);
    expect(isDecodableImageFile("shot", "")).toBe(false);
    expect(isDecodableImageFile("shot.svg", "")).toBe(false);
  });

  /**
   * The fallback is for a missing type, never for a contradicted one. A file
   * that says it is an SVG is refused whatever it is called, which is the
   * No-SVG ruling in menu-image-limits.ts holding.
   */
  it("refuses a declared type that is not decodable, whatever the name", () => {
    expect(isDecodableImageFile("shot.png", "image/svg+xml")).toBe(false);
    expect(isDecodableImageFile("shot.jpg", "application/pdf")).toBe(false);
  });
});
