import type { Metadata, Viewport } from "next";
import { Anton, Inter, JetBrains_Mono } from "next/font/google";
import { connection } from "next/server";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "New York Buffalo Brad's Hot Wings",
    template: "%s · NY Buffalo Brad's",
  },
  description:
    "Order your wings ahead and skip the queue. Pick a time, pay how you like, collect at the counter.",
  openGraph: {
    title: "New York Buffalo Brad's Hot Wings",
    description:
      "Order your wings ahead and skip the queue. Cebu City.",
    type: "website",
    locale: "en_PH",
  },
  // A referrer policy of "no-referrer" makes POSTs send `Origin: null`, which
  // breaks every Server Action with a 403. Keep this at same-origin.
  referrer: "same-origin",
  appleWebApp: {
    capable: true,
    title: "NYBB Order",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
};

/**
 * WHY THIS LAYOUT WAITS FOR A REQUEST, AND WHY THE WHOLE SITE IS DYNAMIC.
 *
 * `proxy.ts` mints a fresh nonce per request and puts it in the CSP. Next can
 * only stamp that nonce onto its script tags while rendering *in that request*.
 * A prerendered page is built before any request exists, so its HTML carries no
 * nonce, `strict-dynamic` then discards the `'self'` allowlist, and the browser
 * blocks every script on the page. That is not a theory: it shipped, and until
 * this line landed nothing on the production site hydrated at all. The cart sat
 * on its skeleton and the configurator never replaced its Suspense fallback.
 * `next dev` renders per request, so it stamped the nonce and looked fine,
 * which is exactly how it survived review.
 *
 * `connection()` is the documented way out. It stops prerendering here, and
 * because this layout wraps every route, it stops it everywhere. Next's own
 * guide is blunt about the trade: "When you use nonces in your CSP, all pages
 * must be dynamically rendered."
 *
 * So it is one or the other, and spec section 22 decides which. A nonce-based
 * CSP with `strict-dynamic` is Tier 1, non-negotiable. Static generation is a
 * caching preference in section 23. The security requirement wins, and section
 * 23 now records the correction.
 *
 * What this costs is HTML rendering per request, not database work: the menu
 * still comes through `getStorefrontMenu()` and can be cached by tag behind it.
 * If that cost ever bites, the fix is caching the data and the fragments, not
 * quietly putting the nonce back into a prerendered page.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();

  return (
    // The font variables belong on <html>, not on <body>. globals.css applies
    // font-sans to the html element itself, and a custom property defined on
    // body is not in scope for its own parent: --font-inter resolved to nothing
    // there and every paragraph on the site silently fell back to a serif.
    <html
      lang="en-PH"
      className={`${anton.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
