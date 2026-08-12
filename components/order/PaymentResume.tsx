"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { payOrder } from "@/app/actions/payment";
import { Button } from "@/components/ui/Button";
import { formatPeso } from "@/lib/format";
import { MockPayment } from "@/components/checkout/MockPayment";

export function PaymentResume({
  shortCode,
  trackingToken,
  totalCents,
}: {
  shortCode: string;
  trackingToken: string | null;
  totalCents: number;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mock, setMock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resume() {
    startTransition(async () => {
      const result = await payOrder({
        shortCode,
        trackingToken,
        paymentAttemptId: crypto.randomUUID(),
        method: "qrph",
      });
      if (result.ok && "qr" in result) {
        setImageUrl(result.qr.imageUrl);
        setError(null);
      } else if (result.ok && "mock" in result) {
        setMock(true);
        setError(null);
      } else if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="border-nybb-bone/15 mt-6 border-t pt-5">
      <p className="type-caps text-nybb-bone/55">Payment still needed</p>
      <p className="text-nybb-bone/75 mt-2 max-w-prose text-sm leading-relaxed">
        Pay {formatPeso(totalCents)} by QR Ph to send this order to the kitchen.
      </p>
      {imageUrl ? (
        <div className="mt-4 rounded-md bg-white p-3 sm:w-fit">
          <Image
            src={imageUrl}
            alt={`QR Ph code to pay ${formatPeso(totalCents)}`}
            width={224}
            height={224}
            unoptimized
            className="max-w-full object-contain"
          />
          <a
            href={imageUrl}
            target="_blank"
            rel="noreferrer"
            download={`nybb-${shortCode}-qrph`}
            className="text-nybb-ink mt-3 block text-center text-sm underline decoration-current/40 underline-offset-4 hover:decoration-current"
          >
            Open QR image to save it
          </a>
        </div>
      ) : mock ? (
        <MockPayment
          shortCode={shortCode}
          trackingToken={trackingToken}
          totalCents={totalCents}
          compact
        />
      ) : (
        <Button type="button" tone="dark" onClick={resume} disabled={pending} className="mt-4">
          {pending ? "Opening payment" : "Open QR Ph payment"}
        </Button>
      )}
      {error ? (
        <p role="alert" className="border-nybb-red mt-4 border-l-2 pl-3 text-sm leading-relaxed">
          {error}
        </p>
      ) : null}
    </div>
  );
}
