import { z } from "zod";
import { manilaWallClockIso } from "@/lib/staff/manila-dates";

/**
 * The voucher form, as its Save posts it, and the payload the RPC reads.
 *
 * THIS FILE IS WHERE AGENTS.md RULE 6 BITES HARDEST IN THE WHOLE FEATURE.
 *
 * Six of a voucher's columns are nullable by design and not one null means
 * zero:
 *
 *   amount_cents        null = this is a percentage voucher
 *   percent_off         null = this is a fixed-amount voucher
 *   max_discount_cents  null = the percentage is uncapped
 *   max_uses            null = unlimited redemptions
 *   starts_at           null = live from the moment it is created
 *   expires_at          null = it never expires
 *
 * `z.coerce.number()` turns "" into 0 because `Number("")` is 0, so a coercing
 * branch placed before an empty-string literal makes the literal unreachable
 * and silently rewrites every one of those meanings. Spec section 18 singles
 * out max_uses as the worst of them: 0 is a plausible looking cap, nothing
 * downstream would flag it, and the effect is every open promo code refusing to
 * redeem.
 *
 * So every optional number below is `z.union([z.literal(""), ...])` with the
 * literal FIRST, and the transform at the foot maps "" to null rather than
 * letting arithmetic do it. This is the same shape, and the same reasoning, as
 * `resolvedHeatPercent` in lib/staff/menu-schemas.ts, which is where the
 * identical bug actually shipped.
 *
 * maxUsesPerCustomer is the deliberate exception and the rule explains why: its
 * valid range starts at 1, so a stray coerced 0 fails `min(1)` and the person
 * sees an error rather than a saved surprise. Coercion is only safe where a
 * zero would be rejected anyway.
 *
 * The file lives in lib/ and carries no "use server", so the parse is unit
 * tested. That is not incidental: the heat_percent bug was invisible precisely
 * because the schema that was wrong sat somewhere nothing could test it.
 */

/** Ten million pesos, the ceiling the menu schemas already use for money. */
const MAX_MONEY_CENTS = 10_000_000;

/**
 * Pesos as the owner types them, to centavos.
 *
 * Deliberately not `app/(workspace)/workspace/menu/items/sizeDrafts.ts`'s
 * pesosToCents, which answers 0 for a blank input. That is right for a free
 * menu size and wrong for every money field here, where blank means "no cap"
 * and "no minimum" rather than "zero pesos". The emptiness is decided by the
 * union before this ever runs.
 */
function pesosToCents(pesos: number): number {
  return Math.round(pesos * 100);
}

const optionalPesos = z.union([
  z.literal(""),
  z.coerce.number().min(0.01).max(MAX_MONEY_CENTS / 100),
]);

