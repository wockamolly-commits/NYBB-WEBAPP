"use client";

import { LoaderCircle, MapPin } from "lucide-react";
import { useState, useTransition } from "react";
import { markCustomerArrived } from "@/app/actions/order-arrival";
import { Button } from "@/components/ui/Button";

export function CustomerArrivalButton({
  shortCode,
  trackingToken,
}: {
  shortCode: string;
  trackingToken: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [arrived, setArrived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (arrived) {
    return (
      <p className="bg-nybb-yellow text-nybb-ink mt-5 rounded-md px-4 py-3 text-sm leading-relaxed" role="status">
        The counter knows you are here. Have your pickup code ready.
      </p>
    );
  }

  return (
    <div className="mt-5">
      <Button
        tone="dark"
        block
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await markCustomerArrived({ shortCode, trackingToken });
            if (result.ok) setArrived(true);
            else setError(result.error);
          });
        }}
      >
        {pending ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <MapPin aria-hidden className="size-4" />
        )}
        I&apos;m here
      </Button>
      <p className="text-nybb-bone/60 mt-2 text-sm leading-relaxed">
        Let the counter know when you reach the branch.
      </p>
      {error ? <p className="bg-nybb-red-deep/20 mt-3 rounded p-3 text-sm" role="alert">{error}</p> : null}
    </div>
  );
}
