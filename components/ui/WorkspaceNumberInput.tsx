"use client";

import { useRef } from "react";
import { WorkspaceInput } from "@/components/ui/WorkspaceField";
import { acceptsNumericInput, type NumericFieldShape } from "@/lib/numeric-input";

/**
 * A field that can only ever contain a number.
 *
 * A keystroke that would leave the field holding something else never reaches
 * state, so the character is not shown and complained about later, it simply
 * does not arrive. lib/numeric-input.ts says what counts and why.
 *
 * WHY NOT `type="number"`, WHICH THIS REPLACES IN SEVERAL PLACES.
 *
 * It does not do the job. Every browser still accepts `e`, `E`, `+` and `-` in
 * one, because they are parts of a valid number in some notation, and the
 * result is the trap AGENTS.md rule 6 is about: a field showing `50e` reports
 * its value as the EMPTY STRING, so the box says one thing and the form holds
 * another, and empty is exactly the reading this codebase must never confuse
 * with a number. On top of that it brings stepper arrows and changes the value
 * when a scroll wheel passes over a focused field, on screens where the value
 * is a price.
 *
 * Native `min` and `max` go with it. That costs nothing here: every field this
 * is used on is range checked where it is actually decided, by the form's own
 * gate on the menu screens and by the zod schema on the server everywhere else,
 * and both of those can say what is wrong in words.
 *
 * Works controlled (pass `value` and `onValueChange`) or uncontrolled (pass
 * `defaultValue`). A controlled field snaps back on its own when a change is
 * refused, because state did not move and React restores the DOM node. An
 * uncontrolled one has no state to fall back to, so the last accepted value is
 * kept here and put back by hand.
 */
export function WorkspaceNumberInput({
  shape,
  value,
  defaultValue,
  onValueChange,
  onChange,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "inputMode"> & {
  shape: NumericFieldShape;
  onValueChange?: (value: string) => void;
}) {
  const accepted = useRef(String(defaultValue ?? value ?? ""));

  return (
    <WorkspaceInput
      {...props}
      type="text"
      value={value}
      defaultValue={defaultValue}
      // Still set, because it is the right keyboard on a phone. It was never a
      // restriction, which is the bug this component exists to fix.
      inputMode={shape === "pesos" ? "decimal" : "numeric"}
      onChange={(event) => {
        if (acceptsNumericInput(event.target.value, shape)) {
          accepted.current = event.target.value;
          onValueChange?.(event.target.value);
          onChange?.(event);
          return;
        }
        if (value === undefined) event.target.value = accepted.current;
      }}
    />
  );
}
