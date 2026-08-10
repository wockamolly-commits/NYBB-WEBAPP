import { telHref } from "@/lib/phone";
import { formatPeso } from "@/lib/format";
import { PICKUP_STEPS, statusCopy, stepIndex } from "@/lib/orders/status";
import { dayLabel, formatSlotRange, localDateKey } from "@/lib/slots/format";
import type { TrackedOrder } from "@/lib/orders/types";
import { cn } from "@/lib/utils";

/**
 * One order, on the customer's phone, somewhere between the car park and the
 * counter.
 *
 * A server component, and it stays one so customer data is always rendered
 * from the authorized RPC. OrderTrackingLiveRefresh is the small client
 * sibling that listens for a data-free change signal and refreshes this server
 * tree. "I'm here" remains spec section 27's Phase 3.
 *
 * The pickup code is the largest thing on the screen while it is worth
 * anything, and stops being so the moment it is not. A four digit code shouted
 * at the top of a collected order is a screen that has not noticed the
 * customer is already eating.
 */

/**
 * Tone lives in the heading and nowhere else.
 *
 * The first cut of this card carried a four pixel coloured edge down its left
 * side, and it was wrong for three separate reasons. Nothing else on this site
 * does it: the cart, the checkout and the menu are all plain charcoal
 * rectangles, so one card with a stripe reads as a component from a different
 * product. It could not be seen in the common case, because bone at 25% on
 * charcoal is a hairline nobody notices and "waiting" is where almost every
 * order sits. And where it could be seen it was saying something the screen had
 * already said twice over.
 *
 * What is left is enough, because the states differ structurally rather than
 * decoratively. A ready order carries an orange heading, orange bars and a
 * six-line orange code. A stopped one has no code and no ladder at all, so it
 * is visibly a shorter, quieter card, and its heading says "Cancelled" in
 * words. Red would have added nothing a person could act on, and signage red
 * on charcoal measures 4.3:1, which is under AA for text anyway.
 */
const ACCENT: Record<string, string> = {
  waiting: "text-nybb-bone",
  ready: "text-nybb-orange",
  done: "text-nybb-bone",
  stopped: "text-nybb-bone",
};

