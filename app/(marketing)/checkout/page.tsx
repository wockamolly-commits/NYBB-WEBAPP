import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout/CheckoutView";
import { StoreBar } from "@/components/store/StoreBar";
import { getStorefrontMenu } from "@/lib/menu";
import { getPickupSlots } from "@/lib/slots/reader";
import { getStoreSelection } from "@/lib/branches/selection";
import { getCurrentCustomer, getCustomerProfile } from "@/lib/auth/session";
import { getCheckoutPaymentMethods } from "@/lib/checkout/payment-settings";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Choose a pickup time for your order.",
  robots: { index: false, follow: false },
};

/**
 * Checkout: the counter, the pickup window, the details, and the order.
 *
 * The reads happen here on the server: the windows, because the clock that
 * decides which are still reachable has to be the database's; the menu,
 * because the cart stores slugs and the prices have to come from the same
 * place they came from on the cart screen; and the counter, because it decides
 * which set of windows the other two are even about.
 *
 * THE COUNTER IS RESOLVED BEFORE THE SLOTS, NOT ALONGSIDE THEM.
 *
 * This is the one sequential read on the page and it has to be. `getPickupSlots`
 * used to be called with no argument, so `resolve_pickup_branch_id(null)`
 * picked the first active branch by sort_order and the customer collected from
 * whichever shop that happened to be. Passing the chosen slug is what makes
 * the grid on this screen the grid of the counter named above it.
 *
 * Nothing is cached. Spec section 23 is explicit that order data never is, and
 * a cached window is worse than a stale price: it offers a minute of a
 * kitchen's time that somebody else has already taken.
 */
export default async function CheckoutPage() {
  const selection = await getStoreSelection();

  const [{ categories }, slots, customer, profile, paymentMethods] = await Promise.all([
    getStorefrontMenu(),
    getPickupSlots(selection.selected?.slug),
    getCurrentCustomer(),
    getCustomerProfile(),
    getCheckoutPaymentMethods(),
  ]);

  const orderable = selection.stores.filter((store) => store.orderable);
  // Both halves, the same test every other screen in the flow applies. A band
  // naming the counter an order goes to, above a checkout that cannot take
  // one, would be this page disagreeing with its own button.
  const canOrder = paymentMethods.length > 0 && orderable.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display heading-page">Checkout</h1>
      <p className="text-nybb-ink/70 mt-4 max-w-lg text-base leading-relaxed">
        {canOrder
          ? "Two things left: where you collect, and when. The kitchen holds one slot per order, so the time you choose is the time your wings are ready."
          : "Online ordering is not open on this site yet, so this order cannot be completed here. Nothing in your cart is lost."}
      </p>

      {/* First on the screen, above the window grid, because it is what the
          grid is about. A customer who reads the times before the counter has
          been told the answer to the second question before the first. */}
      {canOrder ? (
        <StoreBar selection={selection} returnTo="/checkout" className="mt-8" />
      ) : null}

      <CheckoutView
        categories={categories}
        slots={slots}
        signedIn={Boolean(customer)}
        paymentMethods={paymentMethods}
        // Null means "let the server resolve it", which is the right answer
        // when there is one live counter and nobody has been asked. It is
        // never a price and never a name: place_order reads both from the
        // branch it resolves, not from anything sent here.
        branchSlug={selection.selected?.slug ?? null}
        storeChosen={Boolean(selection.selected)}
        storeCount={orderable.length}
        initialDetails={{
          name: profile?.displayName ?? "",
          phone: profile?.phone ?? "",
          email: customer?.email ?? "",
          notes: "",
        }}
      />
    </div>
  );
}
