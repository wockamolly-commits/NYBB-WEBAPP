import type { Metadata, Viewport } from "next";
import { Anton, Inter, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
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

/**
 * The brand's own script, and the one job it is allowed to do.
 *
 * This is the face the store's tagline artwork is set in, identified by
 * rendering all four delivered files against the delivered lettering. It is
 * here to letter one fixed phrase, "#Your All Time Favorite Chicken Wings",
 * which is a logo doing a logo's job rather than a typeface doing a text one.
 * It never sets an interface string, a heading, a label or a price: Anton keeps
 * every one of those, because the type scale in DESIGN.md is measured against
 * Anton's metrics and a script face at 14px in caps is illegible anyway.
 *
 * DESIGN.md used to end on a flat prohibition against a fourth typeface. The
 * owner has overridden it for this use, and the document now records the
 * narrowed rule rather than the old one.
 *
 * `display: "swap"` and a preload, because this face renders one short line
 * inside the footer and a blocking fetch for it would be absurd.
 *
 * LICENCE, RECORDED BECAUSE IT DOES NOT GO AWAY BY BEING UNDOCUMENTED. The file
 * declares "Free for personal use" in its own name table and carries fsType 4,
 * which permits preview and print embedding rather than the editable embedding
 * a webfont implies. A commercial web licence from Octotype is what makes this
 * shipping legally, and it has been raised with the owner, who has decided to
 * proceed. Do not extend its use further on the strength of it already being
 * here.
 */
const daughterOfFortune = localFont({
  src: "./fonts/DaughterOfFortune.ttf",
  // Named for the face, not the role. globals.css maps the role token
  // `--font-script` onto it, the same indirection the other three use, so
  // swapping the face later is one line in the stylesheet.
  variable: "--font-daughter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  /**
   * TEMPORARY. REMOVE THIS WHEN THE FRANCHISE FORM CAN ACTUALLY SAVE A LEAD.
   * ================================================================
   * The deployment is public and has no Supabase credentials set, so
   * `supabaseConfigured()` is false and `storeFranchiseInquiry` refuses every
   * submission. A would-be franchisee reaching /franchise today gets an error
   * and an email address, which is honest but is not what the page is for.
   *
   * Being findable is the entire point of a franchise site, so hiding it is a
   * cost, not a free precaution. It is worth paying only while the form cannot
   * do its job: a page that ranks and then fails converts a lead into a bad
   * first impression of the business.
   *
   * A `noindex` tag rather than a `robots.txt` disallow, and the difference
   * matters. A disallow stops crawlers READING the page, which also stops them
   * reading any instruction on it, so a URL already known can stay listed with
   * no description. `noindex` invites the crawler in specifically to be told
   * not to list it, which works whether or not the page was indexed before.
   * For that reason this project deliberately has no robots.txt: adding one
   * that blocks crawling would undo this.
   *
   * The workspace sets the same thing for a permanent reason (staff tools are
   * nobody's search result). This one is temporary and inherits to every route
   * under it, the storefront included.
   *
   * TO UNDO: delete this block, redeploy, and request indexing in Google Search
   * Console rather than waiting to be recrawled.
   */
  robots: { index: false, follow: false },
  title: {
    default: "New York Buffalo Brad's Hot Wings",
    template: "%s · NY Buffalo Brad's",
  },
  // The description sells the restaurant, not the ordering platform. What was
  // here described the checkout ("pick a time, pay how you like") to a reader
  // who has not yet been told what the food is, on a business whose one
  // genuinely uncopyable thing is that it prices heat on a five stop scale.
  description:
    "Nine flavours of chicken wings on a five stop scale of heat, fried to order at counters across Cebu. Pickup only.",
  openGraph: {
    title: "New York Buffalo Brad's Hot Wings",
    // The store's own tagline leads the share card, which is also what the
    // share image itself letters. One line, one voice, both surfaces.
    description:
      "#Your All Time Favorite Chicken Wings. Nine flavours, five levels of heat, across Cebu.",
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
      className={`${anton.variable} ${inter.variable} ${jetbrainsMono.variable} ${daughterOfFortune.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
