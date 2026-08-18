import type { MetadataRoute } from "next";

/**
 * The customer site's install prompt.
 *
 * WHY THIS EXISTS AT ALL, GIVEN THAT NOBODY INSTALLS A RESTAURANT WEBSITE.
 * ================================================================
 * iOS delivers Web Push only to a site the customer has added to their Home
 * Screen. So on iPhone this file is not a nicety, it is the difference between
 * a customer being told their order is ready and not being told. Android needs
 * no install for push and gains only the icon.
 *
 * This used to describe the counter tablet, back when the customer half of the
 * product was a native app and staff were the only audience left with a reason
 * to install anything. The tablet now has `public/workspace.webmanifest`, named
 * by the workspace layout's metadata, because a manifest is per origin and
 * these two audiences want opposite things from one.
 *
 * No orientation lock, deliberately: the tablet wants landscape and a phone in
 * a car park wants whichever way it is being held.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "New York Buffalo Brad's Hot Wings",
    short_name: "NY Buffalo Brad's",
    description: "Order wings for pickup, and know the moment they are ready.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0c",
    theme_color: "#ef6212",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    ],
  };
}
