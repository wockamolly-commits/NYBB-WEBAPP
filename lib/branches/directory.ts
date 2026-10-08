import type { Branch } from "@/lib/catalog/types";

/**
 * A branch as `get_branch_directory()` returns it: every branch in the
 * database, switched on or not, with the pin the workspace set.
 */
export type DirectoryBranch = {
  slug: string;
  name: string;
  shortName: string;
  format: Branch["format"];
  addressLine: string;
  city: string;
  phones: string[];
  /** Null when nobody has pinned it from the workspace. */
  pin: { lat: number; lng: number } | null;
};

/**
 * The list of counters every storefront page reads: the catalog, with each
 * branch's workspace details and pin laid over it, then every branch the
 * catalog does not know, in the database's order.
 *
 * Pure, so it can be tested without a database. The catalog stays the first
 * source because it carries the photographs and needs no database, and a
 * failed directory read (an empty `directory`) leaves the page exactly as it
 * was before branches could be added from the workspace.
 *
 * For a counter in both, the database wins on every published detail (name,
 * short name, format, address, city, phones), because those are editable in
 * the workspace (0083) and the catalog is not without a deploy. The two held
 * identical values for all nine counters when this was written, so the switch
 * changed nothing a customer could see. The catalog keeps what the database
 * does not carry, the photograph, and its pin stays the fallback for a
 * counter nobody has pinned from the workspace.
 */
export function withDirectory(catalog: Branch[], directory: DirectoryBranch[]): Branch[] {
  const bySlug = new Map(directory.map((row) => [row.slug, row]));
  const known = new Set(catalog.map((branch) => branch.slug));

  const fromCatalog = catalog.map((branch): Branch => {
    const row = bySlug.get(branch.slug);
    if (!row) return branch;
    const pin = row.pin ?? branch.pin;
    return {
      ...branch,
      name: row.name,
      shortName: row.shortName,
      format: row.format,
      addressLine: row.addressLine,
      city: row.city,
      phones: row.phones,
      ...(pin ? { pin } : {}),
    };
  });

  const added = directory
    .filter((row) => !known.has(row.slug))
    .map((row): Branch => ({
      slug: row.slug,
      name: row.name,
      shortName: row.shortName,
      addressLine: row.addressLine,
      city: row.city,
      phones: row.phones,
      format: row.format,
      ...(row.pin ? { pin: row.pin } : {}),
    }));

  return [...fromCatalog, ...added];
}
