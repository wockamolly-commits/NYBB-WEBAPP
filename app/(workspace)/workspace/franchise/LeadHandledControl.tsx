"use client";

import { Check, LoaderCircle, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { setLeadHandled } from "./actions";

/**
 * The one control on a lead card.
 *
 * Deliberately not optimistic. The list re-sorts and, in the default "open"
 * view, the row disappears entirely when it is marked handled, so showing the
 * change before the server agreed would mean a lead vanishing and then coming
 * back if the write failed. Waiting is the honest version and the write is one
 * round trip.
 */
export function LeadHandledControl({
  id,
  handled,
  name,
}: {
  id: string;
  handled: boolean;
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const act = () => {
    setError(null);
    startTransition(async () => {
      const result = await setLeadHandled(id, !handled);
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        tone="dark"
        variant={handled ? "ghost" : "secondary"}
        disabled={pending}
        onClick={act}
      >
        {pending ? (
          <>
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            Saving
          </>
        ) : handled ? (
          <>
            <Undo2 className="size-4" aria-hidden />
            <span>
              Reopen<span className="sr-only"> the lead from {name}</span>
            </span>
          </>
        ) : (
          <>
            <Check className="size-4" aria-hidden />
            <span>
              Mark handled<span className="sr-only">: the lead from {name}</span>
            </span>
          </>
        )}
      </Button>

      {error ? (
        <p role="alert" className="text-nybb-red max-w-56 text-right text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
