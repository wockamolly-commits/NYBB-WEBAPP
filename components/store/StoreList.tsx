"use client";

import { ArrowRight, Check, LoaderCircle, Navigation, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { chooseStore } from "@/app/actions/store";
import { BranchDialog } from "@/components/branches/BranchDialog";
import { buttonStyles } from "@/components/ui/Button";
import type { BranchEntry } from "@/lib/branches/entries";
import { branchFormatLabel } from "@/lib/catalog";
import { distanceLabel, distancesBySlug, suggestNearest } from "@/lib/branches/nearest";
import { telHref } from "@/lib/phone";
import type { Store } from "@/lib/branches/types";
import { cn } from "@/lib/utils";
import { NearestCounter } from "./NearestCounter";
import { useCustomerLocation } from "./useCustomerLocation";

/**
 * Choosing the counter, which on a pickup-only platform is the first real
 * decision in the order.
 *
 * WHY THE CHOSEN ROW SETS INK AT 80% AND NOT AT 75%.
 *
 * The selected state is the system's existing vocabulary, `bg-nybb-orange`
 * with ink on top, which is what a chosen pickup window already looks like.
 * The alpha is not borrowed with it. Composited through a 1x1 canvas, ink at
 * 75% over Buffalo Orange measures 4.37:1, which is under AA for anything that
 * is not large text, and every secondary line on this row is 12px or 14px.
 * 80% measures 4.74:1 and full ink 6.02:1. One value across all three
 * secondary lines, because three alphas on one surface is drift rather than
 * hierarchy.
 *
 * A BOARD OF ROWS, NOT A GRID OF CARDS, AND NOT A DROPDOWN.
 *
 * This was a grid of boxes, one charcoal card per counter standing on the
 * amber ground, and it failed twice. The hover borrowed the pickup windows'
 * `bg-nybb-bone/5`, which is right on a charcoal panel and wrong here:
 * a background utility on hover replaces the card's own fill rather than
 * tinting it, so the card went transparent and bone text landed on signage
 * yellow at roughly 1.1:1. And same-size boxes made the page read as a
 * brochure of shops when it is a choice between kitchens.
 *
 * A dropdown was considered and rejected. It hides exactly what the choice
 * turns on (where the counter is, how long it cooks, whether it is open this
 * minute) behind a tap, then asks for a second tap to confirm, which is the
 * cost this product cannot spend in the queue. A single charcoal board with
 * one row per counter keeps everything readable at once, lines the prep times
 * up for comparison, and because the board itself is the dark ground, every
 * hover and press state is a tint over charcoal and can never wash out.
 *
 * ONE PRESS, NOT A RADIO PLUS A SUBMIT.
 *
 * The row is the control. A list of radios under a Continue button is the
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
 * A disabled control invites pressing; a row with a phone number in it
 * resolves the problem. They sit on a second board of the same shape, so the
 * two lists read as one directory split by what each counter can do.
 */

/**
 * The row geometry both boards share, so a name, an address and the thing
 * you can do there sit in the same three places on every counter.
 *
 * Below `lg` the row is two columns: the counter on the left, stacked, and its
 * action pinned right and centred, where a thumb finds it. From `lg` the
 * details move into a middle column of their own, which is what lets the prep
 * times line up down the board instead of wandering with each address. The
 * action column is a fixed width for the same reason: sized to its content,
 * "Continue" is narrower than "Collect from here" and the chosen row's
 * details would start a step to the right of everyone else's.
 */
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-4 sm:px-6 sm:py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_11rem] lg:gap-x-10";
const ROW_NAME = "col-start-1 row-start-1 min-w-0";
const ROW_DETAILS = "col-start-1 row-start-2 mt-2 min-w-0 lg:col-start-2 lg:row-start-1 lg:mt-0";
const ROW_ACTION =
  "col-start-2 row-span-2 row-start-1 self-center justify-self-end lg:col-start-3 lg:row-span-1";

/** One charcoal board, rows split by a hairline rather than by gaps. */
const BOARD =
  "bg-nybb-charcoal text-nybb-bone divide-nybb-bone/10 overflow-hidden rounded-md divide-y";

