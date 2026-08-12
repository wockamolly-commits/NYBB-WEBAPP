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

export function RefundControl({ orderId, amountCents }: { orderId: string; amountCents: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<RefundReason>("requested_by_customer");
  const [amount, setAmount] = useState((amountCents / 100).toFixed(2));
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button type="button" tone="dark" variant="secondary" onClick={() => setOpen(true)}>
        Issue refund
      </Button>
    );
  }

  function submit() {
    const cents = pesosToCents(amount);
    if (cents === null || cents > amountCents) {
      setMessage(`Enter an amount from ₱1.00 to ${formatPeso(amountCents)}.`);
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
      <p className="text-nybb-bone/70 text-sm">A refund cannot be undone. Maximum: {formatPeso(amountCents)}.</p>
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
          defaultValue={reason}
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
        <Button type="button" tone="dark" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
