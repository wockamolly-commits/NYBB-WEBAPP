"use client";

import { Check, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chooseStore } from "@/app/actions/store";
import { PRESSABLE } from "@/components/ui/Button";
import { branchFormatLabel } from "@/lib/catalog";
import { telHref } from "@/lib/phone";
import type { Store } from "@/lib/branches/types";
import { cn } from "@/lib/utils";

/**
 * Choosing the counter, which on a pickup-only platform is the first real
 * decision in the order.
 *
 * WHY THE CHOSEN CARD SETS INK AT 80% AND NOT AT 75%.
 *
 * The selected state is the system's existing vocabulary, `bg-nybb-orange`
 * with ink on top, which is what a chosen pickup window already looks like.
 * The alpha is not borrowed with it. Composited through a 1x1 canvas, ink at
 * 75% over Buffalo Orange measures 4.37:1, which is under AA for anything that
 * is not large text, and every secondary line on this card is 12px or 14px.
 * 80% measures 4.74:1 and full ink 6.02:1. One value across all three
 * secondary lines, because three alphas on one surface is drift rather than
 * hierarchy.
 *
 * ONE PRESS, NOT A RADIO PLUS A SUBMIT.
 *
 * The card is the control. A list of radios under a Continue button is the
 * safe pattern and it costs a tap, and the tap is spent by the customer this
 * product is hardest on: standing in the queue, one hand, somebody behind
 * them. There is nothing to review between choosing and continuing, because
 * the choice is reversible from a band on every screen after this one.
 *
 * THE EIGHT THAT CANNOT TAKE AN ORDER ARE STILL ON THIS PAGE.
 *
 * Eight of the nine counters are real shops with real phone numbers that this
 * platform has not been switched on for. Hiding them would leave somebody
 * standing outside SM City reading a list that does not contain the branch
 * they can see, and the honest version of that page is worth more than the
 * tidy one: it names the shop, says plainly that online ordering is not open
 * there yet, and gives them the number that is. They are not disabled buttons.
 * A disabled control invites pressing; a card with a phone number in it
 * resolves the problem.
 */
