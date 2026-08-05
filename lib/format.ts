/**
 * Money is always minor units (centavos) as an integer, never a float.
 * 12000 is PHP 120.00. Nothing in this codebase multiplies or divides a peso
 * value; every arithmetic step stays in centavos and only formatting converts.
 */

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "PHP 329.00". The full form, for totals and anywhere money must be unambiguous. */
export function formatPeso(cents: number): string {
  return peso.format(cents / 100);
}

/**
 * "329" or "12.50". The bare number, for price chips on menu tiles where the
 * currency is already established by the surrounding label and the digits are
 * doing typographic work.
 */
export function formatPesoCompact(cents: number): string {
  const value = cents / 100;
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2);
}

/** "329 to 529", for an item whose price depends on which size is chosen. */
export function formatPesoRange(fromCents: number, toCents: number): string {
  return fromCents === toCents
    ? formatPesoCompact(fromCents)
    : `${formatPesoCompact(fromCents)}-${formatPesoCompact(toCents)}`;
}