export function StoreList({
  stores,
  selectedSlug,
  entries = [],
  next,
  orderingOpen = true,
}: {
  stores: Store[];
  selectedSlug: string | null;
  /**
   * The detail sheet for each catalog counter: map, address, phones, week.
   * Opened from the nearest-counter suggestion. A counter with no entry has
   * no sheet, and its suggestion is simply not clickable.
   */
  entries?: BranchEntry[];
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
  const [leaving, setLeaving] = useState(false);
  const navigated = useRef(false);
  // The slug stays after closing so the sheet keeps its content through the
  // closing fade. See BranchDialog.
  const [detailSlug, setDetailSlug] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  /**
   * The navigation waits for the transition to settle rather than happening
   * inside it.
   *
   * `chooseStore` sets the branch cookie and calls revalidatePath, and either
   * one on its own makes Next re-render the route the action was called from
   * and commit that as a seeded navigation. A push issued in the same tick
   * races that commit, and when it loses the customer is returned to the page
   * they just chose from, having apparently done nothing.
   *
   * This page usually won that race, because nothing here delays the push. The
   * same pattern in ReorderButton did not, because writing the restored lines
   * into the cart put enough synchronous work in front of the push to lose it,
   * which is why that bug tracked the number of items in the order. Winning by
   * a margin that depends on how much work happens to sit in front of you is
   * not winning, so this waits instead.
   */
  useEffect(() => {
    if (!leaving || pending || navigated.current) return;
    navigated.current = true;
    // A counter chosen from inside the sheet has done what the sheet was
    // opened for. Closed here rather than on the press, so the sheet shows
    // its own "Choosing" until the choice has landed.
    setDetailOpen(false);
    const go = () => router.push(next);
    go();
  }, [leaving, pending, router, next]);

  function choose(store: Store) {
    if (pending) return;
    setChoosing(store.slug);
    setError(null);
    startChoosing(async () => {
      const result = await chooseStore(store.slug);
      if (!result.ok) {
        setError(result.error);
        setChoosing(null);
        // The error is announced on the page, which the open sheet makes
        // inert. Close it so the message can be read and acted on.
        setDetailOpen(false);
        // The list said this counter was available and the server disagreed,
        // which means it changed underneath the page. Re-render it from the
        // truth rather than leaving a row that lies.
        //
        // This one stays inside the transition. It refreshes the route the
        // action was already going to re-render, so it agrees with the
        // action's own commit rather than competing with it, and being
        // discarded would cost nothing.
        router.refresh();
        return;
      }
      // Not router.push. See the effect above.
      setLeaving(true);
    });
  }

  const orderable = orderingOpen ? stores.filter((store) => store.orderable) : [];
  const closed = orderingOpen ? stores.filter((store) => !store.orderable) : stores;

  // Worked out here, in the browser, from a position that never leaves it.
  // See lib/branches/nearest.ts. Nine stores, so there is nothing to memoise.
  const { location, locate } = useCustomerLocation();
  const position = location.status === "located" ? location.position : null;
  const distances = position ? distancesBySlug(stores, position) : null;
  const suggestion = position ? suggestNearest(orderable, position) : null;
  const nearestSlug = suggestion?.kind === "nearest" ? suggestion.store.slug : null;

  const detailEntry = entries.find((entry) => entry.slug === detailSlug) ?? null;
  const detailStore = stores.find((store) => store.slug === detailSlug) ?? null;
  const detailKm = detailSlug ? distances?.get(detailSlug) : undefined;

  function openDetails(slug: string) {
    setDetailSlug(slug);
    setDetailOpen(true);
  }

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

      {/* Only above a board with something on it to choose. With no counter
          taking online orders there is nothing for the suggestion's button to
          do, and the phone-only rows still show their distances. */}
      {orderable.length > 0 ? (
        <NearestCounter
          location={location}
          suggestion={suggestion}
          selectedSlug={selectedSlug}
          pending={pending}
          busy={suggestion !== null && suggestion.kind !== "none" && choosing === suggestion.store.slug}
          onLocate={locate}
          onChoose={choose}
          onOpenDetails={
            nearestSlug && entries.some((entry) => entry.slug === nearestSlug)
              ? () => openDetails(nearestSlug)
              : undefined
          }
        />
      ) : null}

      <BranchDialog
        branch={detailEntry}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        detail={detailKm !== undefined ? `${distanceLabel(detailKm)} in a straight line` : null}
        actions={
          // Only a counter this page can choose gets the choice in its sheet.
          // Anything else falls back to the directory's Directions and Call.
          detailEntry && detailStore?.orderable && orderingOpen ? (
            <>
              <button
                type="button"
                onClick={() => choose(detailStore)}
                disabled={pending}
                aria-busy={choosing === detailStore.slug || undefined}
                className={buttonStyles({
                  tone: "dark",
                  variant: "primary",
                  size: "lg",
                  className: "sm:flex-1",
                })}
              >
                {choosing === detailStore.slug ? (
                  <>
                    <LoaderCircle
                      aria-hidden
                      className="size-4 animate-spin motion-reduce:animate-none"
                      strokeWidth={2.25}
                    />
                    Choosing
                  </>
                ) : detailStore.slug === selectedSlug ? (
                  <>
                    Continue
                    <ArrowRight aria-hidden className="size-4" strokeWidth={2.25} />
                  </>
                ) : (
                  <>
                    Collect from here
                    <ArrowRight aria-hidden className="size-4" strokeWidth={2.25} />
                  </>
                )}
              </button>
              {/* Secondary here, where the directory makes it primary: on
                  this page the sheet is a step in choosing, and the choice is
                  the thing it exists to help with. */}
              <a
                href={detailEntry.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonStyles({
                  tone: "dark",
                  variant: "secondary",
                  size: "lg",
                  className: "sm:flex-1",
                })}
              >
                <Navigation aria-hidden className="size-4" />
                Get directions
                <span className="sr-only"> (opens Google Maps)</span>
              </a>
            </>
          ) : undefined
        }
      />

      {orderable.length > 0 ? (
        <ul className={BOARD}>
          {orderable.map((store) => {
            const selected = store.slug === selectedSlug;
            const busy = choosing === store.slug;
            const detailsId = `counter-${store.slug}-details`;
            const km = distances?.get(store.slug);

            return (
              <li key={store.slug}>
                <button
                  type="button"
                  onClick={() => choose(store)}
                  disabled={pending}
                  aria-busy={busy || undefined}
                  aria-label={
                    selected
                      ? `Continue with ${store.name}`
                      : `Collect from ${store.name}`
                  }
                  aria-describedby={detailsId}
                  className={cn(
                    ROW_GRID,
                    // Not PRESSABLE. A 2% scale on a row the width of the
                    // board moves its edges by twenty pixels inside a panel
                    // that clips them, which reads as the board jumping. The
                    // press is a deeper tint instead, on the same timing.
                    "group w-full text-left transition-colors duration-200 ease-out active:duration-75",
                    "disabled:cursor-progress",
                    // The board clips its corners, so the ring is drawn inside
                    // the row, where the clip cannot eat it.
                    "focus-visible:outline-offset-[-3px]",
                    selected
                      ? // The system's chosen state: orange fill, ink on top.
                        // The ring flips to ink, because the board's orange
                        // ring on an orange row is no ring at all.
                        "bg-nybb-orange text-nybb-ink [--focus-ring:var(--color-nybb-ink)]"
                      : // A tint over charcoal, never a replacement for it.
                        // This is the whole fix: the board is the dark ground,
                        // so the row has nothing to lose by lifting.
                        "hover:bg-nybb-bone/[0.06] active:bg-nybb-bone/10 disabled:hover:bg-transparent",
                  )}
                >
                  <span className={ROW_NAME}>
                    <span
                      className={cn(
                        // Inline, not flex, so a long label at 320px wraps as
                        // a line of text instead of splitting into columns.
                        "font-display type-caps block",
                        selected ? "text-nybb-ink/80" : "text-nybb-bone/60",
                      )}
                    >
                      {selected ? (
                        <>
                          <Check
                            aria-hidden
                            className="mr-1.5 inline size-3.5 align-[-0.15em]"
                            strokeWidth={3}
                          />
                          Your counter{" "}
                          <span aria-hidden className="mx-0.5">
                            ·
                          </span>{" "}
                        </>
                      ) : null}
                      {store.slug === nearestSlug ? (
                        <>
                          Nearest{" "}
                          <span aria-hidden className="mx-0.5">
                            ·
                          </span>{" "}
                        </>
                      ) : null}
                      {branchFormatLabel[store.format]}
                    </span>
                    <span className="font-display mt-1.5 block text-xl leading-tight text-balance sm:text-2xl">
                      {store.shortName}
                    </span>
                  </span>

                  <span
                    id={detailsId}
                    className={cn(
                      ROW_DETAILS,
                      "block text-sm leading-relaxed",
                      selected ? "text-nybb-ink/80" : "text-nybb-bone/65",
                    )}
                  >
                    <span className="block">
                      {store.addressLine}, {store.city}
                    </span>

                    {km !== undefined ? (
                      <span className="mt-1 block">{distanceLabel(km)}</span>
                    ) : null}

                    {/* The number that decides whether this counter suits the
                        next hour, and it is genuinely per branch: a forecourt
                        and a food hall do not cook at the same pace. Mono
                        because it is a measurement compared down the board. */}
                    {store.branch ? (
                      <span
                        className={cn(
                          "font-mono-tabular mt-1 block",
                          selected ? "text-nybb-ink" : "text-nybb-bone/80",
                        )}
                      >
                        Ready {store.branch.prepMinutes} min from ordering
                      </span>
                    ) : null}

                    {store.closedNow ? (
                      <span className="mt-1 block">
                        Closed right now. Checkout shows its next windows.
                      </span>
                    ) : null}
                  </span>

                  <span
                    aria-hidden
                    className={cn(
                      ROW_ACTION,
                      "font-display flex min-h-11 items-center gap-2 text-sm tracking-[0.06em] uppercase",
                      selected
                        ? "text-nybb-ink"
                        : "text-nybb-orange group-hover:text-nybb-orange-lit transition-colors",
                    )}
                  >
                    {busy ? (
                      <>
                        <span className="hidden sm:inline">Choosing</span>
                        <LoaderCircle
                          className="size-5 animate-spin motion-reduce:animate-none"
                          strokeWidth={2.25}
                        />
                      </>
                    ) : (
                      <>
                        {/* On a phone the arrow alone says it, and the counter
                            gets the width back. The chosen row does not need
                            the word there either: its label already says
                            "Your counter", and the orange says the rest. */}
                        <span className="hidden sm:inline">
                          {selected ? "Continue" : "Collect from here"}
                        </span>
                        <ArrowRight
                          className="size-5 transition-transform duration-200 ease-out group-hover:translate-x-1 group-disabled:translate-x-0 motion-reduce:transition-none"
                          strokeWidth={2.25}
                        />
                      </>
                    )}
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

          <ul className={cn(BOARD, "mt-6")}>
            {closed.map((store) => (
              <li key={store.slug} className={ROW_GRID}>
                <div className={ROW_NAME}>
                  <p className="font-display type-caps text-nybb-bone/60">
                    {branchFormatLabel[store.format]}
                  </p>
                  <h3 className="font-display mt-1.5 text-xl leading-tight text-balance sm:text-2xl">
                    {store.shortName}
                  </h3>
                </div>

                <div className={cn(ROW_DETAILS, "text-sm leading-relaxed")}>
                  <p className="text-nybb-bone/65">
                    {store.addressLine}, {store.city}
                  </p>
                  {distances?.has(store.slug) ? (
                    <p className="text-nybb-bone/65 mt-1">
                      {distanceLabel(distances.get(store.slug)!)}
                    </p>
                  ) : null}
                  <p className="text-nybb-bone/80 mt-1">
                    {!orderingOpen
                      ? "Takes orders by phone."
                      : store.blockedReason === "not_accepting"
                        ? "Not taking orders at the moment."
                        : "Not on online ordering yet."}
                  </p>
                </div>

                {/* Below `sm` the numbers drop under the address rather than
                    beside it. A phone column on the right would squeeze the
                    address into a strip a few words wide. */}
                <ul
                  className={cn(
                    ROW_ACTION,
                    "max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-3 max-sm:mt-1 max-sm:justify-self-start",
                    "flex flex-col items-start sm:items-end",
                  )}
                >
                  {store.phones.map((phone) => (
                    <li key={phone}>
                      <a
                        href={telHref(phone)}
                        className="font-mono-tabular text-nybb-orange hover:text-nybb-orange-lit inline-flex min-h-11 items-center gap-2 text-sm whitespace-nowrap transition-colors"
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
