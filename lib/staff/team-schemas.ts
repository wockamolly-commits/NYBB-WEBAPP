import { z } from "zod";
import { MANAGEABLE_PERMISSIONS } from "./permission-catalog";
import type { StaffPermission } from "./roles";

/**
 * The value the branch select posts when the Super Admin means "every counter".
 *
 * A sentinel rather than an empty string, because empty is what a control that
 * was never touched also posts, and the two mean different things here. Picking
 * the roving option is a decision; submitting the form without choosing is a
 * mistake, and it has to fail rather than quietly resolve to something.
 */
export const ALL_BRANCHES = "all";

/**
 * The posted branch, as the profile column wants it: a uuid, or null for
 * business wide.
 *
 * The literal branch is first. Union members are tried in order, and while
 * z.uuid() would reject the sentinel anyway, the house rule from AGENTS.md is
 * to put the special case ahead of the greedy one so the ordering never has to
 * be re-derived by the next reader.
 */
export const branchAssignmentSchema = z.union(
  [z.literal(ALL_BRANCHES).transform(() => null), z.uuid()],
  { error: "Choose the branch this person works, or All branches." },
);

/**
 * One line of a permission save: which permission, and which way.
 *
 * The wire format is "refunds:manage|on". The panel posts one of these per
 * switch the Super Admin actually moved, as a hidden field named "change", so
 * a save carries the decisions and not the nine other switches that were left
 * alone. Reading them back with formData.getAll() is the plain HTML way to
 * send a list, and it keeps the parse to a shape a test can hold.
 *
 * team:manage is refused even though it is a real StaffPermission. The panel
 * has no switch for it (see lib/staff/permission-catalog.ts), so a value naming
 * it did not come from the screen, and something that could only have been hand
 * made should not be honoured just because it parses.
 */
const permissionChangeSchema = z
  .string()
  .transform((value) => value.split("|"))
  .pipe(
    z.tuple([z.enum(MANAGEABLE_PERMISSIONS), z.enum(["on", "off"])], {
      error: "A permission switch sent something unreadable.",
    }),
  );

/**
 * Everything one press of Save is asking for.
 *
 * Parsed here rather than in the actions file for the reason AGENTS.md rule 6
 * gives: a "use server" file may only export async functions, so a schema left
 * inside one cannot be reached by a unit test, and this is the parse standing
 * between a hand made POST and a row in staff_permission_overrides.
 *
 * The result is a map rather than a list, because that is what the database
 * function takes and because a map cannot hold the same permission twice. A
 * list can, so the duplicate is refused here rather than resolved by whichever
 * of the two happened to be written last.
 */
export const permissionChangeSetSchema = z
  .array(permissionChangeSchema)
  .min(1, { error: "There is nothing to save." })
  .refine(
    (entries) => new Set(entries.map(([permission]) => permission)).size === entries.length,
    { error: "That save named the same permission twice." },
  )
  .transform(
    (entries) =>
      Object.fromEntries(
        entries.map(([permission, state]) => [permission, state === "on"]),
      ) as Partial<Record<StaffPermission, boolean>>,
  );
