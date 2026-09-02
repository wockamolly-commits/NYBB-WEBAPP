"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { WorkspaceSelect, type WorkspaceSelectOption } from "@/components/ui/WorkspaceSelect";
import { formatPeso } from "@/lib/format";
import {
  REFUND_REASON_LABELS,
  REFUND_REASONS,
  type RefundReason,
} from "@/lib/paymongo/refund-outcome";
import { refundOrder } from "./actions";

const refundReasonOptions: readonly WorkspaceSelectOption<RefundReason>[] = REFUND_REASONS.map((value) => ({
  value,
  label: REFUND_REASON_LABELS[value],
}));

function pesosToCents(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= 100 ? cents : null;
}

export function RefundControl({
  orderId,
  amountCents,
  refundedCents = 0,
}: {
  orderId: string;
  amountCents: number;
  refundedCents?: number;
}) {
  // The rule lives in lib/staff/refunds.ts, which mirrors staff_request_refund.
  const remainingCents = Math.max(0, amountCents - refundedCents);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<RefundReason>("requested_by_customer");
  const [amount, setAmount] = useState((remainingCents / 100).toFixed(2));
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Re-fill the box when the remainder moves under it.
   *
   * A part refund revalidates the page, which re-renders this control with a
   * smaller remainder but does not remount it, so `useState` keeps the figure
   * it was seeded with. Refund 200 of 450 and the box still offered 450 over a
   * payment with 250 left, which the database then refused. Adjusted during
   * render rather than in an effect, which is the supported pattern for state
   * that has to follow a prop.
   */
  const [seenRemaining, setSeenRemaining] = useState(remainingCents);
  if (seenRemaining !== remainingCents) {
    setSeenRemaining(remainingCents);
    setAmount((remainingCents / 100).toFixed(2));
  }

  if (!open) {
    return (
      // mt-4 matches the open panel, so opening and closing does not shuffle
      // the card underneath it.
      <div className="mt-4">
        {/*
          The outcome outlives the panel. Success used to set this message and
          then immediately close the panel that was the only thing rendering
          it, so the one refund state that most needs saying out loud, "Refund
          submitted and awaiting confirmation", was the one nobody ever saw.
        */}
        {message ? (
          <p role="status" className="text-nybb-bone/75 mb-2 text-sm">
            {message}
          </p>
        ) : null}
        <Button
          type="button"
          tone="dark"
          variant="secondary"
          onClick={() => {
            setMessage(null);
            setOpen(true);
          }}
        >
          Issue refund
        </Button>
      </div>
    );
  }

  function submit() {
    const cents = pesosToCents(amount);
    if (cents === null || cents > remainingCents) {
      setMessage(`Enter an amount from ₱1.00 to ${formatPeso(remainingCents)}.`);
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await refundOrder({ orderId, amountCents: cents, reason, note });
      setMessage(result.ok ? result.message : result.error);
      if (result.ok) setOpen(false);
    });
  }

  return (
    <section className="bg-nybb-graphite mt-4 rounded p-3" aria-label="Issue a refund">
      <p className="text-nybb-bone/75 text-sm">
        A refund cannot be undone. Maximum: {formatPeso(remainingCents)}.
      </p>
      {refundedCents > 0 ? (
        <p className="text-nybb-bone/60 mt-1 text-xs">
          {formatPeso(refundedCents)} of {formatPeso(amountCents)} has already been sent back or
          is waiting on the provider.
        </p>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <WorkspaceFieldLabel htmlFor={`refund-amount-${orderId}`}>Amount</WorkspaceFieldLabel>
          <WorkspaceInput
            id={`refund-amount-${orderId}`}
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={pending}
          />
        </div>
        <WorkspaceSelect
          id={`refund-reason-${orderId}`}
          name={`refund-reason-${orderId}`}
          label="Reason"
          options={refundReasonOptions}
          value={reason}
          onValueChange={(value) => value && setReason(value)}
          disabled={pending}
        />
      </div>
      <div className="mt-3">
        <WorkspaceFieldLabel htmlFor={`refund-note-${orderId}`}>Note (optional)</WorkspaceFieldLabel>
        <textarea
          id={`refund-note-${orderId}`}
          className="border-nybb-bone/40 bg-nybb-charcoal text-nybb-bone mt-2 min-h-20 w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-nybb-orange"
          value={note}
          maxLength={255}
          onChange={(event) => setNote(event.target.value)}
          disabled={pending}
        />
      </div>
      {message ? <p role="status" className="text-nybb-bone/75 mt-3 text-sm">{message}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button type="button" tone="dark" onClick={submit} disabled={pending}>
          {pending ? "Submitting refund" : "Confirm refund"}
        </Button>
        <Button
          type="button"
          tone="dark"
          variant="ghost"
          onClick={() => {
            setMessage(null);
            setOpen(false);
          }}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </section>
  );
}