export function OrderTracker({ order }: { order: TrackedOrder }) {
  const copy = statusCopy(order);
  const accent = ACCENT[copy.tone];
  const timezone = order.branch.timezone;
  const reached = stepIndex(order.status);
  const now = new Date().toISOString();

  return (
    <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
      <div className="space-y-6">
        <section
          aria-labelledby="order-status"
          className="bg-nybb-charcoal text-nybb-bone rounded-md p-5 sm:p-7"
        >
          <p className="type-caps text-nybb-bone/55">Order {order.shortCode}</p>
          <h2
            id="order-status"
            className={cn("font-display heading-minor mt-2", accent)}
          >
            {copy.title}
          </h2>
          <p className="text-nybb-bone/75 mt-3 max-w-prose leading-relaxed">
            {copy.body}
          </p>

          {copy.codeIsLive ? (
            <div className="border-nybb-bone/15 mt-6 border-t pt-5">
              <p className="type-caps text-nybb-bone/55">Your pickup code</p>
              {/* Spaced by tracking rather than by inserted characters, so it
                  can still be selected and copied as four digits. */}
              <p className="font-mono-tabular text-nybb-orange mt-2 text-6xl leading-none tracking-[0.18em]">
                {order.pickupCode}
              </p>
              <p className="text-nybb-bone/65 mt-4 max-w-prose text-sm leading-relaxed">
                This is what proves the order is yours, so please do not post it
                anywhere.
              </p>
            </div>
          ) : null}

          {/* The ladder is only drawn for an order that is still on it. A
              cancelled order does not need three dead rungs beside the one it
              stopped at: the message above has already said what happened, and
              drawing the rest would diagram something that did not occur. */}
          {/* Four bars always, four labels only where four labels fit.
              ================================================================
              At 375 the columns are about 70px wide and "COLLECTED" in
              12px caps at 0.14em tracking wants 78, so the last two labels
              ran into each other and the fourth was cut off by the card. The
              floor from the small-screen pass is 12px, so shrinking the type
              is not available, and these are single words that cannot wrap.

              Naming only the current step on a phone is not a consolation
              prize either: what somebody in a car park needs from this is
              where their food is now, and the bars still carry the shape of
              the whole journey. The full ladder returns at sm.

              Screen readers get every rung and its state at every width, from
              the sr-only labels, so the responsive part is purely visual. */}
          {reached >= 0 ? (
            <div className="border-nybb-bone/15 mt-6 border-t pt-5">
              <ol className="grid grid-cols-4 gap-2">
                {PICKUP_STEPS.map((step, index) => {
                  const done = index <= reached;
                  return (
                    <li key={step.status}>
                      <span
                        aria-hidden
                        className={cn(
                          "block h-1 rounded-full",
                          done ? "bg-nybb-orange" : "bg-nybb-bone/15",
                        )}
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "type-caps mt-2 hidden sm:block",
                          done ? "text-nybb-bone" : "text-nybb-bone/40",
                        )}
                      >
                        {step.label}
                      </span>
                      <span className="sr-only">
                        {step.label}
                        {index === reached
                          ? ", current step"
                          : done
                            ? ", done"
                            : ", to come"}
                      </span>
                    </li>
                  );
                })}
              </ol>

              <p
                aria-hidden
                className="type-caps text-nybb-bone mt-3 sm:hidden"
              >
                Step {reached + 1} of {PICKUP_STEPS.length},{" "}
                {PICKUP_STEPS[reached].label}
              </p>
            </div>
          ) : null}
        </section>

        <section
          aria-labelledby="order-collection"
          className="bg-nybb-charcoal text-nybb-bone rounded-md p-5 sm:p-7"
        >
          <h2 id="order-collection" className="font-display heading-panel">
            Where and when
          </h2>

          <dl className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="type-caps text-nybb-bone/55">Pickup window</dt>
              <dd className="mt-1 leading-relaxed">
                {order.pickup
                  ? `${dayLabel(localDateKey(order.pickup.startsAt, timezone), timezone, now)}, ${formatSlotRange(order.pickup, timezone)}`
                  : "No window on this order"}
              </dd>
            </div>
            <div>
              <dt className="type-caps text-nybb-bone/55">Collect from</dt>
              <dd className="mt-1 leading-relaxed">
                {order.branch.name}
                <span className="text-nybb-bone/65 block text-sm">
                  {order.branch.addressLine}, {order.branch.city}
                </span>
              </dd>
            </div>
            {order.branch.phones.length > 0 ? (
              <div className="sm:col-span-2">
                <dt className="type-caps text-nybb-bone/55">
                  If anything changes
                </dt>
                <dd className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                  {/* A phone number is somewhere you go, so it stays a link
                      rather than becoming a button. */}
                  {order.branch.phones.map((phone) => (
                    <a
                      key={phone}
                      href={telHref(phone)}
                      className="font-mono-tabular text-nybb-bone underline decoration-current/40 underline-offset-4 hover:decoration-current"
                    >
                      {phone}
                    </a>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>

      <div className="lg:sticky lg:top-28">
        <section
          aria-labelledby="order-summary"
          className="bg-nybb-charcoal text-nybb-bone rounded-md p-5 sm:p-6"
        >
          <h2 id="order-summary" className="font-display heading-panel">
            {order.customer.name}&rsquo;s order
          </h2>

          <ul className="border-nybb-bone/15 mt-4 space-y-3 border-b pb-4 text-sm">
            {order.items.map((item, index) => (
              // The snapshot names, so this keeps describing what was actually
              // bought however the menu has been edited since. There is no id
              // to key on and no need for one: this list never reorders.
              <li
                key={index}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="font-mono-tabular text-nybb-bone/55 mr-2">
                    {item.quantity}x
                  </span>
                  <span className="font-display">{item.name}</span>
                  <span className="text-nybb-bone/55 block text-xs">
                    {[
                      item.variationLabel,
                      ...item.options.map((option) => option.name),
                    ].join(" · ")}
                  </span>
                </span>
                <span className="font-mono-tabular shrink-0">
                  {formatPeso(item.lineTotalCents)}
                </span>
              </li>
            ))}
          </ul>

          {order.discountCents > 0 ? (
            <div className="mt-4 flex items-baseline justify-between gap-4 text-sm">
              <span className="text-nybb-bone/65">Discount</span>
              <span className="font-mono-tabular">
                -{formatPeso(order.discountCents)}
              </span>
            </div>
          ) : null}

          <div className="mt-4 flex items-baseline justify-between gap-4">
            <span className="font-display heading-panel">
              {order.payment?.status === "paid" ? "Paid" : "To pay"}
            </span>
            <span className="font-mono-tabular text-nybb-orange text-2xl">
              {formatPeso(order.totalCents)}
            </span>
          </div>

          <p className="border-nybb-bone/15 text-nybb-bone/65 mt-4 border-t pt-4 text-sm leading-relaxed">
            {order.payment?.status === "paid"
              ? "Paid in full. Nothing to settle at the counter."
              : "Pay at the counter when you collect."}
          </p>

          {order.notes ? (
            <p className="border-nybb-bone/15 mt-4 border-t pt-4 leading-relaxed">
              <span className="type-caps text-nybb-bone/55 block">
                Your note
              </span>
              <span className="mt-1 block text-sm">{order.notes}</span>
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
