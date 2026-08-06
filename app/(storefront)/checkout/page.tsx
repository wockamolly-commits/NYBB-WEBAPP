import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout/CheckoutView";
import { getStorefrontMenu } from "@/lib/menu";
import { getPickupSlots } from "@/lib/slots/reader";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Choose a pickup time for your order.",
  robots: { index: false, follow: false },
};

/**
 * Checkout, currently the pickup window and the order summary.
 *
 * Both reads happen here on the server: the windows, because the clock that
 * decides which are still reachable has to be the database's, and the menu,
 * because the cart stores slugs and the prices have to come from the same
 * place they came from on the cart screen.
 *
 * Nothing is cached. Spec section 23 is explicit that order data never is, and
 * a cached window is worse than a stale price: it offers a minute of a
 * kitchen's time that somebody else has already taken.
 */
export default async function CheckoutPage() {
  const [{ categories }, slots] = await Promise.all([
    getStorefrontMenu(),
    getPickupSlots(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display heading-page">Checkout</h1>
      <p className="text-nybb-ink/70 mt-4 max-w-lg text-base leading-relaxed">
        Pick the window you want to collect in. The kitchen holds one slot per
        order, so the time you choose is the time your wings are ready.
      </p>

      <CheckoutView categories={categories} slots={slots} />
    </div>
  );
}
