import { z } from "zod";

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
