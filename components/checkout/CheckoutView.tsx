"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { placeOrder } from "@/app/actions/checkout";
import { CustomerDetails, isDetailField } from "@/components/checkout/CustomerDetails";
import { OrderPlaced } from "@/components/checkout/OrderPlaced";
import { SlotPicker } from "@/components/checkout/SlotPicker";
import { Button, ButtonLink } from "@/components/ui/Button";
import { clearCart } from "@/lib/cart/store";
import { resolveCart } from "@/lib/cart/lines";
import { useCart } from "@/lib/cart/use-cart";
import { formatPeso } from "@/lib/format";
import { formatSlotRange } from "@/lib/slots/format";
import type { CheckoutDetails, CheckoutField, PlacedOrder } from "@/lib/checkout/types";
import type { PickupSlots } from "@/lib/slots/types";
import type { MenuCategory } from "@/lib/menu/types";

/**
 * Checkout, screen four of the four in spec section 11.
 *
 * The order of the questions is the order the spec asks for, and the reason is
 * worth keeping in view: the pickup window comes first because it is the one
 * constraint that can invalidate the whole order. Finding out that nothing is
 * available after typing a name and a phone number is the worst possible
 * sequence, so the question that can fail is asked first.
 *
 * WHAT THIS COMPONENT DOES NOT DO.
 *
 * It does not price anything. The totals on screen come from `resolveCart`,
 * which is the display side, and the figure the customer actually owes comes
 * back from `place_order` in the confirmation. If the two ever disagree, the
 * server is right and the screen was stale, which is exactly the case this
 * design is built to survive rather than prevent.
 *
 * It also does not decide whether the shop is open, whether a window still has
 * room, or whether a flavour is still on the menu. All three can change between
 * the page loading and the button being pressed, so all three are answered
 * inside the transaction that writes the order, and this screen's job is to say
 * what happened afterwards in words a person can act on.
 */

const EMPTY_DETAILS: CheckoutDetails = { name: "", phone: "", email: "", notes: "" };

