/**
 * Promo codes this browser has already spent.
 *
 * THIS REPLACED A DISMISSAL COOKIE, AND THE SWAP IS THE WHOLE POINT. Closing
 * the bar used to be remembered for a year. It is now remembered for exactly
 * as long as the page the customer is looking at: a refresh or a step to
 * another page brings the promo back, because a promo running today is worth
 * saying again, and somebody who closed it once has not asked never to hear
 * about the offer.
 *
 * What DOES deserve to be permanent is having taken it. A promo already spent
 * is not an offer any more, and advertising it is worse than noise: the
 * customer taps Apply and checkout refuses them over a cap they had no way to
 * see. So the only thing kept between visits is the list below.
 *
 * IT ONLY EVER HIDES, which is the whole trust model and the reason a cookie is
 * safe here. `lib/branches/selection.ts` says the same of the branch cookie:
 * nothing trusts its value. A forged entry hides a promo from the person who
 * forged it, and an absent one shows a promo that checkout will refuse, which
 * is the state the storefront was in before this existed.
 *
 * The database does the same job better for a signed-in customer.
 * `list_customer_promos` (0076) counts their redemptions and drops anything
 * they have no uses left on, which works across devices and, because 0065
 * deletes the redemption row when an order is cancelled, gives the promo back
 * when an order falls over. This cookie is for the guests that server-side
 * check cannot see, and it is deliberately the cruder of the two.
 */

export const PROMO_USED_COOKIE = "nybb_promos_used";

/** A year. Long enough to outlast any promo worth running. */
const PROMO_USED_MAX_AGE = 60 * 60 * 24 * 365;

export const promoUsedCookieOptions = {
  path: "/",
  maxAge: PROMO_USED_MAX_AGE,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const;

/**
 * How many spent codes to keep. Bounds the cookie, and forgetting the oldest
 * is the safe direction: the worst a dropped entry does is advertise a promo
 * the customer has already had, which is where this feature started.
 */
export const MAX_REMEMBERED_USED = 24;

/**
 * A code's entry in the list.
 *
 * Hashed rather than stored plainly, because a promo code is owner-written and
 * the database refuses only whitespace and anything over 40 characters. That
 * makes "SAVE!20%" a legal code and a poor thing to put in a cookie value
 * unescaped. The hash is short, always `[a-z0-9]`, and needs no encoding.
 *
 * Keyed on the code ALONE, unlike the dismissal key it replaces. A redemption
 * happens against the voucher row, so editing the wording of a code somebody
 * has already spent does not hand them a new use of it.
 */
export function promoUsedKey(code: string): string {
  return hash(code.trim().toUpperCase());
}

/**
 * FNV-1a, 32 bit, in base 36.
 *
 * Not a security primitive and not asked to be one: nothing is authenticated
 * by this value, and a collision hides one promo from one browser. It is here
 * because it is four lines, needs no imports, and runs identically on the
 * server and in the browser.
 */
function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    // The FNV prime, as shifts, because a plain multiply overflows into a
    // float and stops being the same function.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

/**
 * Reads the cookie. Anything unexpected is treated as "nothing spent", because
 * the honest failure for an unreadable list is to show the promo rather than
 * to hide it or to throw during a page render.
 */
export function parseUsed(raw: string | undefined | null): string[] {
  if (typeof raw !== "string" || raw === "") return [];
  return raw
    .split(".")
    .map((part) => part.trim())
    // A key is base 36 of a 32 bit number, so seven characters is the ceiling.
    .filter((part) => /^[a-z0-9]{1,7}$/.test(part))
    .slice(0, MAX_REMEMBERED_USED);
}

/** Writes the cookie, newest first, bounded, without repeats. */
export function serializeUsed(keys: readonly string[]): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(key);
    if (kept.length === MAX_REMEMBERED_USED) break;
  }
  return kept.join(".");
}

/** Whether this browser has already spent this code. */
export function hasUsed(code: string, used: readonly string[]): boolean {
  return used.includes(promoUsedKey(code));
}

/** Drops promos this browser has already spent. */
export function withoutUsed<T extends { code: string }>(
  promos: readonly T[],
  used: readonly string[],
): T[] {
  return promos.filter((promo) => !hasUsed(promo.code, used));
}
