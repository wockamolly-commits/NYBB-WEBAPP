/**
 * What the browser will say about the link it is on.
 *
 * Read by anything on the landing page that would otherwise spend several
 * hundred kilobytes on decoration: the hero slideshow's second still, and the
 * film that used to be in its place.
 *
 * Kept here rather than inside a component for the reason AGENTS.md rule 6
 * gives. The predicate is the part with the judgement in it and the part that
 * was wrong for months, so it is the part that gets a test.
 */

export type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

/**
 * Is this a link that should not be spending its bytes on decoration?
 *
 * Deliberately generous about what counts as slow, and deliberately silent when
 * the browser will not say. An unknown connection is treated as fine, because
 * the alternative is denying the picture to every Safari visitor on fibre.
 *
 * WHY THIS IS NOT JUST saveData.
 * ================================================================
 * It used to be, and the comment above it promised that on a slow Cebu
 * connection the still "may be all that loads". That promise was not kept by
 * that code. `saveData` is only true when the visitor has explicitly switched
 * Data Saver on: it is false by default on every Android, and unimplemented in
 * Safari, so in practice almost nobody was spared the download. `effectiveType`
 * and `downlink` are what actually describe the link, and they are cheap to
 * read, so they are read.
 */
export function isMetered(connection: NetworkInformation | undefined): boolean {
  if (!connection) return false;
  if (connection.saveData) return true;
  if (/(^|-)2g$/.test(connection.effectiveType ?? "")) return true;
  if (connection.effectiveType === "3g") return true;
  return typeof connection.downlink === "number" && connection.downlink < 1.5;
}

/** The connection, where the browser exposes one. */
export function currentConnection(): NetworkInformation | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}
