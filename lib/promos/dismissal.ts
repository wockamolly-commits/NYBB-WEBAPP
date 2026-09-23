import type { Promo } from "./schema";
import { promoSentence } from "./schema";

/**
 * Remembering that somebody has already been shown a promo.
 *
 * A COOKIE RATHER THAN localStorage, AND THE REASON IS ALREADY WRITTEN DOWN
 * HERE. `lib/branches/selection.ts` makes the identical argument for the
 * chosen counter: a value only the browser can read means "every one of those
 * pages rendering the wrong thing and then correcting itself, which is a
 * visible flicker". The bar is worse than the counter in that respect, because
 * the thing that flickers is an advert the customer has already refused, and
 * it takes a row of layout with it when it goes.
 *
 * With a cookie the layout simply does not render a dismissed promo. No inline
 * script, no nonce plumbing, no CSS to hide something that was already sent, no
 * hydration mismatch to reason about. The cost is a few dozen bytes on each
 * storefront request.
 *
 * NOTHING TRUSTS THE COOKIE'S VALUE, the same discipline the branch cookie
 * states. It is a list of opaque keys, and a key that matches nothing simply
 * hides nothing. The worst a hand-edited cookie can do is hide a promo from
 * the person who edited it.
 */

export const PROMO_DISMISS_COOKIE = "nybb_promos_seen";

/** A year, like the branch cookie. Being shown an advert is a habit too. */
const PROMO_DISMISS_MAX_AGE = 60 * 60 * 24 * 365;

export const promoDismissCookieOptions = {
  path: "/",
  maxAge: PROMO_DISMISS_MAX_AGE,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const;

/**
 * How many dismissals to keep. Bounds the cookie, and the oldest ones are the
 * safest to forget: a promo dismissed long enough ago to fall off the end has
 * almost certainly expired, and if it has not, showing it once more is a much
 * smaller fault than an unbounded header.
 */
export const MAX_REMEMBERED_DISMISSALS = 24;

/**
 * A promo's identity for the purposes of "I have seen this".
 *
 * The code alone is not enough. An owner who edits a live promo's terms is
 * making a different offer, and a customer who dismissed the old wording has
 * not been shown the new one. So the key is a hash of the code together with
 * the sentence the bar would actually say, which makes the rule exactly "if
 * the message changes, it is a new message".
 *
 * Note what that does NOT do: it does not resurface a promo because an
 * unrelated column moved. `promoSentence` is built from the discount, the
 * scope and the minimum, so a change to the description or the expiry date
 * leaves the key alone. That is the right side to err on, because the failure
 * mode of resurfacing too eagerly is an advert somebody already said no to.
 */
export function promoDismissalKey(promo: Promo): string {
  // One opaque token rather than the code plus a hash. A code is owner-written
  // and the database only refuses whitespace and anything over 40 characters,
  // so "SAVE!20%" is a legal code and a terrible thing to put in a cookie
  // value unescaped. Hashing both halves together keeps every key to a short
  // [a-z0-9] string that needs no encoding and cannot break the list.
  return hash(`${promo.code}\n${promoSentence(promo)}`);
}

/**
 * FNV-1a, 32 bit, in base 36.
 *
 * Not a security primitive and not asked to be one: nothing is authenticated
 * by this value, and a collision hides a promo from one browser. It is here
 * because it is four lines, needs no imports, and runs identically on the
 * server and in the browser, which matters because the key is computed where
 * the bar is rendered and again where it is dismissed.
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
 * Reads the cookie. Anything unexpected is treated as "nothing dismissed",
 * because the honest failure for an unreadable list is to show the promo, not
 * to hide it or to throw on a page render.
 */
export function parseDismissed(raw: string | undefined | null): string[] {
  if (typeof raw !== "string" || raw === "") return [];
  return raw
    .split(".")
    .map((part) => part.trim())
    // A key is base 36 of a 32 bit number, so seven characters is the ceiling.
    // Anything else was not written by serializeDismissed and is dropped.
    .filter((part) => /^[a-z0-9]{1,7}$/.test(part))
    .slice(0, MAX_REMEMBERED_DISMISSALS);
}

/** Writes the cookie, newest first, bounded. */
export function serializeDismissed(keys: readonly string[]): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(key);
    if (kept.length === MAX_REMEMBERED_DISMISSALS) break;
  }
  return kept.join(".");
}

/** Whether this promo has already been dismissed by this browser. */
export function isDismissed(promo: Promo, dismissed: readonly string[]): boolean {
  return dismissed.includes(promoDismissalKey(promo));
}
