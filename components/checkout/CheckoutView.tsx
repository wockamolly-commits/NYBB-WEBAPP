"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { placeOrder } from "@/app/actions/checkout";
import { checkVoucher } from "@/app/actions/vouchers";
import { CustomerDetails, isDetailField } from "@/components/checkout/CustomerDetails";
import { OrderPlaced } from "@/components/checkout/OrderPlaced";
import { PendingPayment } from "@/components/checkout/PendingPayment";
import { payOrder } from "@/app/actions/payment";
import { SlotPicker } from "@/components/checkout/SlotPicker";
import { OrderTotals, VoucherField } from "@/components/checkout/VoucherField";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TextLink } from "@/components/ui/TextLink";
import { clearCart } from "@/lib/cart/store";
import { resolveCart } from "@/lib/cart/lines";
import { useCart } from "@/lib/cart/use-cart";
import { formatPeso } from "@/lib/format";
import { formatSlotRange } from "@/lib/slots/format";
import { storefrontAccessToken } from "@/lib/supabase/browser";
import type { CheckoutDetails, CheckoutField, PlacedOrder } from "@/lib/checkout/types";
import type { PickupSlots } from "@/lib/slots/types";
import type { MenuCategory } from "@/lib/menu/types";
import type { OnlineMethod } from "@/lib/paymongo/methods";
import type { PayOrderResult } from "@/lib/paymongo/attach-result";
import type { AppliedVoucher } from "@/lib/vouchers/preview";

/**
 * Checkout, screen four of the four in spec section 11.
 *
 * The order of the questions is the order the spec asks for, and the reason is
 * worth keeping in view: the pickup window comes first because it is the one
 * constraint that can invalidate the whole order. Finding out that nothing is
 * available after typing a name and a phone number is the worst possible
 * sequence, so the question that can fail is asked first.
 *
 * WHAT THIS COMPONENT DOES NOT DO.
 *
 * It does not price anything. The totals on screen come from `resolveCart`,
 * which is the display side, and the figure the customer actually owes comes
 * back from `place_order` in the confirmation. If the two ever disagree, the
 * server is right and the screen was stale, which is exactly the case this
 * design is built to survive rather than prevent.
 *
 * It also does not decide whether the shop is open, whether a window still has
 * room, or whether a flavour is still on the menu. All three can change between
 * the page loading and the button being pressed, so all three are answered
 * inside the transaction that writes the order, and this screen's job is to say
 * what happened afterwards in words a person can act on.
 */

const EMPTY_DETAILS: CheckoutDetails = { name: "", phone: "", email: "", notes: "" };

