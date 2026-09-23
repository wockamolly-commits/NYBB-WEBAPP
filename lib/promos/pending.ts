/**
 * A promo code the customer asked for before there was anything to apply it to.
 *
 * Tapping Apply on `/promos` with an empty cart lands on a checkout that has
 * nothing to discount. The code used to live only in that screen's state, so
 * the trip to the menu to add something threw it away, and the customer was
 * told to come back and tap Apply again. This keeps it for the tab instead, so
 * the next visit to checkout picks it up without anybody retyping it.
 *
 * SESSION STORAGE, NOT A COOKIE, AND ONLY EVER A REQUEST. What is kept is a
 * code, never a discount. It seeds the same field the Apply button fills, and
 * the server checks it against the real cart exactly as if it had been typed.
 * A forged value is a code the customer could have typed anyway. It lasts as
 * long as the tab, because a code asked for yesterday is not a decision made
 * today.
 */

export const PENDING_PROMO_KEY = "nybb:pending-promo";

function session(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Private mode, or storage switched off. The code simply is not kept.
    return null;
  }
}

/** The code in the same shape `promoCodeParamSchema` produces, or null. */
function normalise(raw: string | null): string | null {
  if (raw === null) return null;
  const code = raw.trim().toUpperCase();
  if (code === "" || code.length > 40 || /\s/.test(code)) return null;
  return code;
}

export function readPendingPromo(storage?: Storage): string | null {
  const store = session(storage);
  if (!store) return null;
  try {
    return normalise(store.getItem(PENDING_PROMO_KEY));
  } catch {
    return null;
  }
}

/** Remembers the code, or forgets it when given null. */
export function rememberPendingPromo(code: string | null, storage?: Storage): void {
  const store = session(storage);
  if (!store) return;
  try {
    const clean = normalise(code);
    if (clean === null) store.removeItem(PENDING_PROMO_KEY);
    else store.setItem(PENDING_PROMO_KEY, clean);
  } catch {
    // Quota, or a store that throws from its own methods. Not worth failing a
    // checkout over.
  }
}
