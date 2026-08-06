"use client";

import { Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { NoPhotoTile } from "@/components/menu/NoPhotoTile";
import { Button, ButtonLink } from "@/components/ui/Button";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { lineHref, resolveCart } from "@/lib/cart/lines";
import {
  clearCart,
  reconcileCart,
  removeCartLine,
  setCartLineQuantity,
  type CartChanges,
} from "@/lib/cart/store";
import { useCart } from "@/lib/cart/use-cart";
import { formatPeso } from "@/lib/format";
import { previewImage } from "@/lib/menu/preview";
import type { MenuCategory } from "@/lib/menu/types";

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

export function CartView({ categories }: { categories: MenuCategory[] }) {
  const { cart, loaded, changes } = useCart();

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
    return (
      <div className="mt-8">
        {changes ? <DroppedNotice dropped={changes.dropped} repriced={changes.repriced} /> : null}
        <p className="text-nybb-ink/70 mt-6 max-w-prose leading-relaxed">
          Nothing in the cart yet. Wings come in nine flavours and five levels
          of heat, and every one of them is priced before you commit to it.
        </p>
        <div className="mt-6">
          <ButtonLink href="/menu" tone="light">
            Browse the menu
          </ButtonLink>
        </div>
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
            onClick={clearCart}
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

          {/* Checkout is a real screen now: the pickup window can be chosen
              there. What it cannot do yet is place the order, and it says so
              on arrival rather than here, because whether any window exists is
              a question only the server can answer. */}
          <ButtonLink
            href="/checkout"
            tone="dark"
            size="lg"
            block
            className="mt-6"
          >
            Choose a pickup time
          </ButtonLink>
          {/* 14px, not 12px. This is the sentence that tells a customer the
              order cannot actually be placed yet and what to do instead, so it
              is the last thing on the screen that should be set at footnote
              size. bone/65 is the same secondary weight the rest of the dark
              copy uses, which is a step up from the /55 it had. */}
          <p className="text-nybb-bone/65 mt-3 text-sm leading-relaxed">
            Pickup only. Placing the order online opens with the next release,
            so to order today, call the branch on the{" "}
            <Link
              href="/contact"
              className="text-nybb-bone underline decoration-current/40 underline-offset-4 hover:decoration-current"
            >
              branches page
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
