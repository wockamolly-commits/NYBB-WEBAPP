/**
 * What a number field is allowed to contain WHILE IT IS BEING TYPED.
 *
 * `inputMode` was doing this job and cannot: it picks the keyboard a phone
 * offers and restricts nothing at all on a desktop, so "Amount off, in pesos"
 * accepted letters. `type="number"` is not the fix either. It brings stepper
 * arrows this workspace has already taken off once, it changes values on a
 * scroll wheel over a focused field, and it reports a partially typed value as
 * the empty string, which is the one reading this codebase must never confuse
 * with a number.
 *
 * So the field stays text and the keystroke is judged instead. This is the
 * judgement, kept pure and out of the component so it can be tested, which is
 * the same reason lib/vouchers/schema.ts exists apart from the form.
 *
 * IT ANSWERS ABOUT A HALF-TYPED VALUE, NOT A FINISHED ONE. "" and "1." are both
 * accepted because both are on the way to a number somebody is still entering.
 * Whether the finished value is in range is a different question, asked by the
 * schema on submit, and asking it here would mean a field that fights the
 * person typing in it: a percentage capped at 100 would refuse the "1" of
 * "100" once it read as ten.
 *
 * EMPTY IS ACCEPTED, DELIBERATELY. AGENTS.md rule 6. A field that cannot be
 * cleared cannot say "no ceiling" or "unlimited", and those are nulls that mean
 * something specific in every voucher column they land in.
 */

/** Integers count things; pesos carry at most two decimal places. */
export type NumericFieldShape = "integer" | "pesos";

const PATTERNS: Record<NumericFieldShape, RegExp> = {
  integer: /^\d*$/,
  pesos: /^\d*(?:\.\d{0,2})?$/,
};

/**
 * Whether a field may hold this value next.
 *
 * A change that fails is dropped whole rather than stripped down to the
 * characters that would have passed. Stripping looks helpful and is how a
 * pasted "1.200,50" quietly becomes 120050: the person sees a number, it is not
 * the number they pasted, and nothing anywhere says so. Refusing the change
 * leaves the field visibly as it was, which is a state somebody notices.
 */
export function acceptsNumericInput(value: string, shape: NumericFieldShape): boolean {
  return PATTERNS[shape].test(value);
}
