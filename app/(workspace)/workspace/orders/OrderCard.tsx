"use client";

import { Check, Clock3, Flame, LoaderCircle, PackageCheck, Play } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { formatPeso } from "@/lib/format";
import type { StaffOrderActionResult, WorkspaceOrder } from "@/lib/staff/order-types";
import { claimOrder, markOrderReady, startOrder } from "./actions";

function manilaTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

export function OrderCard({ order }: { order: WorkspaceOrder }) {
  const [pending, startTransition] = useTransition();
  const [claiming, setClaiming] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<StaffOrderActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  }

  const paymentLabel =
    order.payment?.method === "counter"
      ? order.payment.status === "paid"
        ? "Paid at counter"
        : "Collect at counter"
      : order.payment?.status === "paid"
        ? "Paid online"
        : "Awaiting payment";

  return (
    <article className="bg-nybb-charcoal rounded-md p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-lg font-bold tracking-tight">{order.shortCode}</p>
            {order.isTest ? (
              <span className="border-nybb-yellow/60 text-nybb-yellow rounded border px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider">
                Test
              </span>
            ) : null}
          </div>
          <p className="text-nybb-bone/55 mt-1 text-xs">{order.customerName}</p>
        </div>
        <span className="bg-nybb-graphite text-nybb-bone/70 rounded px-2 py-1 font-mono text-xs">
          {order.pickupAt ? manilaTime(order.pickupAt) : manilaTime(order.placedAt)}
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
            {item.name} <span className="text-nybb-bone/45">{item.variation}</span>
            {item.options.length ? (
              <span className="text-nybb-bone/45 mt-0.5 block text-xs">{item.options.join(", ")}</span>
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
          <p className="text-nybb-bone/45 mt-1 text-xs uppercase tracking-wider">{paymentLabel}</p>
        </div>
        <span className="text-nybb-bone/45 inline-flex items-center gap-1 text-xs">
          <Clock3 aria-hidden className="size-3" /> {manilaTime(order.placedAt)}
        </span>
      </div>

      {error ? <p role="alert" className="bg-nybb-red-deep/20 mt-3 rounded p-2 text-sm">{error}</p> : null}

      {order.status === "pending" || order.status === "accepted" ? (
        <Button tone="dark" block className="mt-4" disabled={pending} onClick={() => run(() => startOrder(order.id))}>
          {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <Play aria-hidden className="size-4" />}
          Start
        </Button>
      ) : null}
      {order.status === "preparing" ? (
        <Button tone="dark" block className="mt-4" disabled={pending} onClick={() => run(() => markOrderReady(order.id))}>
          {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <Check aria-hidden className="size-4" />}
          Ready
        </Button>
      ) : null}
      {order.status === "ready" && !claiming ? (
        <Button tone="dark" block className="mt-4" disabled={pending} onClick={() => setClaiming(true)}>
          <PackageCheck aria-hidden className="size-4" /> Claim
        </Button>
      ) : null}
      {order.status === "ready" && claiming ? (
        <div className="mt-4 space-y-2">
          <WorkspaceFieldLabel htmlFor={`claim-${order.id}`}>Pickup code</WorkspaceFieldLabel>
          <WorkspaceInput
            id={`claim-${order.id}`}
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
    </article>
  );
}
