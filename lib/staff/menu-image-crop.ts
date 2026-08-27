/**
 * Where the crop window sits, in numbers both sides of the wire can run.
 *
 * Split out of menu-image.ts for the same reason menu-image-limits.ts was:
 * that file imports sharp, a native Node module, and the editor is a client
 * component. Before this split the editor could not know where the crop
 * window fell without asking the server, so it did not draw one at all, and a
 * person setting zoom and vertical position was adjusting a photograph they
 * could not see. Everything here is arithmetic, safe in both bundles, and
 * menu-image.ts re-exports MenuImageCrop so the server keeps one import.
 *
 * There is exactly one definition of the window. ImageField.tsx does not
 * approximate it in CSS: cropPreviewLayout below is cropWindow expressed as
 * percentages, and tests/unit/menu-image-crop.test.ts reads the window back
 * out of the layout and compares the two.
 */

/**
 * The ground an upload's transparency is flattened onto, the cutout ground
 * from scripts/lib/image-pipeline.ts.
 *
 * Here rather than in menu-image.ts because the editor paints it behind the
 * live crop. A PNG with an alpha channel looks like a floating cutout in the
 * browser and lands on solid orange in the bucket, and a preview that did not
 * show that would be lying about the one thing the upload changes.
 */
export const MENU_IMAGE_FLATTEN_BACKGROUND = "#ef6212";

/**
 * How far the crop window may shrink, as a fraction of the source's short
 * side. A quarter is four times magnification, which is already more than a
 * 900px tile can carry from anything but a very large original, and a floor
 * is what stops a stray value producing a one pixel crop.
 */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 1;

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

export type CropWindow = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * The crop window drawn as CSS, for a square box measured 0 to 100 on both
 * axes.
 *
 * Percentages rather than pixels so the editor can draw the tile at whatever
 * size the layout gives it, on a phone and on a desk, from one calculation.
 */
export type CropPreviewLayout = {
  widthPercent: number;
  heightPercent: number;
  leftPercent: number;
  topPercent: number;
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
export function cropWindow(width: number, height: number, crop: MenuImageCrop): CropWindow {
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
 * The same window, as the position of the whole source image inside a square
 * box that shows only the crop.
 *
 * The box is the window, so the image is scaled until the window's side
 * length covers the box (100 percent of it) and then pushed up and left by
 * the window's own origin. A negative left and top is the correct and normal
 * result: the parts of the photograph outside the crop hang off the box and
 * are clipped by it.
 */
export function cropPreviewLayout(
  width: number,
  height: number,
  crop: MenuImageCrop,
): CropPreviewLayout {
  const window = cropWindow(width, height, crop);
  // What one source pixel is worth, measured in percent of the box.
  const percentPerPixel = 100 / window.width;
  return {
    widthPercent: width * percentPerPixel,
    heightPercent: height * percentPerPixel,
    leftPercent: -window.left * percentPerPixel,
    topPercent: -window.top * percentPerPixel,
  };
}
