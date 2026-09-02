import { z } from "zod";

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
 * The "Available at" grid, as its one Save posts it.
 *
 * `sellHere` is the tick box: true means this counter sells the item, false
 * means it does not. The action turns each one into a hold write or a lift,
 * so this schema deliberately does not carry a hold `kind`. The item editor
 * only ever writes the indefinite kind, and a kind arriving from the browser
 * would be a way to set a timed hold from a screen that has no time field.
 *
 * `name` is carried only so a failure can say which counter did not save,
 * exactly as optionPriceRowSchema carries one. It is never written.
 */
export const branchAvailabilityRowSchema = z.object({
  branchId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  sellHere: z.boolean(),
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
