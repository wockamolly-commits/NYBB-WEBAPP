"use client";

import { useEffect, useRef, useState } from "react";
import {
  describeSkip,
  takeReorderReport,
  type ReorderReport,
} from "@/lib/cart/reorder-report";

/**
 * What happened to the order that was just brought back.
 *
 * Read once from sessionStorage and cleared, so it explains this arrival and
 * not a cart the customer has since edited. Says nothing at all when the
 * customer got here any other way, which is most of the time.
 *
 * The `<section role="status">` itself is rendered on every visit, with no
 * styling and no text, so it exists in the accessibility tree before the
 * effect ever runs. A live region inserted after its content already exists
 * announces nothing: screen readers only pick up changes to a region that was
 * already present at first paint. All of the visible styling and every word
 * of text live inside the conditional, so an absent report draws an empty,
 * weightless container rather than a box with nothing in it.
 *
 * This is the one rule this codebase has about live regions; nothing else in
 * the tree may key or remount one to force an announcement. See
 * components/menu/QuickAddButton.tsx and components/menu/ItemConfigurator.tsx
 * for the same region kept mounted through a repeated identical add instead.
 */
export function ReorderNotice() {
  const [report, setReport] = useState<ReorderReport | null>(null);
  // App Router Strict Mode double-invokes a mount effect (setup, cleanup,
  // setup) in development. takeReorderReport is destructive, so the second
  // setup would read null and overwrite the report the first setup found,
  // leaving the notice permanently blank in npm run dev. The ref survives
  // that synthetic double-invoke because Strict Mode reuses the same
  // component instance; a genuinely new mount gets a fresh ref and reads
  // sessionStorage again, which is still correct.
  const hasRead = useRef(false);

  useEffect(() => {
    if (hasRead.current) return;
    hasRead.current = true;
    // A browser store being pulled into React on mount, which cannot be
    // derived from props and must not run during render. Wrapped in a local
    // function and invoked, rather than calling setReport directly, solely
    // to satisfy the react-hooks/set-state-in-effect lint rule: it rejects a
    // bare setState in an effect body regardless of where the value comes
    // from, and this is this codebase's existing answer to that (see
    // HeroVideo.tsx and StaffPushOptIn.tsx).
    const read = () => setReport(takeReorderReport());
    read();
  }, []);

  const restoredLabel = report
    ? report.restored === 0
      ? "Nothing from that order could be brought back."
      : report.restored === 1
        ? "One line from that order is back in your cart."
        : `${report.restored} lines from that order are back in your cart.`
    : null;

  // The cart-full skip is not a menu change: it fires when the cart was
  // already full, and its own sentence says so. The lead-in below claims the
  // menu changed, so it only renders when some other skip actually backs
  // that claim up.
  const menuChanged = report?.skipped.some((skipped) => skipped.reason !== "cart-full") ?? false;

  return (
    <section role="status" aria-label="Reorder result">
      {report ? (
        <div className="border-nybb-ink/30 bg-nybb-ink/5 mt-8 mb-6 rounded-md border p-4 sm:p-5">
          <p className="text-sm leading-relaxed font-medium">{restoredLabel}</p>
          {report.skipped.length > 0 ? (
            <>
              {menuChanged ? (
                <p className="text-nybb-ink/75 mt-2 text-sm leading-relaxed">
                  The menu has changed since, so these could not come back:
                </p>
              ) : null}
              <ul className="text-nybb-ink/75 mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {report.skipped.map((skipped, index) => (
                  <li key={`${skipped.name}-${skipped.variationLabel}-${index}`}>
                    {describeSkip(skipped)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
