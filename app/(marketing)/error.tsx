"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { reportBoundaryError } from "@/lib/monitoring/report-boundary-error";

/**
 * What a customer sees when a storefront page throws.
 *
 * Without this, an unpredicted failure on the menu, the cart, checkout or an
 * order page fell through to Next's built-in error screen: a bare line of text
 * on a white page, with no header, no way back, and nothing to say the shop
 * is still there. This sits inside app/(marketing)/layout.tsx, so the header
 * and footer survive and the customer keeps their bearings.
 *
 * Like the workspace's error page it never prints `error.message`, which in
 * production is a generic string anyway; the digest is what matches a log
 * line. It offers the two moves that are actually available: load the page
 * again, which re-fetches it, or go to the menu, which is the page most
 * likely to work.
 */
export default function StorefrontError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[storefront] unhandled render error:", error);
    reportBoundaryError(error);
  }, [error]);

  return (
    // A div, not <main>: this renders inside the storefront layout's own
    // <main id="main">, and a second one nested in it was a duplicate landmark
    // and a duplicate id.
    <div role="alert" className="mx-auto max-w-xl px-4 py-16 text-center sm:py-24">
      <p className="type-caps text-nybb-ink/65 font-mono-tabular">Something broke</p>
      <h1 className="font-display heading-page mt-4">This page did not load</h1>
      <p className="text-nybb-ink/75 mt-5 text-base leading-relaxed">
        That one is on us, not you. Try the page again, and if it keeps happening, the menu is the
        best place to start over.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button type="button" tone="light" onClick={() => unstable_retry()}>
          <RotateCcw aria-hidden className="size-4" />
          Try again
        </Button>
        <ButtonLink href="/menu" tone="light" variant="secondary">
          See the menu
        </ButtonLink>
      </div>

      {error.digest ? (
        <p className="text-nybb-ink/60 mt-8 font-mono text-xs">Reference {error.digest}</p>
      ) : null}
    </div>
  );
}
