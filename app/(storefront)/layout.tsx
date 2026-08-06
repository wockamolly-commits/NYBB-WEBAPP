import { CartBar } from "@/components/cart/CartBar";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";

/**
 * The public storefront chrome.
 *
 * This is a route group rather than the root layout because the staff
 * workspace lands in Phase 2 with its own chrome (landscape-first, no marketing
 * footer, a different auth surface). Splitting now costs nothing and means that
 * arrives as a sibling group instead of a rewrite of the root.
 */
export default function StorefrontLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <a
        href="#main"
        className="focus:bg-nybb-orange focus:text-nybb-ink sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60] focus:rounded focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <Header />
      <main id="main">{children}</main>
      <Footer />
      {/* After the footer, because it reserves its own height there rather
          than covering the last line of it. */}
      <CartBar />
    </>
  );
}
