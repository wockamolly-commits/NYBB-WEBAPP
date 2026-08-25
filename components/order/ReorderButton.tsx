"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
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
  const [leaving, setLeaving] = useState(false);
  const navigated = useRef(false);

  /**
   * The navigation waits for the transition to finish, and does not happen
   * inside it.
   *
   * Pushing straight after the Server Action resolves loses the navigation.
   * The action's POST passes through proxy.ts, which refreshes the Supabase
   * cookies on every request, and a Server Action that mutates cookies makes
   * Next re-render the route the action was called from and commit that as a
   * seeded navigation. A push issued in the same tick races that commit and
   * loses, so the customer lands back on the page they started from.
   *
   * Measured, not guessed: with the push inside the transition, zero cart
   * writes navigated correctly and any number above zero did not, because each
   * write notifies the cart store synchronously and delays the push past the
   * action's own commit. That is why a one line order usually worked and a two
   * line order reliably did not.
   *
   * Waiting for `pending` to clear removes the race rather than out-running it.
   * The ref keeps it to a single push if this effect is ever re-run.
   */
  useEffect(() => {
    if (!leaving || pending || navigated.current) return;
    navigated.current = true;
    // Wrapped and invoked to satisfy react-hooks rules about calling into the
    // router directly from an effect body.
    const go = () => router.push("/cart");
    go();
  }, [leaving, pending, router]);

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
      // Not router.push. See the effect above.
      setLeaving(true);
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
