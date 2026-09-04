import { describe, expect, it } from "vitest";
import { acceptsNumericInput } from "@/lib/numeric-input";

/**
 * The guard on every number field in the workspace.
 *
 * Reported from the promo code screen: "Amount off, in pesos" took letters.
 * It had `inputMode="decimal"`, which chooses a phone keyboard and restricts
 * nothing at all anywhere else, so on a desktop the field was a plain text box.
 *
 * These cases are about a value MID-TYPE, not a finished one. Range lives in
 * the schema, and the two must not be confused: a percentage field that
 * enforced its own maximum would refuse the "1" of "100" the moment it read as
 * ten, and fight the person using it.
 */
describe("what a number field may hold while it is being typed", () => {
  it("takes the digits, which is the whole point", () => {
    expect(acceptsNumericInput("50", "pesos")).toBe(true);
    expect(acceptsNumericInput("50", "integer")).toBe(true);
    expect(acceptsNumericInput("0", "integer")).toBe(true);
  });

  it("takes an empty field, because empty is not zero", () => {
    // AGENTS.md rule 6. A field that cannot be cleared cannot say "no ceiling"
    // or "unlimited", and both are nulls that mean something specific in the
    // columns they land in.
    expect(acceptsNumericInput("", "pesos")).toBe(true);
    expect(acceptsNumericInput("", "integer")).toBe(true);
  });

  it("refuses the letters that were reported", () => {
    expect(acceptsNumericInput("50a", "pesos")).toBe(false);
    expect(acceptsNumericInput("abc", "pesos")).toBe(false);
    expect(acceptsNumericInput("a50", "integer")).toBe(false);
  });

  it("refuses the characters type=number would have let through", () => {
    // These are the reason the fields are text with a guard rather than
    // type="number": every browser accepts them there, and a field showing
    // "50e" reports its value as the empty string.
    for (const value of ["50e", "5e3", "1E4", "+50", "-50"]) {
      expect(acceptsNumericInput(value, "pesos")).toBe(false);
      expect(acceptsNumericInput(value, "integer")).toBe(false);
    }
  });

  it("lets a peso value be part way through its decimals", () => {
    expect(acceptsNumericInput("12.", "pesos")).toBe(true);
    expect(acceptsNumericInput("12.5", "pesos")).toBe(true);
    expect(acceptsNumericInput("12.50", "pesos")).toBe(true);
    expect(acceptsNumericInput(".5", "pesos")).toBe(true);
  });

  it("stops a peso value at two decimal places", () => {
    // Centavos are the smallest unit there is, and a third digit is either a
    // typo or a value the peso conversion would silently round.
    expect(acceptsNumericInput("12.555", "pesos")).toBe(false);
    expect(acceptsNumericInput("12.5.5", "pesos")).toBe(false);
  });

  it("keeps a counting field whole", () => {
    // Uses, heat percent, minutes and capacity. Half a use is not a thing.
    expect(acceptsNumericInput("12.5", "integer")).toBe(false);
    expect(acceptsNumericInput("12.", "integer")).toBe(false);
  });

  it("refuses a formatted number rather than quietly reshaping it", () => {
    // The deliberate choice explained in lib/numeric-input.ts: stripping would
    // turn a pasted "1,200.50" into 120050, which looks like a number, is not
    // the one that was pasted, and says so nowhere. Refusing leaves the field
    // visibly unchanged, which somebody notices.
    expect(acceptsNumericInput("1,200", "pesos")).toBe(false);
    expect(acceptsNumericInput("PHP 50", "pesos")).toBe(false);
    expect(acceptsNumericInput("50 ", "pesos")).toBe(false);
    expect(acceptsNumericInput(" 50", "pesos")).toBe(false);
  });
});
