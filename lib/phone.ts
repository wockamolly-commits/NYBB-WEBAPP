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
