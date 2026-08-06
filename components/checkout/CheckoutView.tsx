"use client";

import Link from "next/link";
import { useState } from "react";
import { SlotPicker } from "@/components/checkout/SlotPicker";
import { Button, ButtonLink } from "@/components/ui/Button";
import { resolveCart } from "@/lib/cart/lines";
import { useCart } from "@/lib/cart/use-cart";
import { formatPeso } from "@/lib/format";
import { formatSlotRange } from "@/lib/slots/format";
import type { PickupSlots } from "@/lib/slots/types";
import type { MenuCategory } from "@/lib/menu/types";

/**
 * Checkout, screen four of the four in spec section 11.
 *
 * Half a screen today, and honest about which half. The pickup time is here
 * and it works; the name, the phone number and the payment choice arrive with
 * `place_order`, because those fields are only meaningful once something can
 * receive them. A form that collects a phone number and then cannot place an
 * order is worse than no form.
 *
 * The order it renders in is the order spec section 11 asks for: the pickup
 * window first, because it is the constraint that can invalidate everything
 * else, and the summary after it.
 */
export function CheckoutView({
  categories,
  slots,
}: {
  categories: MenuCategory[];
  slots: PickupSlots;
}) {
  const { cart, loaded } = useCart();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const resolved = resolveCart(categories, cart);

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

  const chosen = resolved.lines.length > 0 ? selectedSlot : null;
  const timezone = slots.branch?.timezone ?? "Asia/Manila";
  const chosenSlot = slots.slots.find((slot) => slot.startsAt === chosen);

  // items-start, so each card is as tall as what is in it.
  // ================================================================
  // A grid row stretches its items to the tallest one, and the order summary
  // is the taller of these two whenever the branch has no windows to offer.
  // The pickup panel was therefore painting a charcoal slab roughly a
  // thousand pixels tall around four lines of text, which is the current live
  // state of this screen: a "not open yet" notice sitting at the top of an
  // enormous empty box reads as a panel that failed to load rather than as an
  // honest answer.
  //
  // This does not cost the sticky summary anything. align-self sizes the item,
  // not the grid area, so the right column still has the whole row to travel
  // through on a long day of slots, which is the only time it has anywhere to
  // travel to. Its own h-fit is redundant once the row stops stretching, so it
  // goes.
  return (
    <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
      <div className="bg-nybb-charcoal text-nybb-bone rounded-md p-5 sm:p-7">
        <SlotPicker slots={slots} onSelect={setSelectedSlot} />
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

          {/* What is true today. The window can be chosen; the order cannot be
              placed, because place_order does not exist yet and neither do the
              name, phone and payment fields that feed it. Saying so beats a
              button that fails. */}
          <Button tone="dark" size="lg" block disabled className="mt-6">
            {chosenSlot ? "Placing orders opens soon" : "Choose a pickup time"}
          </Button>
          <p className="text-nybb-bone/65 mt-3 text-sm leading-relaxed">
            Your details and payment land with the next release. To order today,
            call the branch on the{" "}
            <Link
              href="/contact"
              className="text-nybb-bone underline decoration-current/40 underline-offset-4 hover:decoration-current"
            >
              branches page
            </Link>
            .
          </p>

          {/* Full width and inset to the card's edges, so it reads as the
              second rank of the same stack rather than as a stray underline
              hanging off the bottom left corner of the panel. */}
          <ButtonLink
            href="/cart"
            tone="dark"
            variant="ghost"
            block
            className="mt-4"
          >
            Back to the cart
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
