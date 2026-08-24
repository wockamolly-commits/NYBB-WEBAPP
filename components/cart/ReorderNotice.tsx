"use client";

import { useEffect, useState } from "react";
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
 */
export function ReorderNotice() {
  const [report, setReport] = useState<ReorderReport | null>(null);

  useEffect(() => {
    // A browser store being pulled into React on mount, which cannot be
    // derived from props and must not run during render.
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

  return (
    <section role="status" aria-label="Reorder result">
      {report ? (
        <div className="border-nybb-ink/30 bg-nybb-ink/5 mb-6 rounded-md border p-4 sm:p-5">
          <p className="text-sm leading-relaxed font-medium">{restoredLabel}</p>
          {report.skipped.length > 0 ? (
            <>
              <p className="text-nybb-ink/75 mt-2 text-sm leading-relaxed">
                The menu has changed since, so these could not come back:
              </p>
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
