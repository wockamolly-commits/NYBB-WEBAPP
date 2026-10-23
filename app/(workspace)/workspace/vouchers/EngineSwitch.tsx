"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { VoucherActionState } from "@/lib/vouchers/schema";
import { setVouchersEnabled } from "./actions";

const INITIAL: VoucherActionState = { ok: false };

/**
 * The master switch, and the banner that exists because it is usually off.
 *
 * app_settings.vouchers_enabled has defaulted false since 0008 and spec section
 * 18 is emphatic about why: applying half the voucher feature fails open, so
 * the engine stays dark until all of it is live. That makes "off" the normal
 * state of this screen for most of its life, and a page full of promo codes
 * that silently do nothing is worse than no page.
 *
 * So the off state is a banner rather than a checkbox: it says the codes below
 * are not being accepted, and it carries the one control that changes that. The
 * on state is a single quiet line, because at that point the switch is not the
 * news and the codes are.
 */
export function EngineSwitch({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(setVouchersEnabled, INITIAL);
  // Two steps to switch off, like refusing an order or deleting a code. One
  // tap turns off every promo at every counter mid-service, and a slip of the
  // finger on a tablet is the likeliest way that happens.
  const [confirming, setConfirming] = useState(false);
  // Reset once codes are off, so turning them back on later does not open
  // straight onto the confirmation. Adjusted during render, React's pattern
  // for state that follows a prop.
  if (!enabled && confirming) setConfirming(false);

  if (enabled) {
    return (
      <form action={action} className="mt-7 flex flex-wrap items-center gap-3">
        <input type="hidden" name="enabled" value="false" />
        <p className="text-nybb-bone/55 text-sm leading-relaxed">
          Promo codes are being accepted at checkout.
        </p>
        {confirming ? (
          <>
            <p className="text-nybb-bone text-sm">
              Every code stops working at every counter. Stop now?
            </p>
            <Button type="submit" tone="dark" disabled={pending}>
              {pending ? "Stopping" : "Yes, stop accepting codes"}
            </Button>
            <Button type="button" tone="dark" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Keep them running
            </Button>
          </>
        ) : (
          <Button type="button" tone="dark" variant="ghost" onClick={() => setConfirming(true)}>
            Stop accepting codes
          </Button>
        )}
        {state.error ? (
          <p role="alert" className="border-nybb-red text-nybb-bone border-l-2 pl-3 text-sm">
            {state.error}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <form
      action={action}
      className="border-nybb-orange/60 bg-nybb-orange/10 mt-7 rounded-md border p-4 sm:p-5"
    >
      <input type="hidden" name="enabled" value="true" />
      <h2 className="font-display heading-panel text-nybb-bone uppercase">
        Promo codes are switched off
      </h2>
      <p className="text-nybb-bone/70 mt-2 max-w-2xl text-sm leading-relaxed">
        Every code below is refused at checkout, and a customer who types one is
        told promo codes are not running rather than being charged full price
        without explanation. Nothing here goes live until this is turned on.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" tone="dark" disabled={pending}>
          {pending ? "Starting" : "Start accepting codes"}
        </Button>
        {state.error ? (
          <p role="alert" className="border-nybb-red text-nybb-bone border-l-2 pl-3 text-sm">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
