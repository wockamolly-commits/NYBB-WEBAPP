"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useId, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

/**
 * The workspace's delete control, and the question it asks first.
 *
 * WHAT THIS REPLACES.
 * ================================================================
 * Four screens each wrote `onSubmit={window.confirm(...) || preventDefault()}`
 * on their delete form. That dialog is the browser's, not this product's: it
 * announces the origin ("localhost:3000 says"), it puts OK before Cancel with
 * OK styled as the safe blue one, it cannot say what is actually about to be
 * removed, and on a counter tablet it lands as a system alert in the middle of
 * a shift. It is also the one surface in the whole app that no amount of
 * DESIGN.md can reach.
 *
 * This is the same gate, drawn in the system: a native <dialog> opened with
 * showModal(), which brings the top layer, the focus trap, Escape to dismiss
 * and an inert page behind it without any of that being hand rolled. Clicking
 * the backdrop dismisses too, because dismissing a destructive question is
 * always the safe outcome.
 *
 * WHY IT OWNS THE BUTTON AS WELL AS THE DIALOG.
 * ================================================================
 * The trigger and the confirmation are one control. Splitting them would put
 * a piece of state and a form ref in four call sites, which is exactly how the
 * four `window.confirm` strings drifted apart in the first place. So each call
 * site keeps its own <form> and its hidden fields, drops the onSubmit gate,
 * and renders this in place of its submit button. On confirm this finds its
 * own form through the button's `form` property and calls requestSubmit(),
 * which fires a real submit event and therefore runs the Server Action exactly
 * as pressing the old button did.
 *
 * WHAT IT LOOKS LIKE, AND WHY.
 * ================================================================
 * A charcoal panel on an ink backdrop, one radius, no shadow. It carries a
 * border, which The Value Not Shadow Rule normally forbids: that rule applies
 * to a surface already separated by lightness, and here it is not. Charcoal on
 * a scrimmed ink page measures 1.1:1, so value cannot do this job and the
 * panel takes a real edge instead, at the 40% bone the system states for a
 * boundary on dark.
 *
 * The one red thing is the confirm button. The heading, the name and the
 * consequence are all bone, and the micro-label at the top is signage yellow,
 * which is a rationed accent whose stated jobs are badges and micro-labels.
 * Red is not used for type anywhere in this system and it is not used for type
 * here: it is the fill of the control that does the deleting, and nothing
 * else. A red heading over a red button would be one fact told twice.
 *
 * The plate in the middle is the product tile's own name plate: ink, the name
 * in the display face, an identifier above it in mono. It is there to answer
 * "am I about to delete the right record", which is the only question a person
 * actually has at this moment, and it is the reason `meta` is worth passing.
 *
 * The confirm button repeats the trigger's words exactly. An action keeps its
 * name through the whole flow, so a screen that offers "Delete option" asks
 * "Delete option?" and confirms with "Delete option".
 *
 * ORDER AND FOCUS.
 * ================================================================
 * Cancel comes first in the DOM, so showModal() lands focus on it: the safe
 * answer is the one already selected, and Enter cannot delete anything. On a
 * phone the row reverses, which puts Cancel at the bottom where the thumb
 * rests and moves the destructive button out of that arc. The reading order
 * changes with the visual order on each; the tab order does not, and it is
 * always the safe one first.
 */
export function ConfirmDeleteButton({
  label,
  name,
  meta,
  consequence,
  iconOnly = false,
  triggerLabel,
  form,
  disabled = false,
  pending = false,
  className,
}: {
  /** The words on both buttons, and the question with a mark after it. */
  label: string;
  /** The record about to go, named the way the person named it. */
  name: string;
  /** One identifier above the name: a code, a count, the group it sits in. */
  meta?: string;
  /** What deleting this actually does, in one or two sentences. */
  consequence: string;
  /**
   * Drops the trigger's words and leaves the trash icon on the 44px square.
   *
   * For a control that repeats once per row. A labelled delete button beside
   * every option in a fifteen row grid is fifteen instances of the rarest and
   * most dangerous action on the screen, which is the opposite of the weight
   * it should carry. The dialog is unchanged: it still spells the action out,
   * still names the record, and still opens on Cancel. Nothing is hidden, only
   * the repetition is.
   *
   * The accessible name does not shrink with the button. It comes from
   * `triggerLabel` when the row needs to say which record it deletes, and from
   * `label` otherwise, so a screen reader never meets fifteen buttons called
   * the same thing.
   */
  iconOnly?: boolean;
  /**
   * The id of the <form> this trigger submits, for a layout where the two
   * cannot be parent and child.
   *
   * The options grid is one grid per row, so a delete form wrapped around
   * this button would be a second grid container inside the first and the
   * trash would not sit in the row's last column. Instead the form is a
   * sibling holding only its hidden fields and this points at it, which is
   * exactly what the HTML `form` attribute is for: `button.form` resolves
   * through it, so `confirm()` below still finds and submits the right one.
   */
  form?: string;
  /**
   * The trigger's accessible name, when `label` alone would be ambiguous
   * among siblings. "Delete option: Classic Buffalo" on the trigger, while
   * the dialog it opens still asks "Delete option?" and confirms with the
   * plain words. Defaults to `label`.
   */
  triggerLabel?: string;
  disabled?: boolean;
  pending?: boolean;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const consequenceId = useId();

  function confirm() {
    // Read the form before closing. Closing does not move the button, but
    // taking the reference first keeps this independent of that.
    //
    // `.form` is the DOM property, which resolves the `form` content
    // attribute when there is one and walks up to the ancestor <form> when
    // there is not. Both call shapes therefore land here unchanged.
    const target = triggerRef.current?.form;
    dialogRef.current?.close();
    target?.requestSubmit();
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        tone="dark"
        variant="danger"
        size={iconOnly ? "icon" : "default"}
        form={form}
        aria-label={iconOnly ? (triggerLabel ?? label) : undefined}
        onClick={() => dialogRef.current?.showModal()}
        disabled={disabled || pending}
        className={cn("min-h-11", className)}
      >
        {pending ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <Trash2 aria-hidden className="size-4" />
        )}
        {iconOnly ? null : label}
      </Button>

      <dialog
        ref={dialogRef}
        // alertdialog rather than dialog: this interrupts to ask about
        // something destructive, and the role is what tells a screen reader to
        // announce the consequence with the title instead of waiting to be
        // asked for it.
        role="alertdialog"
        aria-labelledby={titleId}
        aria-describedby={consequenceId}
        className="confirm-dialog"
        // A click that lands on the dialog element itself landed on the
        // backdrop, because the panel below fills it edge to edge.
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="p-5 sm:p-6">
          <p className="type-caps text-nybb-yellow">This cannot be undone</p>
          <h2 id={titleId} className="font-display heading-minor mt-3">
            {label}?
          </h2>

          <div className="bg-nybb-ink mt-5 rounded-md px-4 py-3.5">
            {meta ? <p className="type-caps text-nybb-bone/55 font-mono">{meta}</p> : null}
            <p
              className={cn(
                "font-display text-xl leading-tight break-words",
                meta ? "mt-1.5" : null,
              )}
            >
              {name}
            </p>
          </div>

          <p id={consequenceId} className="text-nybb-bone/70 mt-5 text-sm">
            {consequence}
          </p>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              tone="dark"
              variant="secondary"
              onClick={() => dialogRef.current?.close()}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="button"
              tone="dark"
              variant="dangerSolid"
              onClick={confirm}
              className="w-full sm:w-auto"
            >
              <Trash2 aria-hidden className="size-4" />
              {label}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
