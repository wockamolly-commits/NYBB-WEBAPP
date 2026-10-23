import { z } from "zod";
import type { Branch } from "@/lib/catalog/types";

/**
 * The add-branch form, parsed before it reaches staff_create_branch().
 *
 * Kept out of the actions file so the parse can be tested (see AGENTS.md,
 * rule 6). The database repeats every check, so this exists to give the
 * person a sentence rather than to be the guard.
 */

export const BRANCH_FORMATS = [
  "street",
  "mall",
  "food-hall",
  "petrol",
  "hospital",
  "casino",
] as const satisfies readonly Branch["format"][];

const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * Phones arrive as one field, separated by commas or new lines, because a
 * counter has one or two and a repeating field is more form than the job
 * needs. Blank pieces are dropped, so a trailing comma is not a number.
 */
const phonesSchema = z
  .string()
  .transform((value) => value.split(/[,\n]/).map((phone) => phone.trim()).filter(Boolean))
  .pipe(z.array(z.string().max(30)).max(4));

/** What a branch publishes, shared by the add and edit forms. */
export const branchDetailsSchema = z.object({
  name: text(120),
  shortName: text(40),
  format: z.enum(BRANCH_FORMATS),
  addressLine: text(200),
  // Optional: empty means no barangay on file, never the string "".
  barangay: z.string().trim().max(80).transform((value) => value || null),
  city: text(80),
  phones: phonesSchema,
});

export const branchCreateSchema = branchDetailsSchema.extend({
  // Empty means "the only list there is", which the database resolves and
  // refuses once there is more than one.
  priceListId: z.union([z.literal(""), z.uuid()]).transform((value) => value || null),
});

export const branchEditSchema = branchDetailsSchema.extend({ branchId: z.uuid() });

export type BranchCreateInput = z.infer<typeof branchCreateSchema>;

function detailFields(formData: FormData) {
  const field = (name: string) => String(formData.get(name) ?? "");
  return {
    name: field("name"),
    shortName: field("shortName"),
    format: field("format"),
    addressLine: field("addressLine"),
    barangay: field("barangay"),
    city: field("city"),
    phones: field("phones"),
  };
}

export function readBranchCreateForm(formData: FormData) {
  return branchCreateSchema.safeParse({
    ...detailFields(formData),
    priceListId: String(formData.get("priceListId") ?? ""),
  });
}

export function readBranchEditForm(formData: FormData) {
  return branchEditSchema.safeParse({
    ...detailFields(formData),
    branchId: String(formData.get("branchId") ?? ""),
  });
}
