import { cookies } from "next/headers";
import { CartBar } from "@/components/cart/CartBar";
import { CartSync } from "@/components/cart/CartSync";
import { MuralArt } from "@/components/mural/MuralArt";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { PromoBar } from "@/components/site/PromoBar";
import { PromoPosterPopup } from "@/components/site/PromoPosterPopup";
import { listBranches } from "@/lib/branches/reader";
import { getStoreSelection } from "@/lib/branches/selection";
import { PROMO_USED_COOKIE, parseUsed, withoutUsed } from "@/lib/promos/used";
import { listPromos } from "@/lib/promos/read";

/**
 * The public storefront chrome.
 *
 * This is a route group rather than the root layout because the staff
 * workspace lands in Phase 2 with its own chrome (landscape-first, no marketing
 * footer, a different auth surface). Splitting now costs nothing and means that
 * arrives as a sibling group instead of a rewrite of the root.
 *
 * The wall behind the ground is rendered here for the same reason. It used to
 * be `body::before`, which asserted that every route on the origin wants a
 * marketing watermark; the 404 has a street scene of its own and does not, and
 * the staff board will not either. Opting in here makes both of those the
 * default rather than something each surface has to switch off.
 */
export default async function StorefrontLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Both reads are memoised for the length of one request, so a page below
  // that asks the same questions pays nothing twice. listPromos answers with
  // an empty list for every failure including the flag being off, which is
  // what makes the bar absent rather than broken on a dark engine.
  const [selection, jar, branches] = await Promise.all([getStoreSelection(), cookies(), listBranches()]);

  // Two filters, and they cover different people. list_customer_promos drops
  // anything a SIGNED-IN customer has no redemptions left on, which works
  // across their devices and gives a promo back when an order is cancelled.
  // The cookie drops anything THIS BROWSER has spent, which is how a guest is
  // covered, since a listing has no phone number to count them by and must
  // never ask for one. Both only ever remove.
  const promos = withoutUsed(
    await listPromos(selection.selected?.slug ?? null),
    parseUsed(jar.get(PROMO_USED_COOKIE)?.value),
  );

  return (
    <>
      <a
        href="#main"
        className="focus:bg-nybb-orange focus:text-nybb-ink sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60] focus:rounded focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      {/* THE WALL, WHICH IS THE PAGE'S GROUND.
          ================================================================
          The branches are painted wall to wall with one hand drawn New York
          street, and this is that drawing, whole and uncropped, pressed into
          the page at low alpha. It replaces the buffalo silhouette that held
          this slot, which was a mark standing in for the store rather than
          anything the store actually has on its walls.

          Behind everything at z-index -1, so it sits between the body's fixed
          gradient and the page, exactly where the buffalo sat. Decoration with
          no accessible name: the wordmark in the header is what identifies the
          brand, and a description of a street scene read out before every page
          on the site would be noise.

          `fixed` and `cover`, which together are The Drawing Runs Off The Page
          Rule applied to a whole viewport. The artwork is a crop of a wall, so
          all four of its edges are meaningless, and filling the window with it
          means all four run off the screen instead of landing inside the page
          as drawn boundaries. Nothing has to be faded here for the same
          reason: with the layer pinned to the viewport there is no fourth edge
          left inside the page for a gradient to dissolve.

          Fixed rather than scrolling, so the drawing belongs to the window the
          way the gradient under it does. A wall that scrolled with a long menu
          would stop reading as the room the page is in and start reading as a
          very tall picture.

          Ink at 10%, which is The Drawing Darkens the Ground Rule. Everything
          on this site sits on top of this layer, so it darkens rather than
          lightens: at 10% a solid marker stroke directly behind a letter still
          measures 6.4:1 against the ink type on the darkest stop of the
          gradient, against 7.7:1 with no drawing at all, so the whole cost of
          the artwork is 1.3 of contrast on a budget that only needs 4.5. It is
          a point above the buffalo's 9% because a line drawing puts far less
          ink on the page per square inch than a filled silhouette does, so the
          same alpha reads fainter here. Under the landing page's full bleed
          dark bands it disappears completely, which is correct: those sections
          have their own ground. */}
      <MuralArt
        motif="wall"
        fit="cover"
        className="pointer-events-none fixed inset-0 z-[-1] h-full w-full text-nybb-ink opacity-[0.10]"
      />
      <Header />
      {/* Below the sticky header rather than inside it, so the band is seen
          on arrival and then scrolls away, handing over to a small floating
          reminder that PromoBar draws itself. It renders nothing when there
          is no promo, so there is no empty element in the flow. */}
      <PromoBar promos={promos} />
      {/* The same filtered list, so the popup can never show a poster for a
          promo the bar would not. It keeps only the ones with a poster and
          opens on each arrival at the home page, and on no other page. */}
      <PromoPosterPopup promos={promos} />
      <main id="main">{children}</main>
      <Footer branchCount={branches.length} />
      <CartSync />
      {/* After the footer, because it reserves its own height there rather
          than covering the last line of it. */}
      <CartBar />
    </>
  );
}
