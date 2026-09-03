import { z } from "zod";
import { MANAGEABLE_PERMISSIONS } from "./permission-catalog";

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
 * The single value a permission switch posts.
 *
 * The panel is one form holding a submit button per permission, because a
 * button's own name and value are what a submit sends: pressing one says which
 * permission and which way in a single field, with no hidden input per row and
 * no nested forms. The wire format is "refunds:manage|on".
 *
 * Parsed here rather than in the actions file for the reason AGENTS.md rule 6
 * gives: a "use server" file may only export async functions, so a schema left
 * inside one cannot be reached by a unit test, and this is the parse standing
 * between a hand made POST and a row in staff_permission_overrides.
 *
 * team:manage is refused even though it is a real StaffPermission. The panel
 * has no switch for it (see lib/staff/permission-catalog.ts), so a value
 * naming it did not come from the screen, and something that could only have
 * been hand made should not be honoured just because it parses. The database
 * refuses an unknown permission as well; this is the first of two answers.
 */
export const permissionTogglePayloadSchema = z
  .string()
  .transform((value) => value.split("|"))
  .pipe(
    z.tuple([z.enum(MANAGEABLE_PERMISSIONS), z.enum(["on", "off"])], {
      error: "That permission switch sent something unreadable.",
    }),
  )
  .transform(([permission, state]) => ({ permission, granted: state === "on" }));