export function StoreList({
  stores,
  selectedSlug,
  next,
  orderingOpen = true,
}: {
  stores: Store[];
  selectedSlug: string | null;
  /** Where a chosen counter leads. Validated on the server that rendered it. */
  next: string;
  /**
   * Whether an order can be completed on this deployment at all.
   *
   * When it cannot, no counter is choosable, whatever the branch rows say. A
   * live kitchen behind a checkout with no payment rail is still a counter the
   * customer has to phone, and offering to "collect from here" would be this
   * page contradicting every other screen in the flow.
   */
  orderingOpen?: boolean;
}) {
  const router = useRouter();
  const [pending, startChoosing] = useTransition();
  const [choosing, setChoosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function choose(store: Store) {
    if (pending) return;
    setChoosing(store.slug);
    setError(null);
    startChoosing(async () => {
      const result = await chooseStore(store.slug);
      if (!result.ok) {
        setError(result.error);
        setChoosing(null);
        // The list said this counter was available and the server disagreed,
        // which means it changed underneath the page. Re-render it from the
        // truth rather than leaving a card that lies.
        router.refresh();
        return;
      }
      router.push(next);
    });
  }

  const orderable = orderingOpen ? stores.filter((store) => store.orderable) : [];
  const closed = orderingOpen ? stores.filter((store) => !store.orderable) : stores;

  return (
    <div className="mt-8">
      {error ? (
        <p
          role="alert"
          className="border-nybb-red text-nybb-ink mb-6 max-w-prose border-l-2 pl-3 leading-relaxed"
        >
          {error}
        </p>
      ) : null}

      {orderable.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orderable.map((store) => {
            const selected = store.slug === selectedSlug;
            const busy = choosing === store.slug;

            return (
              <li key={store.slug}>
                <button
                  type="button"
                  onClick={() => choose(store)}
                  disabled={pending}
                  aria-label={
                    selected
                      ? `Continue with ${store.name}`
                      : `Collect from ${store.name}`
                  }
                  className={cn(
                    PRESSABLE,
                    // h-full so a card carrying a closed-now line does not
                    // stand taller than the one beside it. Same lesson the
                    // slot grid and the product tiles already learned.
                    "flex h-full w-full flex-col rounded-md p-5 text-left",
                    selected
                      ? "bg-nybb-orange text-nybb-ink"
                      : // The selection-control hover this system already uses on the
                        // pickup windows: the border firms up and the ground
                        // lifts by a fraction of bone. Graphite was the first
                        // choice and it is the wrong token, because DESIGN.md
                        // assigns graphite to pressed states and input fills,
                        // so a card that went graphite on hover would be
                        // showing its pressed state before it was pressed.
                        "bg-nybb-charcoal text-nybb-bone border-nybb-bone/25 hover:border-nybb-bone/60 hover:bg-nybb-bone/5 border",
                  )}
                >
                  <span
                    className={cn(
                      "font-display type-caps block",
                      selected ? "text-nybb-ink/80" : "text-nybb-bone/60",
                    )}
                  >
                    {branchFormatLabel[store.format]}
                  </span>

                  <span className="font-display mt-2 block text-xl leading-tight">
                    {store.shortName}
                  </span>

                  <span
                    className={cn(
                      "mt-2 block text-sm leading-relaxed",
                      selected ? "text-nybb-ink/80" : "text-nybb-bone/65",
                    )}
                  >
                    {store.addressLine}
                    <br />
                    {store.city}
                  </span>

                  {/* The number that decides whether this counter suits the
                      next hour, and it is genuinely per branch: a forecourt
                      and a food hall do not cook at the same pace. Mono
                      because it is a measurement compared between cards. */}
                  {store.branch ? (
                    <span
                      className={cn(
                        "font-mono-tabular mt-4 block text-sm",
                        selected ? "text-nybb-ink/80" : "text-nybb-bone/75",
                      )}
                    >
                      Ready {store.branch.prepMinutes} min from ordering
                    </span>
                  ) : null}

                  {store.closedNow ? (
                    <span
                      className={cn(
                        "mt-1.5 block text-sm leading-relaxed",
                        selected ? "text-nybb-ink/80" : "text-nybb-bone/65",
                      )}
                    >
                      Closed right now. Checkout shows its next windows.
                    </span>
                  ) : null}

                  <span
                    className={cn(
                      "font-display mt-auto flex items-center gap-2 pt-5 text-sm tracking-[0.06em]",
                      selected ? "text-nybb-ink" : "text-nybb-orange",
                    )}
                  >
                    {selected ? (
                      <Check aria-hidden className="size-4" strokeWidth={2.5} />
                    ) : null}
                    {busy
                      ? "Choosing"
                      : selected
                        ? "Your counter, continue"
                        : "Collect from here"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        // Not a fault, and the copy has to say so. No branch live is the
        // expected state of a platform whose pilot has not opened, and an
        // empty grid on its own is indistinguishable from a page that failed.
        <div className="border-nybb-ink/40 max-w-prose rounded-md border border-dashed p-5">
          <p className="font-display heading-panel text-nybb-ink">
            No counter is taking online orders yet
          </p>
          <p className="text-nybb-ink/75 mt-2 leading-relaxed">
            {orderingOpen
              ? "Every branch below is open and cooking. Online ordering has not been switched on for any of them, so the phone is the way in for now."
              : "Every branch below is open and cooking. Online payment is not switched on for this site yet, and pickup orders are paid before the kitchen starts, so the phone is the way in for now."}
          </p>
        </div>
      )}

      {closed.length > 0 ? (
        <section aria-labelledby="other-counters" className="mt-12">
          <h2 id="other-counters" className="font-display heading-minor">
            {orderingOpen ? "The rest of the counters" : "Every counter"}
          </h2>
          <p className="text-nybb-ink/75 mt-3 max-w-prose leading-relaxed">
            {closed.length === 1 ? "This one takes" : `These ${closed.length} take`}{" "}
            orders over the phone.{" "}
            {orderingOpen
              ? "Online ordering is being rolled out counter by counter, and the same menu and the same prices apply at every one."
              : "The same menu and the same prices apply at every one."}
          </p>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {closed.map((store) => (
              <li
                key={store.slug}
                className="bg-nybb-charcoal text-nybb-bone flex flex-col rounded-md p-5"
              >
                <p className="font-display type-caps text-nybb-bone/60">
                  {branchFormatLabel[store.format]}
                </p>
                <h3 className="font-display mt-2 text-xl leading-tight">
                  {store.shortName}
                </h3>
                <p className="text-nybb-bone/65 mt-2 text-sm leading-relaxed">
                  {store.addressLine}
                  <br />
                  {store.city}
                </p>
                <p className="text-nybb-bone/75 mt-4 text-sm leading-relaxed">
                  {!orderingOpen
                    ? "Takes orders by phone."
                    : store.blockedReason === "not_accepting"
                      ? "Not taking orders at the moment."
                      : "Not on online ordering yet."}
                </p>

                <ul className="mt-auto pt-4">
                  {store.phones.map((phone) => (
                    <li key={phone}>
                      <a
                        href={telHref(phone)}
                        className="font-mono-tabular text-nybb-orange hover:text-nybb-orange-lit inline-flex min-h-11 items-center gap-2 text-sm transition-colors"
                      >
                        <Phone aria-hidden className="size-4" strokeWidth={2} />
                        {phone}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
