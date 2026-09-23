import { z } from "zod";
import { formatPeso } from "@/lib/format";
import { joinNames, voucherSummary } from "@/lib/vouchers/status";

/**
 * A promo as the storefront reads it, parsed rather than trusted.
 *
 * THIS FILE IS WHERE AGENTS.md RULE 6 BITES ON THE CUSTOMER SIDE. Four of the
 * columns `list_customer_promos` returns are nullable and not one of the nulls
 * means zero:
 *
 *   amountCents       null = this is a percentage promo, not a PHP 0.00 one
 *   percentOff        null = this is a fixed-amount promo
 *   maxDiscountCents  null = the percentage is uncapped, not capped at nothing
 *   expiresAt         null = it never ends, not that it ended at the epoch
 *
 * Every one of them is parsed nullable and branched on. The two unions put the
 * null member FIRST, because `z.coerce` is greedy and would swallow the empty
 * branch if it were tried first, which is exactly how `heat_percent` shipped
 * "0% heat" on nine flavours that have none.
 *
 * It lives in `lib/` rather than beside a Server Action because a `"use
 * server"` file may only export async functions, so a schema in one cannot be
 * unit tested, and that invisibility is the real cause of the bug above.
 */

export const promoRowSchema = z.object({
  code: z.string().min(1),
  description: z.string().nullable(),
  // The null branch first, then the coercion. PostgREST hands a bigint back as
  // a string, and jsonb hands it back as a number, so the coercion covers both
  // without either being allowed to invent a value for a null.
  amountCents: z.union([z.null(), z.coerce.number().int()]),
  percentOff: z.number().int().nullable(),
  maxDiscountCents: z.union([z.null(), z.coerce.number().int()]),
  // not null default 0 in the schema, so coercion is safe here and only here:
  // a stray 0 is the column's own honest value rather than an invented one.
  minOrderCents: z.coerce.number().int(),
  expiresAt: z.string().nullable(),
  personal: z.boolean(),
  itemNames: z.array(z.string()),
  categoryNames: z.array(z.string()),
  branchNames: z.array(z.string()),
});

export type Promo = z.infer<typeof promoRowSchema>;

export const promoListSchema = z.array(promoRowSchema);

/**
 * The promo as one sentence.
 *
 * `voucherSummary` already writes this sentence for the workspace, and it
 * already handles every null correctly, so reusing it means the owner and the
 * customer read the same description of the same promo. A second sentence
 * written here would be a second voice that drifts the first time somebody
 * edited one of them, which is the argument `customerPayload` makes for
 * `statusCopy` and the one this codebase makes about money everywhere.
 *
 * `customerCount` is passed 0 rather than a real figure, and that is not a
 * shortcut. A public promo has no named customers by construction, and a
 * personal one is being shown to the person it belongs to, who does not need
 * to be told it is "for one named customer". The count is also a fact about
 * other people, which is the kind of thing `list_customer_promos` refuses to
 * return at all.
 */
export function promoSentence(promo: Promo): string {
  return voucherSummary({
    amountCents: promo.amountCents,
    percentOff: promo.percentOff,
    maxDiscountCents: promo.maxDiscountCents,
    minOrderCents: promo.minOrderCents,
    branchNames: promo.branchNames,
    itemNames: promo.itemNames,
    categoryNames: promo.categoryNames,
    customerCount: 0,
  });
}

/**
 * The promo as a headline and one supporting line, for the places too small
 * for the full sentence: the band under the header, the floating reminder and
 * the suggestions at checkout.
 *
 * The counter list is left out on purpose. The storefront asks
 * `list_customer_promos` for the counter the customer has chosen, so every
 * promo that reaches these surfaces already works where they are collecting,
 * and reciting four branch names in a strip is what made the old bar truncate
 * in the middle of a name. `/promos` still says the whole thing.
 *
 * Null branches exactly as `voucherSummary` does, because rule 6 applies here
 * too: a null amount is a percentage promo, never PHP 0.00 off. A row with
 * neither is refused by the database, and says nothing rather than inventing a
 * value if one ever arrived.
 */
export function promoHeadline(promo: Promo): { value: string; scope: string } {
  let value = "";
  if (promo.percentOff !== null) {
    value = `${promo.percentOff}% off`;
  } else if (promo.amountCents !== null) {
    value = `${formatPeso(promo.amountCents)} off`;
  }

  const what = [...promo.itemNames, ...promo.categoryNames];
  const parts = [what.length > 0 ? `On ${joinNames(what)}` : "On the whole order"];
  if (promo.percentOff !== null && promo.maxDiscountCents !== null) {
    parts.push(`up to ${formatPeso(promo.maxDiscountCents)}`);
  }
  if (promo.minOrderCents > 0) {
    parts.push(`from ${formatPeso(promo.minOrderCents)}`);
  }
  return { value, scope: parts.join(", ") };
}

/**
 * When a promo stops, in words, or nothing at all when it never does.
 *
 * Null is silence rather than "no expiry", which is the same choice
 * `voucherSummary` makes about an empty scope: a line saying a promo never
 * ends is a line about something that is not going to happen, and it pushes
 * the one that is (a promo ending on Friday) down the card.
 *
 * Manila, not UTC. The shop is in Cebu, the owner sets these dates thinking
 * about Cebu days, and a date rendered in the viewer's zone would tell a
 * customer abroad that a promo ended a day early.
 */
export function promoEndsLabel(expiresAt: string | null): string | null {
  if (expiresAt === null) return null;
  const at = new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Manila",
  }).format(at);
}

/**
 * The code as it may arrive in `/checkout?promo=CODE`.
 *
 * Deliberately strict where the database is loose. `admin_upsert_voucher`
 * accepts any 40 characters without whitespace because the owner writes codes
 * and puts them on posters, but a value arriving in a URL is whatever somebody
 * typed or pasted, so it is normalised to the one shape a lookup can use and
 * anything else becomes null rather than a failed check later on.
 *
 * Null is the only failure mode on purpose. A junk `?promo=` is not worth an
 * error message on a checkout screen: the customer came here to pay, and the
 * honest response to a code that cannot exist is the ordinary empty field.
 */
export const promoCodeParamSchema = z
  .union([z.string(), z.array(z.string()), z.undefined(), z.null()])
  .transform((value) => {
    // A repeated query parameter arrives as an array. The first one wins,
    // rather than the request being refused, because there is no version of
    // "?promo=A&promo=B" where refusing helps anybody.
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== "string") return null;
    const code = raw.trim().toUpperCase();
    if (code === "" || code.length > 40 || /\s/.test(code)) return null;
    return code;
  });

/** Reads one `?promo=` value off a resolved searchParams object. */
export function promoCodeFromParams(
  params: Record<string, string | string[] | undefined>,
): string | null {
  return promoCodeParamSchema.parse(params.promo);
}
