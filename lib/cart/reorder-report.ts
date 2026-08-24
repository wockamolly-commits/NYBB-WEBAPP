import type { SkipReason, SkippedLine } from "./reorder";

/**
 * What the cart screen says about the reorder that just filled it.
 *
 * Read once and cleared, because it explains one arrival. A report that
 * survived a refresh would be describing a cart the customer has since edited,
 * which is worse than saying nothing.
 */

export const REORDER_REPORT_KEY = "nybb.reorder-report";

export type ReorderReport = {
  restored: number;
  skipped: SkippedLine[];
};

const KNOWN_SKIP_REASONS: readonly SkipReason[] = ["item", "variation", "option", "cart-full"];

function isSkippedLine(value: unknown): value is SkippedLine {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.variationLabel === "string" &&
    typeof candidate.reason === "string" &&
    (KNOWN_SKIP_REASONS as readonly string[]).includes(candidate.reason)
  );
}

function session(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Safari in private mode, and any browser with storage disabled. The
    // reorder still worked; only its explanation is lost.
    return null;
  }
}

export function stashReorderReport(report: ReorderReport, storage?: Storage): void {
  const store = session(storage);
  if (!store) return;
  try {
    store.setItem(REORDER_REPORT_KEY, JSON.stringify(report));
  } catch {
    // Quota, or a disabled store. Not worth failing a reorder over.
  }
}

export function takeReorderReport(storage?: Storage): ReorderReport | null {
  const store = session(storage);
  if (!store) return null;

  const raw = store.getItem(REORDER_REPORT_KEY);
  if (raw === null) return null;
  store.removeItem(REORDER_REPORT_KEY);

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as ReorderReport).restored !== "number" ||
      !Array.isArray((parsed as ReorderReport).skipped)
    ) {
      return null;
    }
    // Same-session sessionStorage written by the same build that reads it,
    // so a malformed entry is not expected. Validated anyway: an entry with
    // an unrecognised reason would otherwise reach describeSkip, match no
    // case, and render an empty bullet on the cart screen. Dropped rather
    // than rejecting the whole report, since the rest of it is still true.
    const skipped = (parsed as ReorderReport).skipped.filter(isSkippedLine);
    return { restored: (parsed as ReorderReport).restored, skipped };
  } catch {
    return null;
  }
}

/** One skipped line, in words rather than in a reason code. */
export function describeSkip(skipped: SkippedLine): string {
  switch (skipped.reason) {
    case "item":
      return `${skipped.name} is not on the menu any more.`;
    case "variation":
      return `${skipped.name} is no longer sold in ${skipped.variationLabel}.`;
    case "option":
      return `${skipped.name} cannot be rebuilt because one of its choices has changed.`;
    case "cart-full":
      // Deliberately names no item: rebuildCartLines never produces this
      // case (see SkipReason in lib/cart/reorder), only the client does,
      // after addToCart refuses a line because the cart is at MAX_LINES.
      // That refusal happens on a CartLine, which carries only slugs and
      // has no display name to put in a sentence, so this entry's empty
      // name and variationLabel are expected, not a bug to fix.
      return "Your cart was already full, so nothing more could be added to it.";
  }
}
