/**
 * The Broadcast topic migration 0072 signals when opening hours or a branch
 * change. Kept beside the reader rather than inline in the listener, so the SQL
 * and the subscriber have one place to agree on the names.
 */
export const STORE_HOURS_TOPIC = "store-hours";
export const STORE_HOURS_EVENT = "changed";
