import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";
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
 * The page is statically generated and the cart is not on it. What is on it is
 * the menu, handed to a client component that reads the cart out of
 * localStorage and matches the two together. That split is what keeps the
 * whole storefront a server tree with a few client islands, and it is why the
 * menu arrives here as a prop rather than being fetched from the browser.
 *
 * The menu serialises to about 24 kB, which is worth paying to have the cart
 * priced from the live menu instead of from whatever the customer's phone
 * remembered last week.
 */
export default async function CartPage() {
  const { categories } = await getStorefrontMenu();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display heading-page">Your cart</h1>
      <p className="text-nybb-ink/70 mt-4 max-w-lg text-base leading-relaxed">
        Pickup only, from the branch you choose at checkout. Prices are the same
        at every branch.
      </p>

      <CartView categories={categories} />
    </div>
  );
}
