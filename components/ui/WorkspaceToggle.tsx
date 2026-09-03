"use client";

/**
 * A switch that submits.
 *
 * WHY A BUTTON AND NOT A CHECKBOX.
 *
 * The permission panel is one form holding thirteen of these, because a
 * button's own name and value are what a submit sends: pressing one says which
 * permission and which way in a single field. A checkbox would need its own
 * form each (forms cannot nest, and the member card already has one for the
 * role and the branch) or a hidden field per row plus a script to submit on
 * change. It would also inherit the reset problem WorkspaceCheckbox exists to
 * paper over, which does not arise here because nothing about this element is
 * controlled: it is a button, and what it looks like comes from aria-checked.
 *
 * role="switch" with aria-checked is the ARIA pattern for exactly this: a
 * control with two states that takes effect immediately, rather than one that
 * contributes a value to something submitted later. Screen readers announce it
 * as "on" or "off" rather than "checked".
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
      type="submit"
      role="switch"
      aria-checked={on}
      className={className ? `workspace-toggle ${className}` : "workspace-toggle"}
      {...props}
    >
      <span aria-hidden className="workspace-toggle-knob" />
    </button>
  );
}
