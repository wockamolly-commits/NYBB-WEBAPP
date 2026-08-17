import type { MetadataRoute } from "next";

/**
 * The install prompt, written for one device: the counter tablet.
 *
 * WHY THIS IS NOT THE STOREFRONT'S MANIFEST.
 * ================================================================
 * `start_url` is the orders board, not the menu, and that is a judgement about
 * who installs a site rather than about who uses it. Customers reach the menu
 * from a link or a search and order once; the counter tablet is opened at the
 * start of a shift, every shift, and is the one device that gains anything from
 * a home screen icon and a standalone window. Dropping staff on the storefront
 * would make that icon a slower way to reach a page they never open.
 *
 * If the customer side ever wants an installable experience of its own, this
 * file is the thing that has to change, because a manifest is per origin and
 * this one is spoken for.
 *
 * `orientation: "landscape"` is spec section 8.3. Android honours it inside a
 * standalone window; iOS ignores it, which is one more reason the tablet at
 * the counter is an Android one.
 *
 * The colours are the workspace's own ground, taken from `app/globals.css`
 * (`--color-nybb-ink` and `--color-nybb-orange`), so the splash screen does
 * not flash a colour that appears nowhere in the app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "New York Buffalo Brad's Workspace",
    short_name: "NYBB Workspace",
    description: "The orders board, and the alerts that arrive when it is closed.",
    start_url: "/workspace/orders",
    display: "standalone",
    orientation: "landscape",
    background_color: "#0b0b0c",
    theme_color: "#ef6212",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    ],
  };
}
