import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { POSTER_MAX_SIDE, processPosterImage } from "@/lib/staff/voucher-poster";
import {
  VOUCHER_POSTER_MAX_BYTES,
  isAcceptablePosterFile,
} from "@/lib/staff/voucher-poster-limits";

/**
 * Against the real sharp, like tests/unit/menu-image.test.ts, so every claim
 * is about an encoded image. The failure a poster can ship is a crop: the code
 * and the dates are usually printed near an edge, and a square cut would take
 * them off. So the first thing pinned is that the shape survives.
 */

async function pngFile(width: number, height: number, alpha = false): Promise<File> {
  const png = await sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha ? { r: 20, g: 20, b: 20, alpha: 0 } : { r: 239, g: 98, b: 18 },
    },
  })
    .png()
    .toBuffer();
  // Copied into a fresh Uint8Array for the reason menu-image.test.ts gives.
  return new File([new Uint8Array(png)], "poster.png", { type: "image/png" });
}

function dataUriBytes(uri: string): Buffer {
  return Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
}

describe("processPosterImage", () => {
  it("keeps a portrait poster portrait, scaled to the long side", async () => {
    const processed = await processPosterImage(await pngFile(2400, 3200));
    expect(processed.height).toBe(POSTER_MAX_SIDE);
    expect(processed.width).toBe(1200);
    const meta = await sharp(processed.data).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([1200, POSTER_MAX_SIDE]);
  });

  it("keeps a landscape poster landscape", async () => {
    const processed = await processPosterImage(await pngFile(3200, 1800));
    expect(processed.width).toBe(POSTER_MAX_SIDE);
    expect(processed.height).toBe(900);
  });

  it("never enlarges a small poster", async () => {
    const processed = await processPosterImage(await pngFile(600, 800));
    expect([processed.width, processed.height]).toEqual([600, 800]);
  });

  it("gives the placeholder the poster's own shape", async () => {
    // A 12x12 square, as the menu tile uses, would stretch a portrait poster
    // into a different picture for the moment before it loads.
    const processed = await processPosterImage(await pngFile(1200, 1600));
    expect(processed.blurDataURL.startsWith("data:image/webp;base64,")).toBe(true);
    const meta = await sharp(dataUriBytes(processed.blurDataURL)).metadata();
    expect(meta.width).toBe(12);
    expect(meta.height).toBe(16);
  });

  it("flattens transparency onto white, not the menu's orange", async () => {
    const processed = await processPosterImage(await pngFile(400, 600, true));
    const { data, info } = await sharp(processed.data).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);
    // Every channel near 255: white, not orange (whose blue is 18).
    expect(Math.min(data[0], data[1], data[2])).toBeGreaterThan(240);
  });

  it("refuses an SVG whose upload declares a different type", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
    const file = new File([new Uint8Array(svg)], "sneaky.png", { type: "image/png" });
    await expect(processPosterImage(file)).rejects.toThrow();
  });
});

describe("what a poster upload may be", () => {
  it("accepts the menu's four formats, by type or by name", () => {
    expect(isAcceptablePosterFile("a.jpg", "image/jpeg")).toBe(true);
    expect(isAcceptablePosterFile("a.avif", "")).toBe(true);
    expect(isAcceptablePosterFile("a.svg", "image/svg+xml")).toBe(false);
    expect(isAcceptablePosterFile("a.pdf", "application/pdf")).toBe(false);
  });

  it("allows a larger source than a menu photograph", () => {
    expect(VOUCHER_POSTER_MAX_BYTES).toBe(8 * 1024 * 1024);
  });
});
