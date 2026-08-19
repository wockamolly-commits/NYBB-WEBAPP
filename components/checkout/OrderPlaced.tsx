"use client";

import { ButtonLink } from "@/components/ui/Button";
import { formatPeso } from "@/lib/format";
import { orderTrackingHref } from "@/lib/orders/tracking";
import { dayLabel, formatSlotRange, localDateKey } from "@/lib/slots/format";
import type { PlacedOrder } from "@/lib/checkout/types";

/**
 * The order landed. What the customer needs from this screen, in order.
 *
 * The pickup code is the largest thing on it, because it is the only thing
 * they have to produce at the counter and the only thing worth memorising in
 * the walk from the car. The short code is underneath at reading size: it
 * identifies the order in conversation and staff will ask for it, but nobody
 * needs it in the moment of collection.
 *
 * The tracking link is the primary action underneath it, and it is the only
 * time the tracking token is ever put in front of the customer. If they leave
 * this screen without following or saving it, a guest order becomes
 * unreachable from a browser, which is why the copy says so plainly instead of
 * quietly relying on them not to close the tab.
 */
export function OrderPlaced({
  order,
  signedIn = false,
}: {
  order: PlacedOrder;
  /** Decides whether the tracking link is a convenience or the only copy. */
  signedIn?: boolean;
}) {
  const timezone = order.branch.timezone;
  const tracking = orderTrackingHref(order.shortCode, order.trackingToken);
  const window = formatSlotRange(
    { startsAt: order.pickupSlotStart, endsAt: order.pickupSlotEnd },
    timezone,
  );
  // Relative to the branch's day, exactly as the picker said it one screen
  // earlier. Reading the clock here is safe where it would not be in a server
  // component: this only ever renders after the customer has pressed a button,
  // so there is no first paint for it to disagree with.
  const day = dayLabel(
    localDateKey(order.pickupSlotStart, timezone),
    timezone,
    new Date().toISOString(),
  );

  return (
    <div className="mt-8 max-w-2xl">
      <div className="bg-nybb-charcoal text-nybb-bone rounded-md p-6 sm:p-8">
        <p className="type-caps text-nybb-orange">Order placed</p>

        <h2 className="font-display heading-minor mt-3">
          {day}, {window}
        </h2>
        <p className="text-nybb-bone/70 mt-3 leading-relaxed">
          The kitchen has it. Come to the counter in your window and give the
          code below.
        </p>

        <div className="border-nybb-bone/15 mt-7 border-t pt-6">
          <p className="type-caps text-nybb-bone/55">Your pickup code</p>
          {/* Spaced by tracking rather than by inserted characters, so it can
              still be selected and copied as four digits. */}
          <p className="font-mono-tabular text-nybb-orange mt-2 text-6xl leading-none tracking-[0.18em]">
            {order.pickupCode}
          </p>
          <p className="text-nybb-bone/70 mt-4 max-w-prose text-sm leading-relaxed">
            It is what proves the order is yours, so please do not post it
            anywhere.
          </p>
        </div>

        <dl className="border-nybb-bone/15 mt-6 grid gap-4 border-t pt-6 sm:grid-cols-2">
          <div>
            <dt className="type-caps text-nybb-bone/55">Order number</dt>
            <dd className="font-mono-tabular mt-1 text-base">{order.shortCode}</dd>
          </div>
          {/* IT SAID "TO PAY AT THE COUNTER" UNTIL PICKUP BECAME PAYMENT
              FIRST. Nothing on this platform takes money at a counter any
              more, so the label was telling a customer to arrive with cash for
              an order they had already settled. "Order total" is what the
              figure is, and it stays true whichever rail paid it. */}
          <div>
            <dt className="type-caps text-nybb-bone/55">Order total</dt>
            <dd className="font-mono-tabular text-nybb-orange mt-1 text-base">
              {formatPeso(order.totalCents)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="type-caps text-nybb-bone/55">Collect from</dt>
            <dd className="mt-1 text-base leading-relaxed">{order.branch.name}</dd>
          </div>
        </dl>
      </div>

      {/* The primary action, and the only place the tracking token is ever put
          in front of the customer. There is no account to look this up from
          yet, so a guest who leaves without following or bookmarking this has
          no way back to the order from a browser. Hence the sentence under it,
          which is a warning rather than a nicety. */}
      <div className="mt-6">
        <ButtonLink href={tracking} tone="light" size="lg">
          Track this order
        </ButtonLink>
        {/* THIS USED TO END "UNTIL ACCOUNTS ARRIVE". They arrived: /account
            carries the order history and a signed-in customer can reopen any
            order from it without the link. So the warning is now only true for
            a guest, and telling a signed-in customer their order is one closed
            tab from being lost is a false alarm about their own account. */}
        <p className="text-nybb-ink/70 mt-3 max-w-prose text-sm leading-relaxed">
          {signedIn
            ? "This order is in your account, so you can reopen it from there at any time. The link above is the quick way back to it."
            : "Bookmark that page, or keep this tab open. You ordered as a guest, so that link is the only way back to this order from a browser."}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/menu" tone="light" variant="secondary">
          Order something else
        </ButtonLink>
        <ButtonLink href="/contact" tone="light" variant="ghost">
          Branch phone numbers
        </ButtonLink>
      </div>
    </div>
  );
}
