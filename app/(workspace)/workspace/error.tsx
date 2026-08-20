"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";

/**
 * The last page between a thrown error and a counter with a queue at it.
 *
 * WHY THIS IS NOT THE FRAMEWORK'S DEFAULT PAGE.
 * ================================================================
 * Each workspace reader already handles the failure it can predict: a query
 * that comes back empty-handed returns null and the page says so in its own
 * words, inside the shell, with the nav still there. Nothing caught the
 * failures nobody predicted. Those fell through to Next's built-in error
 * screen, which in production is a bare line of text on a white page with no
 * nav, no sign of the workspace, and no way back other than the browser's own
 * controls, which a tablet in kiosk mode may not be showing.
 *
 * So this catches them inside the workspace, keeps the header and the nav, and
 * offers the two moves that are actually available: try the same page again,
 * or go somewhere that works.
 *
 * It deliberately does not print `error.message`. A Postgres error text can
 * carry column names and row contents, this screen is a counter in a shop, and
 * the digest is the thing that matches a server log entry anyway.
 */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[workspace] unhandled render error:", error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-xl py-6 text-center">
      <p className="type-caps text-nybb-yellow">Something broke</p>
      <h1 className="font-display heading-minor mt-3">This page could not be opened</h1>
      <p className="text-nybb-bone/70 mt-4 leading-relaxed">
        Your sign-in is still good and no order has been changed by this. Try the page again, and
        if it keeps failing, work from the orders board and tell whoever looks after the site.
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button type="button" tone="dark" onClick={reset}>
          <RotateCcw aria-hidden className="size-4" />
          Try again
        </Button>
        <ButtonLink href="/workspace/orders" tone="dark" variant="secondary">
          Go to the orders board
        </ButtonLink>
      </div>

      {error.digest ? (
        <p className="text-nybb-bone/55 mt-8 font-mono text-xs">
          Reference {error.digest}
        </p>
      ) : null}
    </div>
  );
}
