import type { VoucherPayload } from "./schema";

/**
 * The two mappings between the voucher form and the database, lifted out of
 * the Server Action so they can be tested.
 *
 * WHY THIS FILE EXISTS. It was written after `publicise` shipped as a toggle
 * that could never save. The control was on the screen, the column was in the
 * schema, the RPC took the field and the SQL tests proved it worked, and the
 * save still wrote false every time, because `saveVoucher` builds both of
 * these objects field by field and the new field was in neither list. Two
 * separate defaults, `z.boolean().default(false)` here and
 * `coalesce(..., false)` in 0073, each quietly supplied a value nobody chose.
 *
 * Nothing caught it. The schema field has a default, so its input type is
 * optional and `tsc` saw nothing missing. The SQL tests call
 * `admin_upsert_voucher` with a payload that names `publicise`, so the
 * function was proven correct. The unit tests parse the schema directly. The
 * only untested thing in the whole path was the glue, and the glue was in a
 * `"use server"` file where nothing beside an async function may be exported,
 * which is precisely the invisibility AGENTS.md rule 6 warns about.
 *
 * So the rule that applies here is the same one that applies to the parse: if
 * it decides anything, it does not belong in the actions file.
 */

/**
 * Split the phone textarea into numbers.
 *
 * One per line is what the field asks for, but people paste comma-separated
 * lists, so both are accepted. Normalising to digits happens in SQL, where the
 * redemption count reads the same function, rather than here where a second
 * implementation could drift from it.
 */
export function phoneLines(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter((value) => value !== "");
}

/**
 * The form as the schema wants to see it.
 *
 * Every key the schema declares has to appear here, including the ones with
 * defaults, because a default is indistinguishable from a deliberate choice
 * once it has been applied. `voucher-form-mapping.test.ts` asserts that set
 * rather than trusting this list to stay complete.
 */
export function voucherFormInput(formData: FormData): Record<string, unknown> {
  return {
    id: formData.get("id") ?? "",
    code: formData.get("code") ?? "",
    description: formData.get("description") ?? "",
    note: formData.get("note") ?? "",
    discountKind: formData.get("discountKind") ?? "fixed",
    amountPesos: formData.get("amountPesos") ?? "",
    percentOff: formData.get("percentOff") ?? "",
    maxDiscountPesos: formData.get("maxDiscountPesos") ?? "",
    minOrderPesos: formData.get("minOrderPesos") ?? "",
    maxUses: formData.get("maxUses") ?? "",
    maxUsesPerCustomer: formData.get("maxUsesPerCustomer") ?? "1",
    startsAt: formData.get("startsAt") ?? "",
    expiresAt: formData.get("expiresAt") ?? "",
    isActive: formData.get("isActive") === "true",
    // Compared against the string rather than coerced, the same way isActive
    // is, because a hidden input carries "true"/"false" as text and
    // `Boolean("false")` is true.
    publicise: formData.get("publicise") === "true",
    branchIds: formData.getAll("branchIds").map(String),
    itemIds: formData.getAll("itemIds").map(String),
    categoryIds: formData.getAll("categoryIds").map(String),
    customerPhones: phoneLines(formData.get("customerPhones")),
  };
}

/**
 * The parsed form as `admin_upsert_voucher` wants to see it.
 *
 * `customerUserIds` is the one key with no control behind it: the form names
 * customers by phone, and the account list exists for the loyalty rail to
 * write later. It is sent empty rather than omitted, because 0066 replaces
 * scope wholesale and an absent key would read as "leave it alone" to a
 * future reader even though the SQL treats it as an empty list.
 */
export function voucherRpcPayload(parsed: VoucherPayload): Record<string, unknown> {
  return {
    id: parsed.id,
    code: parsed.code,
    description: parsed.description,
    note: parsed.note,
    amountCents: parsed.amountCents,
    percentOff: parsed.percentOff,
    maxDiscountCents: parsed.maxDiscountCents,
    minOrderCents: parsed.minOrderCents,
    maxUses: parsed.maxUses,
    maxUsesPerCustomer: parsed.maxUsesPerCustomer,
    startsAt: parsed.startsAt,
    expiresAt: parsed.expiresAt,
    isActive: parsed.isActive,
    publicise: parsed.publicise,
    branchIds: parsed.branchIds,
    itemIds: parsed.itemIds,
    categoryIds: parsed.categoryIds,
    customerPhones: parsed.customerPhones,
    customerUserIds: [],
  };
}
