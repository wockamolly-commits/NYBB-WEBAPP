import { z } from "zod";
import { HOLD_REASONS } from "@/lib/staff/menu-types";

/**
 * z.enum needs a non-empty tuple, and HOLD_REASONS is a readonly array. This
 * is the one place the two shapes meet, so the assertion is here rather than
 * at every use.
 */
const HOLD_REASONS_TUPLE = HOLD_REASONS as unknown as [string, ...string[]];

/**
 * Menu write schemas that are worth testing on their own.
 *
 * The menu Server Actions live in a `"use server"` file, which may only export
 * async functions, so nothing declared beside them can be imported by a test.
 * That is not a filing detail: it is why the bug documented below survived
 * lint, types, 903 unit tests and a production build, and was found by reading
 * an audit row weeks later. A parse that silently returns the wrong value is
 * exactly the kind of thing a unit test catches in a millisecond and no amount
 * of clicking catches at all.
 *
 * Only the option schema has moved so far, because it is the one that was
 * wrong. The others in app/(workspace)/workspace/menu/actions.ts belong here
 * too and can follow.
 */

/**
 * One option row, as the form posts it.
 *
 * pricing is the three way choice, not a number.
 *
 * "bySize" sends null, which means this option is priced through
 * menu_option_variation_prices on each item that links the group. It does not
 * mean free, and turning it into 0 here would silently make every heat level
 * free on every wing size.
 */
export const optionSchema = z
  .object({
    id: z.union([z.uuid(), z.literal("")]).default(""),
    groupId: z.uuid(),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(300).default(""),
    pricing: z.enum(["free", "flat", "bySize"]),
    priceCents: z.coerce.number().int().min(0).max(10_000_000).default(0),
    /**
     * THE EMPTY BRANCH COMES FIRST, AND THAT ORDER IS THE WHOLE FIX.
     *
     * A union tries its members in order and takes the first that parses.
     * This was written the other way round:
     *
     *   z.union([z.literal(""), z.coerce.number().int().min(0).max(100)])
     *
     * and `z.coerce.number()` accepts the empty string, because `Number("")`
     * is `0`, which then passes int, min and max. So the empty string parsed
     * as the number zero and `z.literal("")` was unreachable. The transform
     * below could never see `""`, so `resolvedHeatPercent` could never be
     * null, and every save of an option with no heat wrote `heat_percent = 0`
     * rather than leaving it unset.
     *
     * That is not a cosmetic difference. Null means "this option has no heat
     * level"; 0 means "this option has a heat level, and it is 0%". The
     * options screen seeds its heat column from
     * `options.some((o) => o.heatPercent !== null)`, so one flavour saved this
     * way opened a Heat % column across its whole group and kept it open.
     * It was found in the audit log: a save that only toggled Sweet Spicy's
     * Offered box also moved its heat_percent from null to 0.
     *
     * Coercion is greedy. When a union mixes a coercing branch with a literal
     * the literal goes first, always.
     */
    heatPercent: z.union([z.literal(""), z.coerce.number().int().min(0).max(100)]).default(""),
    isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
  })
  .transform((value) => ({
    ...value,
    resolvedPriceCents:
      value.pricing === "bySize" ? null : value.pricing === "free" ? 0 : value.priceCents,
    resolvedHeatPercent: value.heatPercent === "" ? null : value.heatPercent,
  }));

/**
 * The sold out control, as its one Save posts it.
 *
 * `sellHere` is the tick box: true means this counter sells the item, false
 * means it does not. `until` is the optional "back on" time beside an
 * unticked box, as a Manila wall clock string the way the datetime input
 * writes it, or empty for "until someone puts it back".
 *
 * THE HOLD KIND IS NOT CARRIED, AND THAT IS ON PURPOSE. The three kinds
 * differ only in whether there is an end and what the screen called it when
 * it was set (see 0051), so the pair above determines the kind completely and
 * the action derives it. A kind posted from the browser would let a caller
 * claim an end it did not send, or send an end while claiming to be
 * indefinite, which is a hold whose stored kind disagrees with its own
 * timestamp.
 *
 * EMPTY IS NOT ZERO, AND HERE EMPTY IS NOT A DATE (AGENTS.md rule 6). `until`
 * stays a string and is never coerced. An empty one means "no end", which is
 * a different hold from one ending at the epoch.
 *
 * `name` is carried only so a failure can say which counter did not save,
 * exactly as optionPriceRowSchema carries one. It is never written.
 */
export const branchAvailabilityRowSchema = z
  .object({
    branchId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    sellHere: z.boolean(),
    until: z.string().trim().max(40).default(""),
    /**
     * Why this counter stopped selling it. Empty is the unchosen state of the
     * select, and it is only legal on a row that is going back on sale, where
     * there is no hold for a reason to belong to.
     *
     * z.enum over the shared list rather than a second copy of the four
     * strings: a fifth reason added to HOLD_REASONS is then accepted here
     * without anyone remembering to widen a union that lives somewhere else.
     */
    reason: z.union([z.literal(""), z.enum(HOLD_REASONS_TUPLE)]).default(""),
  })
  .refine((row) => row.sellHere || row.reason !== "", {
    path: ["reason"],
    message: "A counter being taken off sale needs a reason.",
  });

export const branchAvailabilityGridSchema = z.object({
  itemId: z.uuid(),
  /**
   * Only the counters whose state actually changed. The grid works that out
   * rather than posting all nine, so an untouched counter is never rewritten,
   * never audited and never able to fail. Empty is normal: it means somebody
   * pressed Save without changing anything.
   *
   * Capped at the number of branches that could plausibly exist. A payload
   * longer than that is not a person ticking boxes.
   */
  branches: z.array(branchAvailabilityRowSchema).max(50),
});
