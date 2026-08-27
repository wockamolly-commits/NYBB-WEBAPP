import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";
import { ReorderNotice } from "@/components/cart/ReorderNotice";
import { StoreBar } from "@/components/store/StoreBar";
import { getStoreSelection } from "@/lib/branches/selection";
import { onlineOrderingOpen } from "@/lib/checkout/payment-settings";
import { getStorefrontMenu } from "@/lib/menu";

export const metadata: Metadata = {
  title: "Your cart",
  description: "Review your pickup order from New York Buffalo Brad's Hot Wings.",
  // Nothing here is the same for two visitors and none of it is worth a search
  // result, so it stays out of the index.
  robots: { index: false, follow: true },
};

/**
 * The cart, screen three of the four in spec section 11.
 *
 * The cart itself is not on the page. What is on it is the menu, handed to a
 * client component that reads the cart out of localStorage and matches the two
 * together. That split is what keeps the whole storefront a server tree with a
 * few client islands, and it is why the menu arrives here as a prop rather
 * than being fetched from the browser.
 *
 * The menu serialises to about 24 kB, which is worth paying to have the cart
 * priced from the live menu instead of from whatever the customer's phone
 * remembered last week.
 *
 * WHY THE COUNTER AND THE ORDERING STATE ARE READ HERE.
 *
 * This is the last screen before a customer spends effort on a checkout, so it
 * is the last cheap place to tell them something that would sink it: that no
 * counter has been chosen, or that ordering is not open at all. Both used to
 * be discovered one screen later, after the cart had already been built.
 */
export default async function CartPage() {
  // The counter first, then the menu it is about. The cart is priced and
  // matched against what comes back, so a menu read that has not been told
  // which counter the customer chose would let a line survive here that the
  // chosen branch has held, all the way to a checkout that refuses it.
  const selection = await getStoreSelection();

  const [{ categories }, orderingOpen] = await Promise.all([
    getStorefrontMenu(selection.selected?.slug),
    onlineOrderingOpen(),
  ]);

  const canOrder = orderingOpen && selection.stores.some((store) => store.orderable);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display heading-page">Your cart</h1>
      <p className="text-nybb-ink/70 mt-4 max-w-lg text-base leading-relaxed">
        Pickup only, from the counter you choose. Prices are the same at every
        one.
      </p>

      {canOrder ? (
        <StoreBar selection={selection} returnTo="/cart" className="mt-8" />
      ) : null}

      <ReorderNotice />
      <CartView
        categories={categories}
        storeName={selection.selected?.shortName ?? null}
        orderingOpen={canOrder}
      />
    </div>
  );
}
