"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { payOrder } from "@/app/actions/payment";
import { Button, ButtonLink } from "@/components/ui/Button";
import { formatPeso } from "@/lib/format";
import { orderTrackingHref } from "@/lib/orders/tracking";
import type { PayOrderResult } from "@/lib/paymongo/attach-result";
import type { OnlineMethod } from "@/lib/paymongo/methods";
import type { PlacedOrder } from "@/lib/checkout/types";
import { MockPayment } from "./MockPayment";

export function PendingPayment({
  order,
  method,
  initialResult,
}: {
  order: PlacedOrder;
  method: OnlineMethod;
  initialResult: PayOrderResult;
}) {
  const [result, setResult] = useState(initialResult);
  const [retrying, startRetry] = useTransition();
  const tracking = orderTrackingHref(order.shortCode, order.trackingToken);

  useEffect(() => {
    if (result.ok && "redirectUrl" in result) window.location.assign(result.redirectUrl);
  }, [result]);

  function retry() {
    startRetry(async () => {
      setResult(
        await payOrder({
          shortCode: order.shortCode,
          trackingToken: order.trackingToken,
          paymentAttemptId: crypto.randomUUID(),
          method,
        }),
      );
    });
  }

  if (result.ok && "redirectUrl" in result) {
    return <p className="mt-8 text-nybb-ink/70">Opening your payment provider.</p>;
  }

  if (result.ok && "mock" in result) {
    return (
      <div className="mt-8 max-w-2xl">
        <section className="bg-nybb-charcoal text-nybb-bone rounded-md p-6 sm:p-8">
          <p className="type-caps text-nybb-orange">Payment needed</p>
          <h2 className="font-display heading-minor mt-3">Mock QR Ph payment</h2>
          <MockPayment
            shortCode={order.shortCode}
            trackingToken={order.trackingToken}
            totalCents={order.totalCents}
          />
        </section>
        <div className="mt-6">
          <ButtonLink href={tracking} tone="light" size="lg">
            Track this order
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 max-w-2xl">
      <section className="bg-nybb-charcoal text-nybb-bone rounded-md p-6 sm:p-8">
        <p className="type-caps text-nybb-orange">Payment needed</p>
        <h2 className="font-display heading-minor mt-3">Scan to pay with QR Ph</h2>
        <p className="text-nybb-bone/70 mt-3 max-w-prose leading-relaxed">
          Pay {formatPeso(order.totalCents)} to send this order to the kitchen. We will update
          your order as soon as PayMongo confirms the payment.
        </p>

        {result.ok && "qr" in result ? (
          <div className="mt-6 rounded-md bg-white p-4 sm:w-fit">
            <Image
              src={result.qr.imageUrl}
              alt={`QR Ph code to pay ${formatPeso(order.totalCents)}`}
              width={256}
              height={256}
              unoptimized
              className="mx-auto max-w-full object-contain"
            />
            <a
              href={result.qr.imageUrl}
              target="_blank"
              rel="noreferrer"
              download={`nybb-${order.shortCode}-qrph`}
              className="text-nybb-ink mt-3 block text-center text-sm underline decoration-current/40 underline-offset-4 hover:decoration-current"
            >
              Open QR image to save it
            </a>
          </div>
        ) : null}

        {result.ok && "qr" in result && result.qr.testUrl ? (
          <div className="border-nybb-yellow mt-6 border-l-2 pl-4">
            <p className="type-caps text-nybb-yellow">Development only</p>
            <p className="text-nybb-bone/75 mt-2 max-w-prose text-sm leading-relaxed">
              <strong>Do not scan the code above.</strong> PayMongo generates a real QR Ph code
              in test mode, and paying it moves real money. Complete this payment on PayMongo&rsquo;s
              simulation page instead.
            </p>
            <a
              href={result.qr.testUrl}
              target="_blank"
              rel="noreferrer"
              className="text-nybb-yellow mt-3 inline-block text-sm underline decoration-current/40 underline-offset-4 hover:decoration-current"
            >
              Open PayMongo&rsquo;s test payment page
            </a>
          </div>
        ) : null}

        {result.ok && "done" in result ? (
          <p className="bg-nybb-yellow text-nybb-ink mt-6 rounded-md px-4 py-3 text-sm leading-relaxed">
            Payment is being confirmed. Keep this page open and check your order status in a
            moment.
          </p>
        ) : null}

        {!result.ok ? (
          <div className="mt-6">
            <p role="alert" className="border-nybb-red border-l-2 pl-3 text-sm leading-relaxed">
              {result.error}
            </p>
            <Button type="button" tone="dark" onClick={retry} disabled={retrying} className="mt-4">
              {retrying ? "Opening payment" : "Try payment again"}
            </Button>
          </div>
        ) : null}
      </section>

      <div className="mt-6">
        <ButtonLink href={tracking} tone="light" size="lg">
          Track this order
        </ButtonLink>
        <p className="text-nybb-ink/70 mt-3 max-w-prose text-sm leading-relaxed">
          Keep this link. You can return here if the payment app closes this page.
        </p>
      </div>
    </div>
  );
}
