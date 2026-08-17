import { z } from "zod";

/**
 * Validation for a franchise lead, kept free of Next and of the database so the
 * rules can be tested on their own and reused if this ever gains a mobile or
 * API caller.
 *
 * The bias throughout is toward ACCEPTING the lead. This form is not a checkout:
 * a refused order can be retried by a customer who wants the food, but a
 * would-be franchisee who gets told their phone number is wrong just leaves,
 * and the business never learns they existed. So the only hard requirements are
 * the three fields somebody needs in order to call them back, and the limits
 * exist to bound storage rather than to judge the answer.
 */

/**
 * Phone is deliberately not pattern-matched. `lib/phone.ts` has no normalizer
 * and a franchise inquiry is exactly the case where one would hurt: the
 * business sells to people who may be in Manila, Bohol, or overseas, so any
 * Philippine-shaped regular expression would reject real buyers. A human reads
 * this field before anyone dials it.
 */
export const franchiseInquirySchema = z.object({
  name: z
    .string({ error: "Tell us your name." })
    .trim()
    .min(1, { error: "Tell us your name." })
    .max(120, { error: "That name is too long for our records." }),
  // Trim and fold BEFORE validating, not after. `z.email().trim()` reads as
  // though it cleans the input first, and does the opposite: the format check
  // runs on the raw string and " maria@example.com " is refused as malformed.
  // Pasting an address out of a mail client brings a trailing space with it
  // often enough that this is a real lead, not a hypothetical one.
  email: z
    .string({ error: "Enter an email address we can reply to." })
    .trim()
    .toLowerCase()
    .pipe(
      z
        .email({ error: "Enter an email address we can reply to." })
        .max(254, { error: "That email address is too long." }),
    ),
  phone: z
    .string({ error: "Give us a number we can call." })
    .trim()
    .min(1, { error: "Give us a number we can call." })
    .max(40, { error: "That phone number is too long." }),
  city: z
    .string()
    .trim()
    .max(160, { error: "Keep the location under 160 characters." })
    .optional()
    .transform((value) => (value ? value : undefined)),
  message: z
    .string()
    .trim()
    .max(4000, { error: "Keep the message under 4000 characters." })
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type FranchiseInquiry = z.infer<typeof franchiseInquirySchema>;

export type FranchiseInquiryState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; message: string; values?: FranchiseInquiryValues };

/** What the form puts back in the fields when it refuses, so nothing is retyped. */
export type FranchiseInquiryValues = {
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  message?: string;
};

/**
 * The hidden field a person never sees and a naive bot fills in.
 *
 * Named for something a form filler would plausibly want. Spec N9 chooses this
 * over a CAPTCHA on the grounds that a CAPTCHA on a lead form costs more leads
 * than the spam does, which is a trade the business is making knowingly.
 */
export const HONEYPOT_FIELD = "company_website";

/**
 * True when the submission looks automated.
 *
 * A caught bot is told the same thing a real person is told, and its row is
 * simply never written. Refusing out loud teaches the author which field gave
 * them away, and the next version arrives with it left empty.
 */
export function looksAutomated(honeypotValue: unknown): boolean {
  return typeof honeypotValue === "string" && honeypotValue.trim() !== "";
}

/** The first validation message, which is the one the form shows. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
