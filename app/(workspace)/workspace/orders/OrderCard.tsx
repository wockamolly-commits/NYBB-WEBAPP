"use client";

import { Check, Clock3, Flame, LoaderCircle, PackageCheck, Phone, Play } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { formatPeso } from "@/lib/format";
import { telHref } from "@/lib/phone";
import {
  REJECT_REASON_CODES,
  REJECT_REASON_LABELS,
  type RejectReasonCode,
} from "@/lib/orders/reject-reasons";
import { boardAction, paymentLabel } from "@/lib/staff/board";
import type { StaffOrderActionResult, WorkspaceOrder } from "@/lib/staff/order-types";
import { claimOrder, markOrderReady, rejectOrder, startOrder } from "./actions";
import { RefundControl } from "./RefundControl";

function manilaTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

export function OrderCard({ order, mayRefund }: { order: WorkspaceOrder; mayRefund: boolean }) {
  const [pending, startTransition] = useTransition();
  const [claiming, setClaiming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<RejectReasonCode>("sold_out");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<StaffOrderActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  }

  const action = boardAction(order);

  return (
    <article className="bg-nybb-charcoal rounded-md p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-lg font-bold tracking-tight">{order.shortCode}</p>
            {order.isTest ? (
              <span className="border-nybb-yellow/60 text-nybb-yellow rounded border px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider">
                Test
              </span>
            ) : null}
          </div>
          <p className="text-nybb-bone/70 mt-1 text-sm break-words">{order.customerName}</p>
          {/*
            A ready order and an empty counter is the one situation on this
            board with no next tap in it. The number was on the order the whole
            time and reachable only from History, which does not carry an order
            that is still open, so in practice it was not reachable at all.
          */}
          <a
            href={telHref(order.customerPhone)}
            className="text-nybb-bone/60 hover:text-nybb-bone focus-visible:text-nybb-bone -ml-1 inline-flex min-h-11 items-center gap-1.5 rounded px-1 text-xs underline-offset-4 hover:underline"
          >
            <Phone aria-hidden className="size-3.5" />
            {order.customerPhone}
            <span className="sr-only"> (call {order.customerName})</span>
          </a>
        </div>
        {/*
          Labelled, because it was not. This chip showed the pickup time when
          there was one and the order time when there was not, in the same
          place, in the same face, with no word either way. The card also
          prints the order time again at the bottom, so the same value could
          appear twice and a counter had no way to tell which "6:45" was the
          one the customer was coming back for.
        */}
        <span className="bg-nybb-graphite shrink-0 rounded px-2 py-1 text-right">
          <span className="type-caps text-nybb-bone/60 block text-[0.625rem]">Pickup</span>
          <span className="mt-0.5 block font-mono text-sm">
            {order.pickupAt ? manilaTime(order.pickupAt) : "Not set"}
          </span>
        </span>
      </div>

      {order.customerArrived ? (
        <p className="bg-nybb-yellow text-nybb-ink type-caps mt-3 rounded px-2 py-1 text-center">
          Customer is here
        </p>
      ) : null}

      <ul className="border-nybb-bone/15 mt-3 space-y-2 border-t pt-3 text-sm">
        {order.items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="leading-snug">
            <span className="text-nybb-orange font-mono">{item.quantity}x</span>{" "}
            {item.name} <span className="text-nybb-bone/55">{item.variation}</span>
            {item.options.length ? (
              <span className="text-nybb-bone/55 mt-0.5 block text-xs">{item.options.join(", ")}</span>
            ) : null}
          </li>
        ))}
      </ul>

      {order.heatLevels.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {order.heatLevels.map((heat) => (
            <span key={heat} className="bg-nybb-red-deep/25 text-nybb-bone inline-flex items-center gap-1 rounded px-2 py-1 text-xs">
              <Flame aria-hidden className="size-3 text-nybb-orange" /> {heat}
            </span>
          ))}
        </div>
      ) : null}

      {order.notes ? <p className="bg-nybb-graphite text-nybb-bone/65 mt-3 rounded p-2 text-xs">{order.notes}</p> : null}

      <div className="border-nybb-bone/15 mt-3 flex items-end justify-between gap-3 border-t pt-3">
        <div>
          <p className="font-mono text-lg font-bold">{formatPeso(order.totalCents)}</p>
          <p className="text-nybb-bone/55 mt-1 text-xs uppercase tracking-wider">{paymentLabel(order)}</p>
        </div>
        <span className="text-nybb-bone/55 inline-flex shrink-0 items-center gap-1 text-xs">
          <Clock3 aria-hidden className="size-3" /> Ordered {manilaTime(order.placedAt)}
        </span>
      </div>

      {error ? <p role="alert" className="bg-nybb-red-deep/20 mt-3 rounded p-2 text-sm">{error}</p> : null}

      {action.kind === "awaiting_payment" ? (
        // Not an error, and not a button that would fail. staff_set_order_status
        // raises PAYMENT_REQUIRED for this order, so offering Start here would
        // hand a counter a control whose only outcome is a red message during a
        // rush. The customer may be holding a QR code right now, and the expiry
        // sweep clears the window if they never pay.
        <p className="border-nybb-bone/20 text-nybb-bone/55 mt-4 flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm">
          <Clock3 aria-hidden className="size-4" />
          Waiting for the customer to pay
        </p>
      ) : null}
      {action.kind === "start" ? (
        <Button tone="dark" block className="mt-4" disabled={pending} onClick={() => run(() => startOrder(order.id))}>
          {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <Play aria-hidden className="size-4" />}
          Start
        </Button>
      ) : null}
      {action.kind === "ready" ? (
        <Button tone="dark" block className="mt-4" disabled={pending} onClick={() => run(() => markOrderReady(order.id))}>
          {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <Check aria-hidden className="size-4" />}
          Ready
        </Button>
      ) : null}
      {action.kind === "claim" && !claiming ? (
        <Button tone="dark" block className="mt-4" disabled={pending} onClick={() => setClaiming(true)}>
          <PackageCheck aria-hidden className="size-4" /> Claim
        </Button>
      ) : null}
      {action.kind === "claim" && claiming ? (
        <div className="mt-4 space-y-2">
          <WorkspaceFieldLabel htmlFor={`claim-${order.id}`}>
            Pickup code
          </WorkspaceFieldLabel>
          <p id={`claim-hint-${order.id}`} className="text-nybb-bone/55 text-xs">
            Ask the customer for the four digits on their order.
          </p>
          <WorkspaceInput
            id={`claim-${order.id}`}
            // Opening this panel is already the decision to type. Without the
            // caret here it costs a second tap on a small target, once per
            // order, on a tablet held in one hand.
            autoFocus
            aria-describedby={`claim-hint-${order.id}`}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            className="mt-0 h-12 bg-transparent text-center font-mono text-xl tracking-[0.3em]"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button tone="dark" disabled={pending || code.length !== 4} onClick={() => run(() => claimOrder(order.id, code))}>Confirm</Button>
            <Button tone="dark" variant="ghost" disabled={pending} onClick={() => { setClaiming(false); setCode(""); setError(null); }}>Keep ready</Button>
          </div>
        </div>
      ) : null}
      {action.kind === "done" ? null : rejecting ? (
        <div className="border-nybb-bone/15 mt-4 space-y-2 border-t pt-4">
          <WorkspaceFieldLabel htmlFor={`reject-${order.id}`}>
            Why can the branch not make this?
          </WorkspaceFieldLabel>
          <select
            id={`reject-${order.id}`}
            autoFocus
            className="border-nybb-bone/25 focus:border-nybb-bone/60 h-11 w-full rounded-md border bg-transparent px-2 text-sm"
            value={reason}
            onChange={(event) => setReason(event.target.value as RejectReasonCode)}
          >
            {REJECT_REASON_CODES.map((option) => (
              <option key={option} value={option} className="bg-nybb-graphite">
                {REJECT_REASON_LABELS[option]}
              </option>
            ))}
          </select>
          <p className="text-nybb-bone/55 text-xs leading-snug">
            {order.payment?.status === "paid"
              ? "The customer is told the branch will return the payment. Issue the refund from History afterwards."
              : "The pickup window goes back on sale straight away."}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              tone="dark"
              variant="danger"
              disabled={pending}
              onClick={() => run(() => rejectOrder(order.id, reason))}
            >
              Refuse order
            </Button>
            <Button
              tone="dark"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setRejecting(false);
                setError(null);
              }}
            >
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        // Quiet, and never beside the button it undoes. Refusing an order is
        // the one control here a branch cannot take back, and a counter tapping
        // it by accident during a rush has told a customer their food is off.
        <button
          type="button"
          disabled={pending}
          // Quiet, but not small. The weight is the whole point of this
          // control and stays exactly as it was; the 44px box around the words
          // is what was missing, on a screen that is only ever touched.
          className="text-nybb-bone/55 hover:text-nybb-bone focus-visible:text-nybb-bone mt-3 flex min-h-11 w-full items-center justify-center rounded text-center text-xs underline underline-offset-4 disabled:pointer-events-none disabled:opacity-50"
          onClick={() => setRejecting(true)}
        >
          Cannot make this order
        </button>
      )}

      {mayRefund && order.payment?.isMock && order.payment.status === "paid" ? (
        <RefundControl orderId={order.id} amountCents={order.totalCents} />
      ) : null}
    </article>
  );
}
