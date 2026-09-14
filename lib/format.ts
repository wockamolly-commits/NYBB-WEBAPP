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

/** "₱329.00". The full form, for totals and anywhere money must be unambiguous. */
export function formatPeso(cents: number): string {
  return peso.format(cents / 100);
}

/**
 * "₱329" or "₱12.50". The short form, for menu prices, size chips and heat
 * upcharges, where the centavos are always zero and would only be noise.
 *
 * This used to return the bare number on the theory that the surrounding
 * label established the currency. Nothing on a menu tile does, so a tile read
 * "349" beside the cart's "₱349.00", and the same price looked like two kinds
 * of number depending on the screen. Every menu price now carries the sign,
 * the same one formatPeso prints, so it cannot drift from the totals.
 */
export function formatPesoCompact(cents: number): string {
  const value = cents / 100;
  // Grouped like the full form, so a bundle reads "₱1,299" on its tile and
  // "₱1,299.00" in the cart, rather than as two different-looking numbers.
  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "₱329-₱529", for an item whose price depends on which size is chosen. */
export function formatPesoRange(fromCents: number, toCents: number): string {
  return fromCents === toCents
    ? formatPesoCompact(fromCents)
    : `${formatPesoCompact(fromCents)}-${formatPesoCompact(toCents)}`;
}
