"use client";

import { useEffect, useRef } from "react";

/**
 * A checkbox or a radio whose ticked state survives a Server Action.
 *
 * WHY THIS EXISTS.
 *
 * React 19 resets a form after every action passed to its `action` prop, by
 * calling the real `form.reset()` during the commit. For a controlled text
 * field that is harmless, because React keeps the element's `defaultValue` in
 * step with its `value` on every update, so the reset puts back the text that
 * was already there. It does not do the same for `checked`: read `updateInput`
 * in react-dom and the line that writes `defaultChecked` runs only when the
 * input has no `checked` prop, which is to say only for uncontrolled ones. A
 * controlled box therefore keeps the `defaultChecked` it was born with, and
 * the reset silently puts it back to whatever it looked like when the page
 * loaded.
 *
 * The re-render that follows the action cannot repair it. React writes
 * `element.checked` only when the prop changed, and the prop has not changed:
 * the person's tick lives in React state, which the reset never touched. So
 * the screen shows the opposite of what the form will send, and the change
 * that was in fact saved looks like it was thrown away until a reload.
 *
 * That is what shipped on the menu item editor. Ticking an option group and
 * pressing Save wrote the link and then emptied the box.
 *
 * WHAT THIS DOES.
 *
 * Exactly what React already does for `value`: keeps the reset target in step
 * with the state, so a reset restores the current tick instead of an old one.
 * It also puts `checked` back if it finds it wrong, which covers the one case
 * the first line cannot, a tick that changes in the very same commit as the
 * reset. The reset runs in the mutation phase and this effect runs after it,
 * so the repair lands last either way.
 *
 * The effect deliberately has no dependency array. It has to run after the
 * commit that resets the form, and that commit does not change `checked`,
 * which is the whole problem. Both writes are no-ops when nothing moved.
 */
type CheckableProps = Omit<
  React.ComponentProps<"input">,
  "type" | "checked" | "defaultChecked"
> & {
  checked: boolean;
};

function Checkable({
  type,
  checked,
  ...props
}: CheckableProps & { type: "checkbox" | "radio" }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.defaultChecked = checked;
    if (node.checked !== checked) node.checked = checked;
  });

  return <input ref={ref} type={type} checked={checked} {...props} />;
}

/**
 * Nothing but the element is set here. The material (the box, its orange fill
 * when ticked, the focus ring and the disabled state) comes from the
 * `.workspace-shell input[type="checkbox"]` rules in app/globals.css, the same
 * way WorkspaceInput takes its own. Every screen that uses this sits inside
 * app/(workspace)/workspace/layout.tsx, which carries that class.
 */
export function WorkspaceCheckbox(props: CheckableProps) {
  return <Checkable type="checkbox" {...props} />;
}

/** The radio half of the same problem, styled from globals.css in the same way. */
export function WorkspaceRadio(props: CheckableProps) {
  return <Checkable type="radio" {...props} />;
}
