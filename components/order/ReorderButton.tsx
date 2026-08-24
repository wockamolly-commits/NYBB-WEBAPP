"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reorder } from "@/app/actions/reorder";
import { Button } from "@/components/ui/Button";
import { stashReorderReport } from "@/lib/cart/reorder-report";
import { addToCart } from "@/lib/cart/store";
import type { SkippedLine } from "@/lib/cart/reorder";

/**
 * "Order this again".
 *
 * The action is a read and hands back lines; this writes them, because the
 * cart lives in localStorage and only the browser may touch it. It merges
 * rather than replacing: the cart is the one place in this flow holding work
 * the customer did on purpose, and silently throwing it away to make room for
 * history is a worse failure than adding to it.
 *
 * It always lands on /cart. Reorder never places an order and never skips the
 * review, because a menu that has moved under a saved order is exactly the
 * situation a customer needs to see before paying.
 */
export function ReorderButton({
  shortCode,
  token,
}: {
  shortCode: string;
  token?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      let result;
      try {
        result = await reorder({ shortCode, token });
      } catch {
        // Invoking a Server Action can fail for transport reasons alone,
        // regardless of how well the action body behaves. Without this catch
        // the button would sit pending forever, showing "Bringing it back"
        // and never resolving. The message matches what the action itself
        // returns for a failed read, and the token never reaches a log line.
        setError("That order could not be read.");
        return;
      }

      if (!result.ok) {
        setError(result.error);
        return;
      }

      let restored = 0;
      let cartFull = false;
      const skipped: SkippedLine[] = [...result.skipped];
      for (const line of result.lines) {
        if (addToCart(line).ok) {
          restored += 1;
        } else {
          cartFull = true;
        }
      }
      if (cartFull) {
        // One entry however many lines overflowed, because describeSkip's
        // cart-full sentence names nothing and repeating it per line would
        // print the same bullet several times.
        skipped.push({ name: "", variationLabel: "", reason: "cart-full" });
      }

      stashReorderReport({ restored, skipped });
      router.push("/cart");
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        tone="light"
        variant="secondary"
        onClick={run}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <RotateCcw aria-hidden className="size-4" />
        )}
        {pending ? "Bringing it back" : "Order this again"}
        <span className="sr-only"> (order {shortCode})</span>
      </Button>
      {error ? (
        <p role="alert" className="text-nybb-ink/75 max-w-64 text-xs leading-snug">
          {error}
        </p>
      ) : null}
    </div>
  );
}
