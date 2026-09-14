import "server-only";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";
import { storeHoursSchema, type StoreHoursRow } from "./hours";

/**
 * PostgREST's and Postgres' two ways of saying the function is not there. See
 * the note on the same set in `reader.ts` for why both are needed.
 */
const FUNCTION_MISSING = new Set(["PGRST202", "42883"]);

/**
 * Every live counter's weekly hours, or null when they could not be read.
 *
 * NULL IS NOT THE SAME ANSWER AS AN EMPTY LIST, AND THAT IS THE POINT.
 *
 * The first version of this returned `[]` when `get_store_hours` was missing,
 * and the page rendered `[]` as "Not published for this counter yet". So on a
 * database that predated migration 0071, the four counters whose owner had set
 * all seven days told customers nobody had set them. The data was there; the
 * read was not. An empty list means the database answered and had nothing to
 * say. Null means it was not asked successfully, and the page says that
 * instead of making a claim about the schedule.
 *
 * With no database configured there is nothing to be unavailable, so that is
 * still the empty list. A failure against a database that has the function is
 * an outage and still throws; the page catches it and treats it as null.
 */
export async function getStoreHours(): Promise<StoreHoursRow[] | null> {
  if (!supabaseConfigured()) return [];

  const { data, error } = await createPublicClient().rpc("get_store_hours");

  if (error) {
    if (FUNCTION_MISSING.has(error.code ?? "")) {
      // Loud in the server log, because on screen it only looks like a
      // counter with no hours, which is exactly how this went unnoticed.
      console.warn(
        "[hours] get_store_hours is not on this database. Apply migration 0071_public_store_hours.sql.",
      );
      return null;
    }
    throw new Error(`get_store_hours failed: ${error.message}`);
  }

  return storeHoursSchema.parse(data);
}