export const voucherFormSchema = z
  .object({
    id: z.union([z.literal(""), z.uuid()]).default(""),

    // Loose on purpose. These go on posters, so a hyphen or a digit is normal;
    // what is refused is whitespace, which would make the code untypable, and
    // a length that is a paste accident rather than a promotion.
    code: z
      .string()
      .trim()
      .min(1, "Give the code something for a customer to type")
      .max(40, "That is longer than a code anybody will type from a poster")
      .regex(/^\S+$/, "A code cannot contain spaces"),

    /** Shown to the customer when the code is applied. */
    description: z.string().trim().max(200).default(""),
    /** The owner's own note. Never leaves the workspace. */
    note: z.string().trim().max(300).default(""),

    discountKind: z.enum(["fixed", "percent"]),
    amountPesos: optionalPesos.default(""),
    percentOff: z
      .union([z.literal(""), z.coerce.number().int().min(1).max(100)])
      .default(""),
    maxDiscountPesos: optionalPesos.default(""),

    // Empty means no minimum, which genuinely is zero, so this one collapses
    // to 0 rather than to null. min_order_cents is `not null default 0` in the
    // schema and needs none of the null handling above.
    minOrderPesos: z
      .union([z.literal(""), z.coerce.number().min(0).max(MAX_MONEY_CENTS / 100)])
      .default(""),

    maxUses: z
      .union([z.literal(""), z.coerce.number().int().min(1).max(1_000_000)])
      .default(""),

    // The exception. Range starts at 1, so a coerced empty string is refused by
    // the bound rather than saved as zero.
    maxUsesPerCustomer: z.coerce
      .number()
      .int()
      .min(1, "A customer has to be allowed at least one use")
      .max(1000)
      .default(1),

    // Manila wall clock strings from a datetime-local input, or empty. Kept as
    // strings here and turned into instants in the transform, because an empty
    // one means "no date" and must never become the epoch.
    startsAt: z.string().trim().default(""),
    expiresAt: z.string().trim().default(""),

    isActive: z.boolean().default(true),

    branchIds: z.array(z.uuid()).default([]),
    itemIds: z.array(z.uuid()).default([]),
    categoryIds: z.array(z.uuid()).default([]),

    /** One per line, as the textarea holds them. Normalised server side. */
    customerPhones: z.array(z.string().trim().min(1)).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.discountKind === "fixed" && value.amountPesos === "") {
      ctx.addIssue({
        code: "custom",
        path: ["amountPesos"],
        message: "Say how much comes off",
      });
    }
    if (value.discountKind === "percent" && value.percentOff === "") {
      ctx.addIssue({
        code: "custom",
        path: ["percentOff"],
        message: "Say what percentage comes off",
      });
    }

    for (const [key, raw] of [
      ["startsAt", value.startsAt],
      ["expiresAt", value.expiresAt],
    ] as const) {
      if (raw !== "" && manilaWallClockIso(raw) === null) {
        ctx.addIssue({ code: "custom", path: [key], message: "That is not a date and time" });
      }
    }

    const start = value.startsAt === "" ? null : manilaWallClockIso(value.startsAt);
    const end = value.expiresAt === "" ? null : manilaWallClockIso(value.expiresAt);
    if (start !== null && end !== null && Date.parse(start) >= Date.parse(end)) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "The code cannot expire before it opens",
      });
    }
  })
  .transform((value) => {
    // The kind decides which figure is kept and which is discarded, so a form
    // switched from percentage to fixed cannot save both and trip
    // vouchers_one_discount_kind at the database. The one not chosen is null,
    // and null here is the meaning, not a missing value.
    const isPercent = value.discountKind === "percent";

    return {
      id: value.id === "" ? null : value.id,
      code: value.code.toUpperCase(),
      description: value.description === "" ? null : value.description,
      note: value.note === "" ? null : value.note,

      amountCents:
        isPercent || value.amountPesos === "" ? null : pesosToCents(value.amountPesos),
      percentOff: isPercent && value.percentOff !== "" ? value.percentOff : null,
      // A ceiling on a fixed amount is the fixed amount, so it is dropped
      // rather than saved as a number that could never bind.
      maxDiscountCents:
        isPercent && value.maxDiscountPesos !== ""
          ? pesosToCents(value.maxDiscountPesos)
          : null,

      minOrderCents: value.minOrderPesos === "" ? 0 : pesosToCents(value.minOrderPesos),
      maxUses: value.maxUses === "" ? null : value.maxUses,
      maxUsesPerCustomer: value.maxUsesPerCustomer,

      startsAt: value.startsAt === "" ? null : manilaWallClockIso(value.startsAt),
      expiresAt: value.expiresAt === "" ? null : manilaWallClockIso(value.expiresAt),

      isActive: value.isActive,
      branchIds: value.branchIds,
      itemIds: value.itemIds,
      categoryIds: value.categoryIds,
      customerPhones: value.customerPhones,
    };
  });

export type VoucherFormInput = z.input<typeof voucherFormSchema>;
export type VoucherPayload = z.output<typeof voucherFormSchema>;

/**
 * A voucher row read back from Postgres.
 *
 * Nullable columns are parsed as nullable and branched on, never coerced.
 * `z.coerce.number()` appears only on the two `not null` bigints, which is the
 * case AGENTS.md rule 6 says coercion is actually for: PostgREST returns a
 * bigint as a string, and the column can never be null.
 */
export const voucherRowSchema = z.object({
  id: z.uuid(),
  code: z.string().min(1),
  description: z.string().nullable(),
  note: z.string().nullable(),
  amount_cents: z.union([z.null(), z.coerce.number().int()]),
  percent_off: z.number().int().nullable(),
  max_discount_cents: z.union([z.null(), z.coerce.number().int()]),
  min_order_cents: z.coerce.number().int(),
  max_uses: z.number().int().nullable(),
  max_uses_per_customer: z.number().int(),
  uses_count: z.number().int(),
  starts_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  is_active: z.boolean(),
  owner_user_id: z.uuid().nullable(),
  created_at: z.string(),
});

export type VoucherRow = z.infer<typeof voucherRowSchema>;

/** The camelCase shape the screens read, with every null left as a null. */
export function toVoucher(row: VoucherRow) {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    note: row.note,
    amountCents: row.amount_cents,
    percentOff: row.percent_off,
    maxDiscountCents: row.max_discount_cents,
    minOrderCents: row.min_order_cents,
    maxUses: row.max_uses,
    maxUsesPerCustomer: row.max_uses_per_customer,
    usesCount: row.uses_count,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    isActive: row.is_active,
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
  };
}

export type Voucher = ReturnType<typeof toVoucher>;
