"use client";

import Link from "next/link";
import { useState } from "react";
import { SlotPicker } from "@/components/checkout/SlotPicker";
import { ActionLink } from "@/components/ui/ActionLink";
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
          <ActionLink href="/menu" tone="light">
            Browse the menu
          </ActionLink>
        </div>
      </div>
    );
  }

  const chosen = resolved.lines.length > 0 ? selectedSlot : null;
  const timezone = slots.branch?.timezone ?? "Asia/Manila";
  const chosenSlot = slots.slots.find((slot) => slot.startsAt === chosen);

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
      <div className="bg-nybb-charcoal text-nybb-bone rounded-md p-5 sm:p-7">
        <SlotPicker slots={slots} onSelect={setSelectedSlot} />
      </div>

      <div className="lg:sticky lg:top-28 lg:h-fit">
        <div className="bg-nybb-charcoal text-nybb-bone rounded-md p-5 sm:p-6">
          <h2 className="font-display text-sm tracking-[0.08em]">Your order</h2>

          <ul className="border-nybb-bone/15 mt-4 space-y-3 border-b pb-4 text-sm">
            {resolved.lines.map((line) => (
              <li key={line.key} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="font-mono-tabular text-nybb-bone/55 mr-2">
                    {line.line.quantity}x
                  </span>
                  {line.item.name}
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
            <span className="font-display text-sm tracking-[0.08em]">Subtotal</span>
            <span className="font-mono-tabular text-nybb-orange text-2xl">
              {formatPeso(resolved.subtotalCents)}
            </span>
          </div>

          <p className="border-nybb-bone/15 mt-4 border-t pt-4 text-xs leading-relaxed">
            <span className="text-nybb-bone/55 block tracking-[0.14em] uppercase">
              Pickup
            </span>
            <span className="text-nybb-bone mt-1 block">
              {chosenSlot
                ? `${formatSlotRange(chosenSlot, timezone)}, ${slots.branch?.shortName}`
                : "No time chosen yet"}
            </span>
          </p>

          {/* What is true today. The window can be chosen; the order cannot be
              placed, because place_order does not exist yet and neither do the
              name, phone and payment fields that feed it. Saying so beats a
              button that fails. */}
          <button
            type="button"
            disabled
            className="bg-nybb-bone/15 text-nybb-bone/55 font-display mt-6 min-h-12 w-full cursor-not-allowed rounded-md text-sm tracking-[0.06em]"
          >
            {chosenSlot ? "Placing orders opens soon" : "Choose a pickup time"}
          </button>
          <p className="text-nybb-bone/55 mt-3 text-xs leading-relaxed">
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

          <div className="mt-5">
            <Link
              href="/cart"
              className="font-display text-nybb-bone/65 hover:text-nybb-bone inline-flex min-h-11 items-center text-xs underline underline-offset-4 transition-colors"
            >
              Back to the cart
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