export function CheckoutView({
  categories,
  slots,
  initialDetails = EMPTY_DETAILS,
  signedIn = false,
  paymentMethods,
  branchSlug = null,
  storeChosen = false,
  storeCount = 0,
}: {
  categories: MenuCategory[];
  slots: PickupSlots;
  initialDetails?: CheckoutDetails;
  signedIn?: boolean;
  paymentMethods: OnlineMethod[];
  /**
   * The counter the customer chose, resolved and validated on the server.
   *
   * Null is a real answer rather than a missing one: `place_order` takes null
   * and resolves the single active branch, which is exactly right when there
   * is one counter and nobody has been asked. It is a slug either way, never a
   * price and never a name, so the server still reads every peso from the
   * price list the branch it resolves points at.
   */
  branchSlug?: string | null;
  storeChosen?: boolean;
  /** How many counters can take an order. Decides whether the choice is real. */
  storeCount?: number;
}) {
  const router = useRouter();
  const { cart, loaded } = useCart();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [details, setDetails] = useState<CheckoutDetails>(initialDetails);
  const [failure, setFailure] = useState<{ message: string; field: CheckoutField | null } | null>(
    null,
  );
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [pendingPayment, setPendingPayment] = useState<{
    order: PlacedOrder;
    method: OnlineMethod;
    result: PayOrderResult;
  } | null>(null);
  const [submitting, startSubmitting] = useTransition();

  /**
   * The promo code, held as three separate things, and the split is deliberate.
   *
   * `voucherCode` is what the customer typed. `voucher` is the SERVER's verdict
   * for the cart exactly as it stands, discount included, and it is the only
   * thing the summary renders a peso from. `appliedCode` is the code the
   * customer asked us to keep using, which is what the re-check below watches.
   *
   * Keeping the asked-for code apart from the server's answer is what lets a
   * discount fall off when the cart changes under it and come back when the
   * cart changes back, without the customer having to notice and retype
   * anything. One code, because the stacking rule is one code.
   */
  const [voucherCode, setVoucherCode] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [checkingVoucher, startCheckingVoucher] = useTransition();

  /**
   * The idempotency key, minted lazily and reused on every retry.
   *
   * Lazily, because generating it while rendering would produce one value on
   * the server pass and another on the client, and this has to be one value per
   * checkout rather than one per render. Reused, because that is the entire
   * point of it: a request that failed at the network is safe to send again
   * under the same id, and `place_order` will either place the order once or
   * hand back the one it already placed.
   */
  const attempt = useRef<string | null>(null);
  function attemptId(): string {
    attempt.current ??= crypto.randomUUID();
    return attempt.current;
  }

  const resolved = resolveCart(categories, cart);

  /**
   * The cart in the shape both the preview and the placement send.
   *
   * Slugs and quantities, exactly as `submit` builds them below. Not one price
   * leaves this browser in either direction, because not one price sent from a
   * browser would be believed.
   */
  const voucherLines = resolved.lines.map((line) => ({
    itemSlug: line.line.itemSlug,
    variationSlug: line.line.variationSlug,
    quantity: line.line.quantity,
    options: Object.entries(line.line.optionSlugs).flatMap(([groupSlug, optionSlugs]) =>
      optionSlugs.map((optionSlug) => ({ groupSlug, optionSlug })),
    ),
  }));

  const previewBranchSlug = branchSlug ?? slots.branch?.slug ?? null;
  // A signature rather than the array itself, so the re-check below fires when
  // the cart's CONTENTS change and not on every render that rebuilt the array.
  const cartSignature = JSON.stringify(voucherLines);

  // Read through a ref so that typing a phone number does not re-run the
  // check on every keystroke. The number only affects the per-customer cap,
  // and place_order counts that again with the number actually submitted.
  //
  // Written in an effect rather than during render: a ref mutated while
  // rendering is a value that differs between the two passes of Strict Mode
  // and between a discarded render and the committed one.
  const phoneRef = useRef(details.phone);
  useEffect(() => {
    phoneRef.current = details.phone;
  }, [details.phone]);

  /**
   * Re-check the applied code whenever what it was checked against moves.
   *
   * A discount is only true of one cart at one counter. Without this, a
   * customer could apply a code that needs PHP 500 of ribs, remove the ribs,
   * and walk to the payment screen still looking at the discount, which
   * `place_order` would then refuse after they had committed to paying.
   *
   * The failure path keeps `appliedCode` rather than clearing it, so putting
   * the ribs back brings the discount back without anybody retyping anything.
   * What it clears is `voucher`, which is the only thing the totals read, so a
   * stale discount can never be on screen.
   */
  useEffect(() => {
    // Nothing to re-check, and nothing to clear either: the two places that
    // drop a code (Remove, and applying a different one) clear the verdict in
    // the same handler, so this never has to catch up by setting state.
    if (appliedCode === null) return;
    let cancelled = false;
    void (async () => {
      const result = await checkVoucher({
        code: appliedCode,
        branchSlug: previewBranchSlug,
        phone: phoneRef.current,
        lines: JSON.parse(cartSignature) as typeof voucherLines,
      });
      if (cancelled) return;
      if (result.ok) {
        setVoucher(result.voucher);
        setVoucherError(null);
      } else {
        setVoucher(null);
        setVoucherError(result.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appliedCode, cartSignature, previewBranchSlug]);

  function applyVoucher() {
    const code = voucherCode.trim().toUpperCase();
    if (code === "") return;
    startCheckingVoucher(() => {
      // Applying replaces whatever was applied before. One code per order, so
      // there is no merge to do and nothing to ask about.
      //
      // The old verdict is dropped here rather than left standing while the new
      // one is checked, so the totals never show one code's discount under
      // another code's name.
      setVoucherCode(code);
      setVoucherError(null);
      setVoucher(null);
      setAppliedCode(code);
    });
  }

  function removeVoucher() {
    setAppliedCode(null);
    setVoucher(null);
    setVoucherError(null);
    setVoucherCode("");
  }

  // The confirmation is checked before the cart is, and it has to be: placing
  // an order empties the cart, so the "nothing to check out" branch below would
  // otherwise replace the pickup code the moment it appeared.
  if (pendingPayment) {
    return (
      <PendingPayment
        order={pendingPayment.order}
        method={pendingPayment.method}
        initialResult={pendingPayment.result}
      />
    );
  }
  if (placed) return <OrderPlaced order={placed} signedIn={signedIn} />;

  if (!loaded) {
    return (
      <div aria-hidden className="mt-8 space-y-4">
        <div className="bg-nybb-charcoal/10 h-64 rounded-md" />
      </div>
    );
  }

  if (resolved.lines.length === 0) {
    return (
      <div className="mt-8">
        <p className="text-nybb-ink/70 max-w-prose leading-relaxed">
          There is nothing to check out. Build an order first and the pickup
          times will be waiting here.
        </p>
        <div className="mt-6">
          <ButtonLink href="/menu" tone="light">
            Browse the menu
          </ButtonLink>
        </div>
      </div>
    );
  }

  const chosenSlot = slots.slots.find((slot) => slot.startsAt === selectedSlot);
  const onlineMethod = paymentMethods.includes("qrph") ? "qrph" : null;
  const paymentMethod = onlineMethod ?? "qrph";
  const timezone = slots.branch?.timezone ?? "Asia/Manila";

  /**
   * Whether the counter still has to be chosen before this order can be placed.
   *
   * Only when there is a genuine choice to make. With one live counter the
   * server resolves it and asking would be a step that has one answer, which
   * is a step that exists to look thorough. The day a second counter opens,
   * this turns itself on.
   */
  const needsStore = storeCount > 1 && !storeChosen;
  /** What the customer is actually about to pay, discount included. */
  const payableCents = Math.max(resolved.subtotalCents - (voucher?.discountCents ?? 0), 0);
  const detailError =
    failure && isDetailField(failure.field)
      ? { field: failure.field, message: failure.message }
      : null;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot || needsStore || submitting) return;

    startSubmitting(async () => {
      let accessToken: string | null = null;
      if (signedIn) {
        try {
          accessToken = await storefrontAccessToken();
        } catch {
          // The Server Action has a read-only cookie fallback.
        }
      }

      const result = await placeOrder({
        attemptId: attemptId(),
        // The counter the customer chose, not whichever one the slot reader
        // happened to resolve. Those were the same value while the picker did
        // not exist; they are not once it does, and the one that matters is
        // the one the screen named above the window grid.
        branchSlug: branchSlug ?? slots.branch?.slug ?? null,
        pickupSlotStart: selectedSlot,
        details,
        paymentMethod,
        // A code, never a discount. place_order resolves what it is worth from
        // the vouchers row, and anything this browser claimed about the money
        // would be ignored.
        voucherCode: appliedCode ?? "",
        // Slugs and quantities. Not one price leaves this browser, because not
        // one price sent from a browser would be believed.
        lines: voucherLines,
      }, accessToken);

      if (result.ok) {
        // The order exists, so this attempt is spent and the cart it was built
        // from is gone. Both have to happen before the confirmation renders, or
        // a customer who navigates back finds a cart that was already sold.
        attempt.current = null;
        clearCart();
        if (onlineMethod) {
          const payment = await payOrder({
            shortCode: result.order.shortCode,
            trackingToken: result.order.trackingToken,
            paymentAttemptId: crypto.randomUUID(),
            method: onlineMethod,
          });
          setPendingPayment({ order: result.order, method: onlineMethod, result: payment });
        } else {
          setPlaced(result.order);
        }
        return;
      }

      if (result.newAttempt) attempt.current = null;
      if (result.staleSlots) {
        // The windows on screen are out of date. Clear the choice and re-render
        // the route, which re-runs get_pickup_slots on the server: the customer
        // is being asked to pick again, so they must be picking from the truth.
        setSelectedSlot(null);
        router.refresh();
      }
      setFailure({ message: result.error, field: result.field ?? null });
    });
  }

  return (
    // items-start, so each card is as tall as what is in it.
    // ================================================================
    // A grid row stretches its items to the tallest one, and the order summary
    // is the taller of these two whenever the branch has no windows to offer.
    // The pickup panel was therefore painting a charcoal slab roughly a
    // thousand pixels tall around four lines of text, which reads as a panel
    // that failed to load rather than as an honest answer.
    //
    // This does not cost the sticky summary anything. align-self sizes the item,
    // not the grid area, so the right column still has the whole row to travel
    // through on a long day of slots, which is the only time it has anywhere to
    // travel to.
    <form
      onSubmit={submit}
      className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12"
    >
      <div className="space-y-6">
        <div className="bg-nybb-charcoal text-nybb-bone rounded-md p-5 sm:p-7">
          <SlotPicker
            slots={slots}
            selected={selectedSlot}
            onSelect={setSelectedSlot}
            disabled={submitting}
          />
        </div>

        <div className="bg-nybb-charcoal text-nybb-bone rounded-md p-5 sm:p-7">
          <CustomerDetails
            details={details}
            onChange={setDetails}
            error={detailError}
            disabled={submitting || !onlineMethod}
            paymentDescription={
              onlineMethod
                ? "Pay with QR Ph on the next screen. Nothing is charged by placing the order, and the kitchen receives it once payment is confirmed."
                : "Online payment is not open on this site yet, so an order cannot be completed here. The counter phone numbers are on the branches page and they can take this now."
            }
          />
        </div>
      </div>

      <div className="lg:sticky lg:top-28">
        <div className="bg-nybb-charcoal text-nybb-bone rounded-md p-5 sm:p-6">
          <h2 className="font-display heading-panel">Your order</h2>

          <ul className="border-nybb-bone/15 mt-4 space-y-3 border-b pb-4 text-sm">
            {resolved.lines.map((line) => (
              <li key={line.key} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="font-mono-tabular text-nybb-bone/55 mr-2">
                    {line.line.quantity}x
                  </span>
                  {/* Named the way the cart named it one screen earlier. */}
                  <span className="font-display">{line.item.name}</span>
                  <span className="text-nybb-bone/55 block text-xs">
                    {[
                      line.item.variations.length > 1 ? line.variation.name : null,
                      ...line.options.map(({ option }) => option.name),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="font-mono-tabular shrink-0">
                  {formatPeso(line.totalCents)}
                </span>
              </li>
            ))}
          </ul>

          <VoucherField
            code={voucherCode}
            onCodeChange={(next) => {
              setVoucherCode(next);
              setVoucherError(null);
            }}
            applied={voucher}
            error={voucherError}
            busy={checkingVoucher}
            disabled={submitting}
            onApply={applyVoucher}
            onRemove={removeVoucher}
          />

          <OrderTotals subtotalCents={resolved.subtotalCents} applied={voucher} />

          {/* Two lines, because they are two facts and a customer checks them
              separately: the shop they are walking to, and the minute they are
              walking there for. They used to be one comma-joined string that
              said "No time chosen yet" and named no counter at all, which left
              the summary silent about the single thing a pickup order is. */}
          <dl className="border-nybb-bone/15 mt-4 space-y-3 border-t pt-4">
            <div>
              <dt className="type-caps text-nybb-bone/55">Collect from</dt>
              <dd className="text-nybb-bone mt-1 text-sm leading-relaxed">
                {slots.branch?.shortName ?? "No counter chosen yet"}
              </dd>
            </div>
            <div>
              <dt className="type-caps text-nybb-bone/55">Pickup window</dt>
              <dd className="text-nybb-bone mt-1 text-sm leading-relaxed">
                {chosenSlot
                  ? formatSlotRange(chosenSlot, timezone)
                  : "No time chosen yet"}
              </dd>
            </div>
          </dl>

          {/* The label names what is missing, so the button is never a dead
              end the customer has to go hunting the cause of. Order matters:
              it asks for the counter before the window, because the windows on
              screen belong to a counter. */}
          <Button
            type="submit"
            tone="dark"
            size="lg"
            block
            disabled={!selectedSlot || needsStore || !onlineMethod || submitting}
            className="mt-6"
          >
            {submitting
              ? "Placing the order"
              : !onlineMethod
                ? "Online payment is not open yet"
                : needsStore
                  ? "Choose a counter first"
                  : selectedSlot
                    ? // The figure on the button is what will actually be
                      // charged. A button promising the subtotal beside a
                      // summary showing a discount is the one place this screen
                      // could lie about money.
                      `Continue to QR Ph, ${formatPeso(payableCents)}`
                    : "Choose a pickup time"}
          </Button>

          {/* Only the failures that are not about a field the customer can see.
              A refused name is said next to the name, because a message here
              would be somewhere else entirely on a phone, where the summary is
              the third card down. */}
          {failure && !isDetailField(failure.field) ? (
            // Bone on charcoal, with the red carried by a rule rather than by
            // the letters. Signage red on this ground measures 4.3:1, which is
            // under AA for body text, and an error message is the last thing on
            // a screen that should be hard to read. The rule only has to reach
            // 3:1 as a non-text indicator, and it does.
            <p
              role="alert"
              className="border-nybb-red text-nybb-bone mt-4 border-l-2 pl-3 text-sm leading-relaxed"
            >
              {failure.message}
            </p>
          ) : null}

          {/* Deliberately five words. The details panel explains the payment
              rail in full, and on a phone it is the card immediately above
              this one, so saying it twice reads as a page repeating itself.
              What is worth saying here, next to a button carrying a peso
              figure, is only that pressing it does not charge anybody. */}
          <p className="text-nybb-bone/65 mt-3 text-sm leading-relaxed">
            {onlineMethod
              ? "You will pay by QR Ph next."
              : "The counters are taking orders by phone in the meantime."}
          </p>

          {/* THE GUEST'S ONE WAY BACK TO THIS ORDER.
              ================================================================
              A guest is handed a tracking link on the next screen and that is
              the only copy of it in existence: close the tab and the order is
              unreachable from a browser, because there is no account for it to
              hang off. Signing in costs one email code and turns that into a
              row in the order history at /account.

              It is said here rather than on the confirmation, which is the
              screen where it is already too late to act on: the order exists,
              the cart is gone, and signing in then would be a detour away from
              a pickup code. A quiet line, not a panel. It is worth knowing and
              it is not worth interrupting a checkout for. */}
          {!signedIn ? (
            <p className="border-nybb-bone/15 text-nybb-bone/65 mt-4 border-t pt-4 text-sm leading-relaxed">
              Ordering as a guest is fine and you still pay the same way. Signing
              in keeps this order in your history, so you can reopen it without
              the tracking link.{" "}
              <TextLink href="/login" tone="dark">
                Sign in
              </TextLink>
            </p>
          ) : null}

          {/* Full width and inset to the card's edges, so it reads as the
              second rank of the same stack rather than as a stray underline
              hanging off the bottom left corner of the panel. */}
          <ButtonLink href="/cart" tone="dark" variant="ghost" block className="mt-4">
            Back to the cart
          </ButtonLink>
        </div>
      </div>
    </form>
  );
}
