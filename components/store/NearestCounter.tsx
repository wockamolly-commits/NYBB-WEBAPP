"use client";

import { ArrowUpRight, LoaderCircle, LocateFixed, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { distanceLabel, type NearestSuggestion } from "@/lib/branches/nearest";
import type { Store } from "@/lib/branches/types";
import { cn } from "@/lib/utils";
import type { CustomerLocation } from "./useCustomerLocation";

/**
 * The nearest counter, said above the list as well as by the list's order.
 *
 * THE LIST MOVES, AND THIS SLOT DOES NOT.
 *
 * Once a position arrives the boards below re-rank nearest first (see
 * StoreList, including the short grace period that stops a press already on
 * its way from landing on a row that just moved). This card says the answer
 * in words and offers it as a button, in a slot whose height is reserved from
 * the first render, so the boards at least start in the same place when it
 * fills.
 *
 * NOTHING IS CHOSEN FOR THE CUSTOMER. The suggestion is a button, not a
 * default. The nearest counter is not always the right one (somebody ordering
 * on the way to work wants the counter by the office), and every row below
 * stays exactly as pressable as it was.
 *
 * THE SUGGESTED COUNTER OPENS ITS SHEET.
 *
 * Once a counter is named, the whole card opens the same map-and-hours sheet
 * the Branches page uses, so somebody can see where that forecourt actually
 * is before collecting from it. It is the directory card's stretched trigger:
 * the name is the button and its ::after covers the card, while "Collect from
 * here" sits above that layer and still chooses in one press. Only the named
 * state opens anything; every other state has no counter to show.
 *
 * Returns nothing only when the browser has no geolocation at all, which is
 * the one state with nothing honest to put here.
 */
export function NearestCounter({
  location,
  suggestion,
  selectedSlug,
  pending,
  busy,
  onLocate,
  onChoose,
  onOpenDetails,
}: {
  location: CustomerLocation;
  /** Null until there is a position to measure from. */
  suggestion: NearestSuggestion | null;
  selectedSlug: string | null;
  /** A counter is being chosen somewhere on the page. */
  pending: boolean;
  /** It is the suggested counter that is being chosen. */
  busy: boolean;
  onLocate: () => void;
  onChoose: (store: Store) => void;
  /** Opens the suggested counter's detail sheet. Absent when it has none. */
  onOpenDetails?: () => void;
}) {
  if (location.status === "unsupported") return null;

  return (
    <section
      aria-labelledby="nearest-counter-heading"
      data-testid="nearest-counter"
      // The reserved height is the tallest of the states at each width, so
      // the board below starts in the same place whichever one lands.
      className={cn(
        "border-nybb-ink/55 text-nybb-ink relative mb-6 flex min-h-[13.375rem] items-center rounded-md border p-4 sm:min-h-[9rem] sm:px-5",
        "transition-colors duration-200 ease-out",
        // The ghost tier's tint on this ground, over the card rather than the
        // name, because the whole card is the target.
        "has-[[data-card-trigger]:hover]:bg-nybb-ink/[0.06] has-[[data-card-trigger]:active]:bg-nybb-ink/10",
        // The ring belongs to the card, for the same reason. Ink on amber.
        "has-[[data-card-trigger]:focus-visible]:outline-nybb-ink has-[[data-card-trigger]:focus-visible]:outline-[3px] has-[[data-card-trigger]:focus-visible]:outline-offset-2",
      )}
    >
      <h2 id="nearest-counter-heading" className="sr-only">
        Nearest counter
      </h2>
      {/* Polite, because the answer arrives on its own after a tap or, for
          somebody who allowed location before, with no tap at all. */}
      <div aria-live="polite" className="w-full">
        <Body
          location={location}
          suggestion={suggestion}
          selectedSlug={selectedSlug}
          pending={pending}
          busy={busy}
          onLocate={onLocate}
          onChoose={onChoose}
          onOpenDetails={onOpenDetails}
        />
      </div>
    </section>
  );
}

function Body({
  location,
  suggestion,
  selectedSlug,
  pending,
  busy,
  onLocate,
  onChoose,
  onOpenDetails,
}: Parameters<typeof NearestCounter>[0]) {
  switch (location.status) {
    case "checking":
    case "unsupported":
      return null;

    case "idle":
    case "locating":
      return (
        <Layout
          label="Nearest counter"
          title="Find the counter closest to you"
          body="Your phone works out where you are, and the location stays on this device."
          action={
            <Button
              tone="light"
              variant="secondary"
              onClick={onLocate}
              disabled={location.status === "locating"}
              aria-busy={location.status === "locating" || undefined}
              className="w-full sm:w-auto"
            >
              {location.status === "locating" ? (
                <>
                  <LoaderCircle
                    aria-hidden
                    className="size-4 animate-spin motion-reduce:animate-none"
                    strokeWidth={2.25}
                  />
                  Finding you
                </>
              ) : (
                <>
                  <LocateFixed aria-hidden className="size-4" strokeWidth={2.25} />
                  Find my nearest counter
                </>
              )}
            </Button>
          }
        />
      );

    case "denied":
      return (
        <Layout
          label="Nearest counter"
          title="Location is off for this site"
          body="That is fine. Pick your counter from the list below. To see the nearest one, allow location in your browser's site settings and reload."
        />
      );

    case "failed":
      return (
        <Layout
          label="Nearest counter"
          title="Your location could not be found just now"
          body="Pick your counter from the list below, or try again."
          action={
            <Button
              tone="light"
              variant="secondary"
              onClick={onLocate}
              className="w-full sm:w-auto"
            >
              <LocateFixed aria-hidden className="size-4" strokeWidth={2.25} />
              Try again
            </Button>
          }
        />
      );

    case "located":
      if (!suggestion || suggestion.kind === "none") {
        return (
          <Layout
            label="Nearest counter"
            title="No distance to show yet"
            body="The counters taking online orders do not have a confirmed map pin yet, so pick yours from the list below."
          />
        );
      }

      if (suggestion.kind === "far") {
        return (
          <Layout
            label="Nearest counter"
            title="You look far from every counter"
            body={`The closest one taking online orders is ${suggestion.store.shortName}, ${distanceLabel(suggestion.km).toLowerCase()}. Pick from the list below if you are ordering ahead.`}
          />
        );
      }

      return (
        <Suggested
          store={suggestion.store}
          km={suggestion.km}
          alreadyChosen={suggestion.store.slug === selectedSlug}
          pending={pending}
          busy={busy}
          onChoose={onChoose}
          onOpenDetails={onOpenDetails}
        />
      );
  }
}

function Suggested({
  store,
  km,
  alreadyChosen,
  pending,
  busy,
  onChoose,
  onOpenDetails,
}: {
  store: Store;
  km: number;
  alreadyChosen: boolean;
  pending: boolean;
  busy: boolean;
  onChoose: (store: Store) => void;
  onOpenDetails?: () => void;
}) {
  return (
    <Layout
      label="Nearest to you"
      title={store.shortName}
      onOpen={onOpenDetails}
      body={
        alreadyChosen
          ? `${distanceLabel(km)} in a straight line. It is already your counter. The list below runs nearest first.`
          : `${distanceLabel(km)} in a straight line. The list below runs nearest first.`
      }
      action={
        alreadyChosen ? null : (
          <Button
            tone="light"
            variant="primary"
            onClick={() => onChoose(store)}
            disabled={pending}
            aria-busy={busy || undefined}
            aria-label={`Collect from ${store.name}`}
            className="w-full sm:w-auto"
          >
            {busy ? (
              <>
                <LoaderCircle
                  aria-hidden
                  className="size-4 animate-spin motion-reduce:animate-none"
                  strokeWidth={2.25}
                />
                Choosing
              </>
            ) : (
              "Collect from here"
            )}
          </Button>
        )
      }
    />
  );
}

/** The one arrangement every state shares, so the slot never changes shape. */
function Layout({
  label,
  title,
  body,
  action,
  onOpen,
}: {
  label: string;
  title: string;
  body: string;
  action?: React.ReactNode;
  /** Makes the whole card open the counter's sheet. */
  onOpen?: () => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="flex min-w-0 items-start gap-3">
        <LocateFixed aria-hidden className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
        <div className="min-w-0">
          <p className="type-caps text-nybb-ink/75">{label}</p>
          <p className="font-display mt-1 text-lg leading-tight text-balance">
            {onOpen ? (
              <button
                type="button"
                data-card-trigger
                onClick={onOpen}
                aria-haspopup="dialog"
                // Case inherited, because the browser's own button style
                // resets it and the display face is uppercase by definition.
                className="text-left [text-transform:inherit] after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:outline-none"
              >
                {title}
                <span className="sr-only">, map and opening hours</span>
              </button>
            ) : (
              title
            )}
          </p>
          <p className="text-nybb-ink/75 mt-1 max-w-prose text-sm leading-relaxed">{body}</p>
          {/* The affordance, drawn rather than announced: the trigger above
              already says it and already covers this line. */}
          {onOpen ? (
            <p
              aria-hidden
              className="font-display mt-2 flex items-center gap-1.5 text-sm tracking-[0.06em] uppercase"
            >
              <MapPin className="size-4" />
              Map and hours
              <ArrowUpRight className="size-4" />
            </p>
          ) : null}
        </div>
      </div>
      {/* Above the stretched trigger's layer, so it still chooses. */}
      {action ? <div className="relative z-10">{action}</div> : null}
    </div>
  );
}
