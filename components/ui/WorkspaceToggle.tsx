"use client";

/**
 * A switch.
 *
 * WHY role="switch" AND NOT A CHECKBOX.
 *
 * It carries no value into a form. The permission panel keeps what has been
 * moved in React state and posts it as hidden fields when Save is pressed, so
 * this element's job is to show a state and report a press, which is a button.
 * role="switch" with aria-checked is the ARIA pattern for exactly that, and a
 * screen reader announces it as "on" or "off" rather than "checked".
 *
 * It also sidesteps the problem WorkspaceCheckbox exists to paper over. React
 * 19 resets a form after every action, and a reset puts a controlled checkbox
 * back to the defaultChecked it was born with, showing the opposite of what
 * the form would send. Nothing here is a form control, so there is nothing for
 * the reset to get wrong.
 *
 * The material lives in the .workspace-toggle rules in app/globals.css, beside
 * the checkbox and radio ones, the same way WorkspaceInput and
 * WorkspaceCheckbox take theirs. Every screen using this sits inside
 * app/(workspace)/workspace/layout.tsx, which carries .workspace-shell.
 */
type WorkspaceToggleProps = Omit<
  React.ComponentProps<"button">,
  "type" | "role" | "aria-checked" | "children"
> & {
  on: boolean;
};

export function WorkspaceToggle({ on, className, ...props }: WorkspaceToggleProps) {
  return (
    <button
      // Explicit, because a button inside a form defaults to submit, and this
      // one sits inside the panel's save form. Left implicit, every switch
      // would save the form instead of moving.
      type="button"
      role="switch"
      aria-checked={on}
      className={className ? `workspace-toggle ${className}` : "workspace-toggle"}
      {...props}
    >
      <span aria-hidden className="workspace-toggle-knob" />
    </button>
  );
}
