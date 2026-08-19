import { MapPin } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { storesHref } from "@/lib/branches/href";
import type { StoreSelection } from "@/lib/branches/selection";
import { cn } from "@/lib/utils";

/**
 * Where this order is being collected from, said on every screen that leads to
 * a checkout.
 *
 * WHY THIS IS ON THE PAGE AND NOT IN THE HEADER.
 *
 * A pickup-only shop has exactly one fact the customer must not be wrong
 * about, and it is this one. It belongs next to the thing it qualifies: the
 * prices on the menu, the lines in the cart, the windows at checkout. In the
 * header it would be one more item in a bar that already carries a wordmark,
 * three links, an account and a cart, and on a 320px phone it would be the
 * first thing to be cut.
 *
 * It is also not a banner. The band is the same charcoal surface as every
 * other card on the storefront, at the top of the column it describes, which
 * is what keeps it reading as part of the page rather than as an announcement
 * laid over it.
 *
 * THE UNCHOSEN STATE IS NOT AN ERROR.
 *
 * Nobody is stopped from browsing without a counter. Prices are the same at
 * every branch, so a menu with no store chosen is still a true menu, and
 * putting a wall in front of it would cost the one scene this product cannot
 * afford to slow down: somebody already standing in the queue, ordering on
 * their own phone to get ahead of it. The choice is asked for here, and
 * required exactly once, at the screen that books a kitchen's time.
 */
export function StoreBar({
  selection,
  returnTo,
  className,
}: {
  selection: StoreSelection;
  /** Where "Change" comes back to. Explicit, because a server component has no pathname. */
  returnTo: string;
  className?: string;
}) {
  const { selected, wasDropped, onlyOrderable } = selection;
  const href = storesHref(returnTo);

  return (
    <div
      className={cn(
        "bg-nybb-charcoal text-nybb-bone rounded-md p-4 sm:px-5 sm:py-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="flex min-w-0 items-start gap-3">
          <MapPin
            aria-hidden
            className="text-nybb-orange mt-0.5 size-5 shrink-0"
            strokeWidth={2}
          />
          <div className="min-w-0">
            <p className="type-caps text-nybb-bone/55">
              Collecting from
            </p>
            {selected ? (
              <>
                <p className="font-display mt-1 text-base leading-tight">
                  {selected.shortName}
                </p>
                <p className="text-nybb-bone/65 mt-1 text-sm leading-relaxed">
                  {selected.addressLine}
                  {selected.city ? `, ${selected.city}` : null}
                </p>
              </>
            ) : (
              <>
                <p className="font-display mt-1 text-base leading-tight">
                  No counter chosen yet
                </p>
                <p className="text-nybb-bone/65 mt-1 max-w-prose text-sm leading-relaxed">
                  {onlyOrderable
                    ? `Prices are the same everywhere. ${onlyOrderable.shortName} is the counter taking online orders today, and checkout will need you to confirm it.`
                    : "Prices are the same everywhere, so you can browse first. Checkout needs to know which counter is cooking this."}
                </p>
              </>
            )}
          </div>
        </div>

        <ButtonLink
          href={href}
          tone="dark"
          variant={selected ? "secondary" : "primary"}
          className="ml-auto"
        >
          {selected ? "Change counter" : "Choose a counter"}
        </ButtonLink>
      </div>

      {/* A store that stopped being orderable owes an explanation, because the
          customer chose it and it is silently gone. Separated by a rule rather
          than a colour: this is news, not a fault. */}
      {wasDropped ? (
        <p
          role="status"
          className="border-nybb-bone/15 text-nybb-bone/75 mt-4 border-t pt-4 text-sm leading-relaxed"
        >
          The counter you had chosen has stopped taking online orders, so it has
          been cleared. Please pick another one before checkout.
        </p>
      ) : null}

      {selected?.closedNow ? (
        <p className="border-nybb-bone/15 text-nybb-bone/75 mt-4 border-t pt-4 text-sm leading-relaxed">
          {selected.shortName} is closed at the moment. Checkout will show the
          windows it has open next, and nothing is cooked before its window.
        </p>
      ) : null}
    </div>
  );
}
