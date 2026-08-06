"use client";

import { Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { NoPhotoTile } from "@/components/menu/NoPhotoTile";
import { ActionLink } from "@/components/ui/ActionLink";
import { MAX_QUANTITY, MIN_QUANTITY, lineHref, resolveCart } from "@/lib/cart/lines";
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
      <p className="font-display text-nybb-ink text-sm tracking-[0.06em]">
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
          <ActionLink href="/menu" tone="light">
            Browse the menu
          </ActionLink>
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
                    <div className="border-nybb-bone/25 flex items-center rounded-md border">
                      <button
                        type="button"
                        onClick={() => setCartLineQuantity(line.key, quantity - 1)}
                        disabled={quantity <= MIN_QUANTITY}
                        aria-label={`One fewer ${line.item.name}`}
                        className="hover:bg-nybb-bone/10 flex h-10 w-10 items-center justify-center text-lg transition-colors disabled:opacity-35"
                      >
                        -
                      </button>
                      <output className="font-mono-tabular w-9 text-center text-sm">
                        {quantity}
                      </output>
                      <button
                        type="button"
                        onClick={() => setCartLineQuantity(line.key, quantity + 1)}
                        disabled={quantity >= MAX_QUANTITY}
                        aria-label={`One more ${line.item.name}`}
                        className="hover:bg-nybb-bone/10 flex h-10 w-10 items-center justify-center text-lg transition-colors disabled:opacity-35"
                      >
                        +
                      </button>
                    </div>

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
                      {/* A bordered square, not underlined text. An underline
                          is this site's link vocabulary, and a link is a place
                          you go rather than a thing you do, so "Remove" read as
                          navigation dropped into a card. Matching the stepper's
                          border and its 40px box also puts the two controls of
                          this row on one baseline. */}
                      <button
                        type="button"
                        onClick={() => removeCartLine(line.key)}
                        aria-label={`Remove ${line.item.name}`}
                        title={`Remove ${line.item.name}`}
                        // 42px, which is the stepper's 40px button plus the 1px
                        // border on each side of the group holding it. Sized in
                        // one number rather than h-10 plus a border, which
                        // border-box would take back out and leave this two
                        // pixels short of its neighbour.
                        className="border-nybb-bone/25 text-nybb-bone/65 hover:border-nybb-bone/60 hover:text-nybb-bone hover:bg-nybb-bone/10 flex size-[2.625rem] items-center justify-center rounded-md border transition-colors"
                      >
                        <Trash2 aria-hidden className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={clearCart}
            className="text-nybb-ink/60 hover:text-nybb-ink inline-flex min-h-11 items-center text-xs underline underline-offset-4 transition-colors"
          >
            Empty the cart
          </button>
          <Link
            href="/menu"
            className="font-display text-nybb-ink inline-flex min-h-11 items-center text-xs tracking-[0.06em] underline underline-offset-[7px] decoration-nybb-ink/30 hover:decoration-nybb-ink transition-colors"
          >
            Add something else
          </Link>
        </div>
      </div>

      <div className="lg:sticky lg:top-28 lg:h-fit">
        <div className="bg-nybb-charcoal text-nybb-bone rounded-md p-5 sm:p-6">
          <h2 className="font-display text-sm tracking-[0.08em]">Order total</h2>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-nybb-bone/70">
                {resolved.quantity} {resolved.quantity === 1 ? "item" : "items"}
              </dt>
              <dd className="font-mono-tabular">{formatPeso(resolved.subtotalCents)}</dd>
            </div>
          </dl>

          <div className="border-nybb-bone/15 mt-4 flex items-baseline justify-between gap-4 border-t pt-4">
            <span className="font-display text-sm tracking-[0.08em]">Subtotal</span>
            <span className="font-mono-tabular text-nybb-orange text-2xl" aria-live="polite">
              {formatPeso(resolved.subtotalCents)}
            </span>
          </div>

          {/* Checkout is a real screen now: the pickup window can be chosen
              there. What it cannot do yet is place the order, and it says so
              on arrival rather than here, because whether any window exists is
              a question only the server can answer. */}
          <Link
            href="/checkout"
            className="bg-nybb-orange text-nybb-ink hover:bg-nybb-orange-lit font-display mt-6 flex min-h-12 w-full items-center justify-center rounded-md text-sm tracking-[0.06em] transition-colors duration-200"
          >
            Choose a pickup time
          </Link>
          <p className="text-nybb-bone/55 mt-3 text-xs leading-relaxed">
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
