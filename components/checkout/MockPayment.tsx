"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeMockPayment } from "@/app/actions/payment";
import { Button } from "@/components/ui/Button";
import { formatPeso } from "@/lib/format";

export function MockPayment({
  shortCode,
  trackingToken,
  totalCents,
  compact = false,
}: {
  shortCode: string;
  trackingToken: string | null;
  totalCents: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const [result, setResult] = useState<"idle" | "paid" | "failed">("idle");
  const [pending, startTransition] = useTransition();

  function complete(outcome: "paid" | "failed") {
    startTransition(async () => {
      const next = await completeMockPayment({
        shortCode,
        trackingToken,
        paymentAttemptId: crypto.randomUUID(),
        method: "qrph",
        outcome,
      });
      setResult(next.ok && "done" in next ? "paid" : "failed");

      // The page around this component is server-rendered from the order, and
      // settling a payment does not change the order's STATUS: a paid online
      // order stays `pending` and the staff board reads the payment row to
      // offer Start. So the tracking page's Realtime signal, which fires on a
      // status change, never fires here. Without this refresh the screen went
      // on saying "Waiting for payment" and "Payment still needed" directly
      // above the words "Mock payment confirmed", and only the 20-second
      // visible-tab poll eventually resolved the contradiction.
      router.refresh();
    });
  }

  return (
    <div className={compact ? "mt-4" : "mt-6 rounded-md bg-nybb-graphite/70 p-4"}>
      <p className="type-caps text-nybb-yellow">Development payment simulation</p>
      <p className="text-nybb-bone/75 mt-2 text-sm leading-relaxed">
        Simulate a QR Ph payment of {formatPeso(totalCents)}. No money is moved.
      </p>
      {result === "paid" ? (
        <p className="bg-nybb-yellow text-nybb-ink mt-4 rounded-md px-4 py-3 text-sm leading-relaxed">
          Mock payment confirmed. The order is now available to the kitchen.
        </p>
      ) : result === "failed" ? (
        <p role="alert" className="border-nybb-red mt-4 border-l-2 pl-3 text-sm leading-relaxed">
          Mock payment failed. This order was cancelled and its pickup window was released.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" tone="dark" onClick={() => complete("paid")} disabled={pending}>
            {pending ? "Confirming payment" : "Simulate payment success"}
          </Button>
          <Button type="button" tone="dark" variant="secondary" onClick={() => complete("failed")} disabled={pending}>
            Simulate payment failure
          </Button>
        </div>
      )}
    </div>
  );
}
