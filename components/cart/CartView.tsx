"use client";

import { Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { NoPhotoTile } from "@/components/menu/NoPhotoTile";
import { Button, ButtonLink } from "@/components/ui/Button";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { cartQuantity, lineHref, resolveCart } from "@/lib/cart/lines";
import {
  clearCart,
  reconcileCart,
  removeCartLine,
  restoreCart,
  setCartLineQuantity,
  type CartChanges,
} from "@/lib/cart/store";
import type { Cart } from "@/lib/cart/types";
import { useCart } from "@/lib/cart/use-cart";
import { formatPeso } from "@/lib/format";
import { previewImage } from "@/lib/menu/preview";
import type { MenuCategory } from "@/lib/menu/types";
import { cn } from "@/lib/utils";

/**
 * The cart, resolved against the live menu.
 *
 * The page hands this the whole menu because the cart itself stores nothing
 * but slugs. That is what makes a cart left overnight correct in the morning:
 * the price, the name and the photograph are all read fresh, and a line that
 * no longer describes something the shop sells is dropped and said out loud
 * rather than silently disappearing.
 *
 * Every peso on this screen comes from `lib/menu/line-pricing.ts` through
 * `resolveCart`, and none of it is authoritative. `place_order` prices the
 * order in Postgres from the same ids, and where the two disagree the server
 * is right.
 */

function DroppedNotice({ dropped, repriced }: CartChanges) {
  return (
    <div
      role="status"
      className="border-nybb-ink/30 text-nybb-ink/80 mt-6 rounded-md border border-dashed p-4 text-sm leading-relaxed"
    >
      <p className="font-display heading-panel text-nybb-ink">
        The menu changed while this was in your cart
      </p>
      <ul className="mt-2 space-y-1">
        {dropped.map((entry, index) => (
          <li key={`${entry.line.itemSlug}-${index}`}>
            {entry.name === null
              ? "An item that is no longer on the menu was removed."
              : entry.reason === "variation"
                ? `${entry.name} was removed: that size is no longer sold.`
                : `${entry.name} was removed: one of the choices on it is no longer available.`}
          </li>
        ))}
        {repriced.length > 0 ? (
          <li>
            {repriced.length === 1
              ? `The price of ${repriced[0]} has changed.`
              : `Prices have changed on ${repriced.length} of these lines.`}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** Static class names, so Tailwind's scanner can see all five. */
const HEAT_RAMP = [
  "bg-nybb-heat-1",
  "bg-nybb-heat-2",
  "bg-nybb-heat-3",
  "bg-nybb-heat-4",
  "bg-nybb-heat-5",
] as const;

export type EmptyCartHeatLevel = { slug: string; name: string; percent: number };

/**
 * The five heat stops as ascending bars, the empty cart's one picture.
 *
 * A quotation of the landing page's HeatScale rather than a second copy of it:
 * no prices, no reveal, and small. The prices belong to the menu the button
 * leads to, and the grow-in animation is kept to the landing page, where it
 * is the section's whole point. This one is drawn from the first frame.
 *
 * Decoration, so it is hidden from screen readers. The sentence beside it
 * already says "five levels of heat", and reading out five names and five
 * percentages after it would be the same fact twice.
 *
 * The names only show from `sm` up. At 320px the five columns are about
 * forty pixels wide and "Moderate" does not fit in one, so a phone gets the
 * percentages, which are the part a bar graph is actually drawing.
 */
function HeatSteps({
  levels,
  className,
}: {
  levels: EmptyCartHeatLevel[];
  className?: string;
}) {
  return (
    <div aria-hidden className={cn("w-full max-w-md lg:w-96 lg:max-w-none", className)}>
      <p className="type-caps text-nybb-bone/55">Level of Hotness</p>
      <ol className="border-nybb-bone/15 mt-4 grid grid-cols-5 items-end gap-2 border-b sm:gap-3">
        {levels.map((level, index) => (
          <li key={level.slug} className="flex h-16 items-end sm:h-24 lg:h-32">
            <span
              className={cn(
                "block w-full rounded-t-[2px]",
                HEAT_RAMP[index] ?? HEAT_RAMP[HEAT_RAMP.length - 1],
              )}
              style={{ height: `${level.percent}%` }}
            />
          </li>
        ))}
      </ol>
      <ol className="mt-2.5 grid grid-cols-5 gap-2 sm:gap-3">
        {levels.map((level) => (
          <li key={level.slug} className="min-w-0">
            <p className="font-display hidden truncate text-xs leading-none tracking-[0.04em] uppercase sm:block">
              {level.name}
            </p>
            <p className="font-mono-tabular text-nybb-bone/55 text-xs leading-none sm:mt-1.5">
              {level.percent}%
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function CartView({
  categories,
  heatLevels = [],
  storeName = null,
  orderingOpen = true,
}: {
  categories: MenuCategory[];
  /**
   * The wings' heat stops, read from the same menu by the page. Passed in
   * rather than looked up here, because the menu module's lookups sit beside
   * the Supabase read and this is a client component.
   */
  heatLevels?: EmptyCartHeatLevel[];
  /** The chosen counter's short name, or null when none has been chosen. */
  storeName?: string | null;
  /**
   * Whether checkout can actually complete on this deployment.
   *
   * Read on the server and passed down, because it is a fact about the machine
   * serving the request plus a flag in the database, and a browser can know
   * neither. The cart used to send everybody to a checkout that might refuse
   * them, which is the worst place to find out.
   */
  orderingOpen?: boolean;
}) {
  const { cart, loaded, changes } = useCart();

  /**
   * What "Empty the cart" just threw away, held only until the page is left.
   *
   * Component state rather than the store, because this is the offer to undo
   * and not a second copy of the cart. Navigating away ends the offer, which
   * is correct: undo belongs to the moment after the press.
   */
  const [emptied, setEmptied] = useState<Cart | null>(null);

  // Arriving at the cart is when the stored lines meet the live menu. The
  // store does the reconciling, because correcting the cart and remembering
  // why are one action and only it can hold both.
  useEffect(() => {
    reconcileCart(categories);
  }, [categories]);

  const resolved = useMemo(() => resolveCart(categories, cart), [categories, cart]);

  if (!loaded) {
    // The cart is in localStorage, so the server rendered nothing and this is
    // the one frame before it is read. Showing "your cart is empty" here and
    // replacing it a moment later is worse than showing the shape of what is
    // about to arrive.
    return (
      <div aria-hidden className="mt-8 space-y-4">
        {[0, 1].map((row) => (
          <div key={row} className="bg-nybb-charcoal/10 h-28 rounded-md" />
        ))}
      </div>
    );
  }

  if (resolved.lines.length === 0) {
    const undone = emptied === null ? 0 : cartQuantity(emptied);

    return (
      <div className="mt-8">
        {changes ? <DroppedNotice dropped={changes.dropped} repriced={changes.repriced} /> : null}

        {emptied ? (
          // role="status", so the undo is announced rather than only drawn.
          // A customer using a screen reader who has just emptied a cart by
          // accident is exactly the one who most needs to hear that it can be
          // put back, and a silently swapped panel tells them nothing.
          <div
            role="status"
            className="border-nybb-ink/30 mt-6 max-w-prose rounded-md border border-dashed p-5"
          >
            <p className="font-display heading-panel text-nybb-ink">
              That emptied your cart
            </p>
            <p className="text-nybb-ink/75 mt-2 text-sm leading-relaxed">
              Nothing has been ordered and nothing is lost yet. Putting it back
              restores {undone === 1 ? "the item" : `all ${undone} items`}{" "}
              exactly as {undone === 1 ? "it was" : "they were"}, as long as you
              stay on this page.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                tone="light"
                onClick={() => {
                  restoreCart(emptied);
                  setEmptied(null);
                }}
              >
                Put it back
              </Button>
              <ButtonLink href="/menu" tone="light" variant="secondary">
                Browse the menu
              </ButtonLink>
            </div>
          </div>
        ) : (
          // The empty cart. A charcoal card, the same surface as the counter
          // bar above it, so the page reads as two stacked facts about this
          // order: where it is collected from, and that nothing is in it yet.
          //
          // IT USED TO CARRY THE TRAFFIC SIGNAL FROM THE WALL, AND THAT WAS
          // WRONG TWICE. The wall drawing behind every marketing page already
          // has signals in it, so the cart restated the background at a
          // different size and weight, which read as a mistake rather than a
          // choice. And it sat in a column with its crop edges showing: the
          // framed picture laid on the page that The Drawing Runs Off The Page
          // Rule exists to prevent. Full strength black beside a 70% sentence
          // also made the drawing the loudest thing in the state, above the
          // message and the button.
          //
          // What replaces it is the heat scale, which is the one object this
          // restaurant has that no template does, and which the sentence
          // itself mentions. It needs the dark card: heat one is signage
          // yellow, and on the amber ground it would vanish.
          //
          // The undo panel above stays a dashed outline on the bare ground.
          // It is a live offer with a deadline on it, and the states differ
          // structurally rather than by colour.
          <section
            aria-labelledby="empty-cart-title"
            className="bg-nybb-charcoal text-nybb-bone mt-6 rounded-md first:mt-0"
          >
            <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16 lg:p-10">
              <div className="max-w-[44ch]">
                <h2 id="empty-cart-title" className="font-display heading-minor">
                  Nothing in the cart yet
                </h2>
                <p className="text-nybb-bone/70 mt-4 leading-relaxed">
                  Wings come in ten flavours and five levels of heat, and every
                  one of them is priced before you commit to it.
                </p>
                <ButtonLink href="/menu" tone="dark" className="mt-7">
                  Browse the menu
                </ButtonLink>
              </div>

              {heatLevels.length > 0 ? (
                <HeatSteps levels={heatLevels} className="order-first lg:order-none" />
              ) : null}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
      <div>
        {changes ? <DroppedNotice dropped={changes.dropped} repriced={changes.repriced} /> : null}

        <ul className="mt-6 space-y-4">
          {resolved.lines.map((line) => {
            const { image } = previewImage(line.item, line.line.optionSlugs);
            const quantity = line.line.quantity;

            return (
              <li
                key={line.key}
                className="bg-nybb-charcoal text-nybb-bone flex gap-4 overflow-hidden rounded-md p-3 sm:gap-5 sm:p-4"
              >
                <Link
                  href={lineHref(line)}
                  className="tile-orange relative size-20 shrink-0 overflow-hidden rounded-md sm:size-24"
                  tabIndex={-1}
                  aria-hidden
                >
                  {image ? (
                    <Image
                      src={image.src}
                      alt=""
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  ) : (
                    <NoPhotoTile name={line.item.name} className="absolute inset-0" />
                  )}
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <h2 className="font-display min-w-0 text-base leading-tight">
                      <Link
                        href={lineHref(line)}
                        className="hover:text-nybb-orange transition-colors duration-200"
                      >
                        {line.item.name}
                      </Link>
                    </h2>
                    {/* ml-auto rather than dropping the wrap. At 320px the name
                        and the total do not fit on one line, and squeezing the
                        name into what is left of the column turns "Brad's Angus
                        Burger Meal" into four lines. Letting it wrap and
                        pushing the total to the right of the next line keeps
                        the name readable and still lands every peso on the same
                        right rail as the price per item and the remove control
                        below it. */}
                    <p className="font-mono-tabular text-nybb-orange ml-auto shrink-0 text-base leading-tight">
                      {formatPeso(line.totalCents)}
                    </p>
                  </div>

                  {/* What was configured, in menu order. The size is only worth
                      saying when the item has more than one. */}
                  <p className="text-nybb-bone/65 mt-1.5 text-xs leading-relaxed">
                    {[
                      line.item.variations.length > 1 ? line.variation.name : null,
                      ...line.options.map(({ option }) => option.name),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-3">
                    <QuantityStepper
                      size="sm"
                      quantity={quantity}
                      onChange={(next) => setCartLineQuantity(line.key, next)}
                      fewerLabel={`One fewer ${line.item.name}`}
                      moreLabel={`One more ${line.item.name}`}
                    />

                    {/* ml-auto so that when this wraps under the stepper on a
                        320px phone it still finishes on the card's right edge,
                        under the line total, instead of stopping twenty pixels
                        short of it. */}
                    <div className="ml-auto flex items-center gap-4">
                      {quantity > 1 ? (
                        <span className="font-mono-tabular text-nybb-bone/55 text-xs">
                          {formatPeso(line.unitPriceCents)} each
                        </span>
                      ) : null}
                      {/* A square control, not underlined text. An underline is
                          this site's link vocabulary, and a link is a place you
                          go rather than a thing you do, so "Remove" read as
                          navigation dropped into a card.

                          Outlined and neutral at rest, red only under the
                          cursor. Nine trash icons standing permanently red down
                          the side of a cart is a list that looks like it is
                          erroring; the colour belongs to the moment before the
                          press, not to the page. Signage red on charcoal
                          measures 4.2:1, which is well past the 3:1 an icon
                          needs. */}
                      <Button
                        tone="dark"
                        variant="secondary"
                        size="icon"
                        onClick={() => removeCartLine(line.key)}
                        aria-label={`Remove ${line.item.name}`}
                        title={`Remove ${line.item.name}`}
                        className="text-nybb-bone/65 hover:border-nybb-red/70 hover:text-nybb-red hover:bg-nybb-red/10 active:bg-nybb-red/15"
                      >
                        <Trash2 aria-hidden className="h-4 w-4" strokeWidth={2} />
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* The two things you can do to the list as a whole.

            They were a 12px underline and a 12px underline of a different
            colour, which put the one irreversible action on this screen in the
            same typographic register as a footnote. Both are buttons now, at
            the same height and on the same baseline, but not at the same rank:
            adding something else is an ordinary thing to do and gets an
            outline, while emptying the cart is rare and irreversible and stays
            quiet until it is engaged, at which point it goes red. Adding is on
            the right, next to the checkout column it leads towards; emptying is
            on the far left, as far from that column as the row allows.

            Order flips on a phone: the constructive action comes first under
            the thumb, and the destructive one goes to the bottom where it is
            not the thing you hit while reaching for the total. */}
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            tone="light"
            variant="danger"
            onClick={() => setEmptied(clearCart())}
          >
            <Trash2 aria-hidden className="h-4 w-4" strokeWidth={2} />
            Empty the cart
          </Button>
          <ButtonLink href="/menu" tone="light" variant="secondary">
            Add something else
          </ButtonLink>
        </div>
      </div>

      <div className="lg:sticky lg:top-28 lg:h-fit">
        <div className="bg-nybb-charcoal text-nybb-bone rounded-md p-5 sm:p-6">
          <h2 className="font-display heading-panel">Order total</h2>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-nybb-bone/70">
                {resolved.quantity} {resolved.quantity === 1 ? "item" : "items"}
              </dt>
              <dd className="font-mono-tabular">{formatPeso(resolved.subtotalCents)}</dd>
            </div>
          </dl>

          <div className="border-nybb-bone/15 mt-4 flex items-baseline justify-between gap-4 border-t pt-4">
            <span className="font-display heading-panel">Subtotal</span>
            <span className="font-mono-tabular text-nybb-orange text-2xl" aria-live="polite">
              {formatPeso(resolved.subtotalCents)}
            </span>
          </div>

          {/* Checkout is the whole screen now: it chooses the window, takes
              the name and number, and places the order. Whether any window
              exists is still a question only the server can answer, so that
              answer stays there rather than being guessed at here.

              What this screen can now answer, because the page read it on the
              server, is whether checkout can complete at all. When it cannot,
              the control goes rather than going grey: a disabled primary
              button at the foot of a cart invites pressing, and the sentence
              underneath is what actually resolves the customer's problem. */}
          {orderingOpen ? (
            <ButtonLink
              href="/checkout"
              tone="dark"
              size="lg"
              block
              className="mt-6"
            >
              Choose a pickup time
            </ButtonLink>
          ) : (
            <ButtonLink
              href="/contact"
              tone="dark"
              variant="secondary"
              size="lg"
              block
              className="mt-6"
            >
              Counter phone numbers
            </ButtonLink>
          )}
          {/* THIS SENTENCE USED TO SAY THE ORDER COULD NOT BE PLACED ONLINE
              AND TO CALL THE BRANCH INSTEAD. It stopped being true the day
              place_order landed, and nothing here noticed, because the cart
              renders identically whether or not checkout works. The first
              order driven through a real browser is what found it: the screen
              was turning a customer away from a checkout that would have
              served them.

              What replaces it says only what this screen can know. Whether a
              window exists is the server's answer and checkout gives it, along
              with the branch phone numbers when the answer is none, so
              repeating a remedy here would be guessing at a state this
              component cannot see.

              14px, not 12px, and bone/65: this is the sentence that sets the
              expectation for the screen after it, so it is not footnote
              material.

              IT THEN SPENT A SECOND SPELL SAYING THE CUSTOMER WOULD PAY AT THE
              COUNTER. That stopped being true when pickup became payment
              first: there is no counter rail reachable from this checkout, and
              a customer told to bring cash and then asked for QR Ph on the
              next screen has been misled by the screen before it. */}
          <p className="text-nybb-bone/65 mt-3 text-sm leading-relaxed">
            {orderingOpen
              ? `Pickup only, and paid online before the kitchen starts. The next screen shows the windows ${storeName ?? "your counter"} has open.`
              : "Online ordering is not open yet. The counters are taking orders by phone, and the same menu and prices apply."}
          </p>
        </div>
      </div>
    </div>
  );
}
