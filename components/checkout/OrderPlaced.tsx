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
export function OrderPlaced({ order }: { order: PlacedOrder }) {
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
          <div>
            <dt className="type-caps text-nybb-bone/55">To pay at the counter</dt>
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
        <p className="text-nybb-ink/70 mt-3 max-w-prose text-sm leading-relaxed">
          Bookmark that page, or keep this tab open. The link is what opens your
          order later, and we cannot send you another copy of it until accounts
          arrive.
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