export function CheckoutView({
  categories,
  slots,
}: {
  categories: MenuCategory[];
  slots: PickupSlots;
}) {
  const router = useRouter();
  const { cart, loaded } = useCart();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [details, setDetails] = useState<CheckoutDetails>(EMPTY_DETAILS);
  const [failure, setFailure] = useState<{ message: string; field: CheckoutField | null } | null>(
    null,
  );
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [submitting, startSubmitting] = useTransition();

  /**
   * The idempotency key, minted lazily and reused on every retry.
   *
   * Lazily, because generating it while rendering would produce one value on
   * the server pass and another on the client, and this has to be one value per
   * checkout rather than one per render. Reused, because that is the entire
   * point of it: a request that failed at the network is safe to send again
   * under the same id, and `place_order` will either place the order once or
   * hand back the one it already placed.
   */
  const attempt = useRef<string | null>(null);
  function attemptId(): string {
    attempt.current ??= crypto.randomUUID();
    return attempt.current;
  }

  const resolved = resolveCart(categories, cart);

  // The confirmation is checked before the cart is, and it has to be: placing
  // an order empties the cart, so the "nothing to check out" branch below would
  // otherwise replace the pickup code the moment it appeared.
  if (placed) return <OrderPlaced order={placed} />;

  if (!loaded) {
    return (
      <div aria-hidden className="mt-8 space-y-4">
        <div className="bg-nybb-charcoal/10 h-64 rounded-md" />
      </div>
    );
  }

  if (resolved.lines.length === 0) {
    return (
      <div className="mt-8">
        <p className="text-nybb-ink/70 max-w-prose leading-relaxed">
          There is nothing to check out. Build an order first and the pickup
          times will be waiting here.
        </p>
        <div className="mt-6">
          <ButtonLink href="/menu" tone="light">
            Browse the menu
          </ButtonLink>
        </div>
      </div>
    );
  }

  const chosenSlot = slots.slots.find((slot) => slot.startsAt === selectedSlot);
  const timezone = slots.branch?.timezone ?? "Asia/Manila";
  const detailError =
    failure && isDetailField(failure.field)
      ? { field: failure.field, message: failure.message }
      : null;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot || submitting) return;

    startSubmitting(async () => {
      const result = await placeOrder({
        attemptId: attemptId(),
        branchSlug: slots.branch?.slug ?? null,
        pickupSlotStart: selectedSlot,
        details,
        // Slugs and quantities. Not one price leaves this browser, because not
        // one price sent from a browser would be believed.
        lines: resolved.lines.map((line) => ({
          itemSlug: line.line.itemSlug,
          variationSlug: line.line.variationSlug,
          quantity: line.line.quantity,
          options: Object.entries(line.line.optionSlugs).flatMap(([groupSlug, optionSlugs]) =>
            optionSlugs.map((optionSlug) => ({ groupSlug, optionSlug })),
          ),
        })),
      });

      if (result.ok) {
        // The order exists, so this attempt is spent and the cart it was built
        // from is gone. Both have to happen before the confirmation renders, or
        // a customer who navigates back finds a cart that was already sold.
        attempt.current = null;
        clearCart();
        setPlaced(result.order);
        return;
      }

      if (result.newAttempt) attempt.current = null;
      if (result.staleSlots) {
        // The windows on screen are out of date. Clear the choice and re-render
        // the route, which re-runs get_pickup_slots on the server: the customer
        // is being asked to pick again, so they must be picking from the truth.
        setSelectedSlot(null);
        router.refresh();
      }
      setFailure({ message: result.error, field: result.field ?? null });
    });
  }

  return (
    // items-start, so each card is as tall as what is in it.
    // ================================================================
    // A grid row stretches its items to the tallest one, and the order summary
    // is the taller of these two whenever the branch has no windows to offer.
    // The pickup panel was therefore painting a charcoal slab roughly a
    // thousand pixels tall around four lines of text, which reads as a panel
    // that failed to load rather than as an honest answer.
    //
    // This does not cost the sticky summary anything. align-self sizes the item,
    // not the grid area, so the right column still has the whole row to travel
    // through on a long day of slots, which is the only time it has anywhere to
    // travel to.
    <form
      onSubmit={submit}
      className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12"
    >
      <div className="space-y-6">
        <div className="bg-nybb-charcoal text-nybb-bone rounded-md p-5 sm:p-7">
          <SlotPicker
            slots={slots}
            selected={selectedSlot}
            onSelect={setSelectedSlot}
            disabled={submitting}
          />
        </div>

        <div className="bg-nybb-charcoal text-nybb-bone rounded-md p-5 sm:p-7">
          <CustomerDetails
            details={details}
            onChange={setDetails}
            error={detailError}
            disabled={submitting}
          />
        </div>
      </div>

      <div className="lg:sticky lg:top-28">
        <div className="bg-nybb-charcoal text-nybb-bone rounded-md p-5 sm:p-6">
          <h2 className="font-display heading-panel">Your order</h2>

          <ul className="border-nybb-bone/15 mt-4 space-y-3 border-b pb-4 text-sm">
            {resolved.lines.map((line) => (
              <li key={line.key} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="font-mono-tabular text-nybb-bone/55 mr-2">
                    {line.line.quantity}x
                  </span>
                  {/* Named the way the cart named it one screen earlier. */}
                  <span className="font-display">{line.item.name}</span>
                  <span className="text-nybb-bone/55 block text-xs">
                    {[
                      line.item.variations.length > 1 ? line.variation.name : null,
                      ...line.options.map(({ option }) => option.name),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="font-mono-tabular shrink-0">
                  {formatPeso(line.totalCents)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-baseline justify-between gap-4">
            <span className="font-display heading-panel">Subtotal</span>
            <span className="font-mono-tabular text-nybb-orange text-2xl">
              {formatPeso(resolved.subtotalCents)}
            </span>
          </div>

          <p className="border-nybb-bone/15 mt-4 border-t pt-4 leading-relaxed">
            <span className="type-caps text-nybb-bone/55 block">Pickup</span>
            <span className="text-nybb-bone mt-1 block text-sm">
              {chosenSlot
                ? `${formatSlotRange(chosenSlot, timezone)}, ${slots.branch?.shortName}`
                : "No time chosen yet"}
            </span>
          </p>

          <Button
            type="submit"
            tone="dark"
            size="lg"
            block
            disabled={!selectedSlot || submitting}
            className="mt-6"
          >
            {submitting
              ? "Placing the order"
              : selectedSlot
                ? `Place order, ${formatPeso(resolved.subtotalCents)}`
                : "Choose a pickup time"}
          </Button>

          {/* Only the failures that are not about a field the customer can see.
              A refused name is said next to the name, because a message here
              would be somewhere else entirely on a phone, where the summary is
              the third card down. */}
          {failure && !isDetailField(failure.field) ? (
            // Bone on charcoal, with the red carried by a rule rather than by
            // the letters. Signage red on this ground measures 4.3:1, which is
            // under AA for body text, and an error message is the last thing on
            // a screen that should be hard to read. The rule only has to reach
            // 3:1 as a non-text indicator, and it does.
            <p
              role="alert"
              className="border-nybb-red text-nybb-bone mt-4 border-l-2 pl-3 text-sm leading-relaxed"
            >
              {failure.message}
            </p>
          ) : null}

          {/* Deliberately five words. The details panel explains the payment
              rail in full, and on a phone it is the card immediately above
              this one, so saying it twice reads as a page repeating itself.
              What is worth saying here, next to a button carrying a peso
              figure, is only that pressing it does not charge anybody. */}
          <p className="text-nybb-bone/65 mt-3 text-sm leading-relaxed">
            Nothing is charged now.
          </p>

          {/* Full width and inset to the card's edges, so it reads as the
              second rank of the same stack rather than as a stray underline
              hanging off the bottom left corner of the panel. */}
          <ButtonLink href="/cart" tone="dark" variant="ghost" block className="mt-4">
            Back to the cart
          </ButtonLink>
        </div>
      </div>
    </form>
  );
}
