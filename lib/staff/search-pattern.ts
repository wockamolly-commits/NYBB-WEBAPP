/**
 * Turn a typed search box into a PostgREST `ilike` pattern that is safe to
 * interpolate into an `or=(...)` filter.
 *
 * Two separate problems, and only one of them is escaping.
 *
 * The grammar one: `or=(a.ilike.*x*,b.ilike.*x*)` is parsed on commas, dots
 * and parentheses, so a customer name with a comma in it would not merely fail
 * to match, it would change which columns are being filtered. Every character
 * outside a small safe set is therefore replaced with the wildcard rather than
 * dropped, so "a,b" becomes "a*b" and still matches the text it came from.
 * Widening the pattern is safe because the caller narrows again in memory with
 * an exact substring match; a dropped character would not be, because it would
 * silently match the wrong rows.
 *
 * The reach one, which is why this exists at all: these queries are capped at
 * a page of rows. Filtering in memory after the cap means the cap is applied to
 * the newest rows and the search then looks inside them, so an order older than
 * the page is unfindable by its own code and the empty state tells the reader
 * to widen a date range that would make it worse. Filtering in the database
 * makes the cap apply to matches.
 */

const SAFE_CHARACTERS = /[^\w@.-]/g;

/**
 * A wildcarded pattern, or null when there is nothing worth filtering on.
 * Null means "do not add a database filter", never "match nothing".
 */
export function ilikePattern(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const escaped = trimmed.replace(SAFE_CHARACTERS, "*");
  if (!/[\w@.-]/.test(escaped)) return null;
  return `*${escaped}*`;
}

/** `column.ilike.<pattern>` terms joined for a PostgREST `or` filter. */
export function ilikeOrFilter(
  columns: readonly string[],
  pattern: string,
): string {
  return columns.map((column) => `${column}.ilike.${pattern}`).join(",");
}
