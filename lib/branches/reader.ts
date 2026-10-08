import "server-only";
import { cache } from "react";
import { z } from "zod";
import { branches as catalogBranches } from "@/lib/catalog/branches";
import { getPickupSlots } from "@/lib/slots/reader";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";
import { withDirectory, type DirectoryBranch } from "./directory";
import { mergeStores } from "./merge";
import type { OrderableBranch, Store } from "./types";

/**
 * The one place the storefront learns which counters can take an order.
 *
 * Shaped like `lib/slots/reader.ts` rather than like `lib/menu/`, and for the
 * same reason: there is no honest static answer to "is this shop open". A
 * hardcoded list of orderable branches is a promise about a kitchen nobody
 * asked. So with no database configured this returns nothing orderable, every
 * store card says so, and the picker is correct rather than optimistic.
 */

const orderableBranchSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  format: z.enum(["street", "mall", "food-hall", "petrol", "hospital", "casino"]),
  addressLine: z.string().min(1),
  city: z.string().min(1),
  phones: z.array(z.string()),
  timezone: z.string().min(1),
  slotMinutes: z.number().int().positive(),
  prepMinutes: z.number().int().positive(),
  acceptsOrdersNow: z.boolean(),
  isOpenNow: z.boolean(),
});

const orderableBranchesSchema = z.array(orderableBranchSchema);

// lat and lng are numeric columns, which PostgREST returns as numbers here
// but may return as strings for wide values. Null is "no pin", and is
// branched on rather than coerced: a coerced null is a pin at 0, 0, in the
// Gulf of Guinea (AGENTS.md, rule 6).
const coordinate = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]);
const directoryRowSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  short_name: z.string().min(1),
  format: z.enum(["street", "mall", "food-hall", "petrol", "hospital", "casino"]),
  address_line: z.string(),
  city: z.string(),
  phones: z.array(z.string()),
  lat: coordinate.nullable(),
  lng: coordinate.nullable(),
});

/**
 * The two ways a database that predates migration 0049 says so.
 *
 * BOTH ARE NEEDED, AND ONLY ONE OF THEM IS OBVIOUS. `42883` is Postgres' own
 * "function does not exist", which is what a direct connection returns. It is
 * not what this code path sees: the storefront reaches Postgres through
 * PostgREST, which resolves RPC names against a cached schema and answers
 * `PGRST202` with "Could not find the function ... in the schema cache" before
 * the statement is ever sent. Guarding on the Postgres code alone left the
 * fallback dead and every storefront page returning a 500, which is how this
 * comment came to be written.
 */
const FUNCTION_MISSING = new Set(["PGRST202", "42883"]);

/**
 * The branches this platform is live on.
 *
 * THE FALLBACK, AND WHY IT IS NOT THE MENU READER'S MISTAKE.
 *
 * `get_orderable_branches` arrives in migration 0049, and migrations here are
 * applied by hand rather than by the deploy. So a deployment can legitimately
 * be running this code against a database that predates the function, and the
 * failure mode without a fallback is a storefront that cannot name the shop it
 * has been taking orders for all week.
 *
 * What it falls back to is not an invention: `get_pickup_slots(null)` resolves
 * the same branch this code path has silently been ordering from since launch,
 * from the same table, through a function that has always existed. The
 * fallback therefore reproduces today's behaviour exactly, one store and no
 * choice, and retires itself the moment 0049 is applied.
 *
 * It is narrow on purpose. It triggers on the function being absent, which is
 * a specific and detectable state. A query that fails against a database that
 * really has the function is an outage, and that still throws.
 */
export async function getOrderableBranches(): Promise<OrderableBranch[]> {
  if (!supabaseConfigured()) return [];

  const supabase = createPublicClient();
  // `p_at` is deliberately not passed, exactly as in the slot reader: the
  // clock that decides whether a shop is open has to be the database's, and a
  // clock sent from a browser is a clock an attacker chooses.
  const { data, error } = await supabase.rpc("get_orderable_branches");

  if (error) {
    if (FUNCTION_MISSING.has(error.code ?? "")) return await singleBranchFallback();
    throw new Error(`get_orderable_branches failed: ${error.message}`);
  }

  return orderableBranchesSchema.parse(data);
}

/**
 * Today's behaviour, stated as a list of one.
 *
 * The slot reader already knows the resolved branch and its timezone, slot
 * length and prep time. What it does not report is the accepting-orders
 * switch, so that is inferred from the reason it gave: anything other than
 * `not_accepting` means the branch is live and taking orders, and
 * `closed_now` means shut at this minute but still worth choosing.
 */
async function singleBranchFallback(): Promise<OrderableBranch[]> {
  const slots = await getPickupSlots();
  if (!slots.branch) return [];

  const catalog = catalogBranches.find((branch) => branch.slug === slots.branch!.slug);

  return [
    {
      slug: slots.branch.slug,
      name: slots.branch.name,
      shortName: slots.branch.shortName,
      format: catalog?.format ?? "street",
      addressLine: catalog?.addressLine ?? "",
      city: catalog?.city ?? "",
      phones: catalog?.phones ?? [],
      timezone: slots.branch.timezone,
      slotMinutes: slots.branch.slotMinutes,
      prepMinutes: slots.branch.prepMinutes,
      acceptsOrdersNow: slots.unavailableReason !== "not_accepting",
      isOpenNow: slots.unavailableReason !== "closed_now",
    },
  ];
}

/**
 * Every branch in the database, for the Branches page and the store picker.
 *
 * Falls back to an empty list, never a throw, when the read fails or the
 * function predates migration 0082: `withDirectory` then returns the catalog
 * unchanged, which is the page as it was before workspace branches existed.
 * Cached per request, because the layout, the picker and the page all ask.
 */
export const getBranchDirectory = cache(async (): Promise<DirectoryBranch[]> => {
  if (!supabaseConfigured()) return [];

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_branch_directory");
  if (error) {
    if (!FUNCTION_MISSING.has(error.code ?? "")) {
      console.error("[branches] directory read failed:", error.message);
    }
    return [];
  }

  const parsed = z.array(directoryRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    console.error("[branches] directory rows unreadable");
    return [];
  }
  return parsed.data.map((row) => ({
    slug: row.slug,
    name: row.name,
    shortName: row.short_name,
    format: row.format,
    addressLine: row.address_line,
    city: row.city,
    phones: row.phones,
    pin: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
  }));
});

/** The catalog with workspace pins and workspace-added branches. */
export async function listBranches() {
  return withDirectory(catalogBranches, await getBranchDirectory());
}

/**
 * Every counter, ordered the way a customer should read them.
 *
 * The merge itself is pure and lives in `merge.ts`, so the classification that
 * decides whether a store card is selectable can be tested without Postgres.
 * What is left here is the read.
 */
export async function listStores(): Promise<Store[]> {
  const [branches, orderable] = await Promise.all([listBranches(), getOrderableBranches()]);
  return mergeStores(branches, orderable);
}
