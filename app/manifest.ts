import type { MetadataRoute } from "next";

/**
 * The install prompt, written for one device: the counter tablet.
 *
 * WHY THIS IS NOT THE STOREFRONT'S MANIFEST.
 * ================================================================
 * `start_url` is the orders board, not the menu. The customer half of this
 * project is a native app (see `docs/mobile-app-transition.md`), so the only
 * audience left with a reason to install this site to a home screen is staff,
 * and dropping them on the storefront would make the installed icon a slower
 * way to reach a page they never open.
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
