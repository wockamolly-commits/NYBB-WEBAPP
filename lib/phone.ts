/**
 * Philippine numbers, as published, turned into something a phone can dial.
 *
 * The branch list carries both mobile ("0906-440-5297") and landline
 * ("(032) 318-2405") formats. Both are national, both start with the trunk
 * zero, so both convert the same way: strip everything that is not a digit and
 * replace the leading zero with the country code.
 */
export function telHref(published: string): string {
  const digits = published.replace(/\D/g, "");
  const national = digits.startsWith("0") ? digits.slice(1) : digits;
  return `tel:+63${national}`;
}

/**
 * A number typed at checkout, in the one form the platform stores it.
 *
 * The same Philippine mobile can be typed four ways ("0917 123 4567",
 * "+63 917 123 4567", "917 123 4567", "0063 917 123 4567"), and the voucher
 * engine recognises a customer by their number. While those four were stored
 * as typed, they were four customers: a once-per-customer promo code could be
 * used again just by writing the number differently, and a code restricted to
 * "0918..." refused the same person typing "+63 918...". So every mobile
 * becomes `+639XXXXXXXXX` here, and normalize_phone_digits() reduces it to the
 * same digits on the database side (migration 0090).
 *
 * Also accepted, because the kitchen can still call them: a Philippine
 * landline with its area code ("(032) 318-2405", kept as typed), and a foreign
 * number written with its country code ("+1 415 555 0100"). Anything else is
 * refused with null, rather than stored and found to be uncallable later.
 */
export function normalizeCustomerPhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");

  const mobile =
    /^00639\d{9}$/.test(digits) ? digits.slice(2)
    : /^639\d{9}$/.test(digits) ? digits
    : /^09\d{9}$/.test(digits) ? `63${digits.slice(1)}`
    : /^9\d{9}$/.test(digits) ? `63${digits}`
    : null;
  if (mobile) return `+${mobile}`;

  // A landline: the trunk zero, a one or two digit area code, and a seven or
  // eight digit subscriber number. Mobiles were caught above, so a leading 09
  // that reaches here is a mobile with a digit missing or extra, not a landline.
  if (/^0[1-8]\d{7,9}$/.test(digits)) return trimmed;

  // A foreign number, which only counts when its country code is written out.
  // +63 that failed the mobile shapes above is a mistyped local number.
  if (trimmed.startsWith("+") && !digits.startsWith("63") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}
