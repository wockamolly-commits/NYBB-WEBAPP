import { cn } from "@/lib/utils";

/**
 * One section of a Workspace form, and the rail that names it.
 *
 * WHAT IT REPLACES.
 * ================================================================
 * The item editor had five sections and every one of them opened with
 * `<p className="type-caps text-nybb-bone/55">Details</p>`, then one to three
 * paragraphs of `text-xs text-nybb-bone/55` before any control appeared. Two
 * things were wrong with that, and they compounded.
 *
 * The hierarchy was inverted. A section's name was set in the same size and
 * family as the field labels underneath it and at a *lower* alpha, 55 against
 * 65, so "DETAILS" was the weakest text inside its own card and "CATEGORY"
 * outranked it. A form whose sections are quieter than its fields cannot be
 * skimmed for the section you want, which is the only way anybody navigates a
 * long form. They were also `<p>` elements, so the form had no heading
 * structure at all for a screen reader.
 *
 * And the prose sat in the control flow. The paragraph explaining what
 * "On the menu" does ran to four lines under two checkboxes; the sizes
 * explanation ran to five lines before the first field. Every visit paid for
 * instruction that is read once, and it was paid in the vertical space between
 * the controls somebody actually came to use.
 *
 * WHAT THIS DOES INSTEAD.
 * ================================================================
 * From `lg` up the section is two columns: a fixed rail carrying the heading
 * and its explanation, and the body carrying the controls. The prose leaves
 * the control flow entirely and becomes something you read across from, the
 * way a settings screen has worked for twenty years. The heading takes the
 * display face at panel size in full bone, which is the tier DESIGN.md already
 * describes as "the heading inside a card", so a section now outranks the
 * fields inside it by family and by value rather than by neither.
 *
 * Below `lg` it stacks into heading, description, controls, which is the order
 * the page already had. Nothing is hidden and no word is dropped; the rail is
 * a place to put them, not a way to lose them.
 *
 * The rail is `16rem`. It is wide enough for the longest of these
 * explanations to set at a readable measure and narrow enough that the body
 * still holds a table of five columns at `lg`.
 */
export function WorkspaceSection({
  title,
  description,
  aside,
  bodyClassName,
  className,
  children,
}: {
  /** The section's name. Rendered as the section's own <h2>. */
  title: string;
  /**
   * What somebody needs to know before using the controls. Goes in the rail,
   * under the heading, out of the way of the controls themselves.
   */
  description?: React.ReactNode;
  /**
   * A fact about the section rather than an instruction: a count, a state.
   * Sits at the foot of the rail so it reads as a readout and not as more
   * prose.
   */
  aside?: React.ReactNode;
  bodyClassName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "bg-nybb-charcoal rounded-md p-4 sm:p-5",
        "lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-x-8",
        className,
      )}
    >
      <div className="lg:pr-2">
        <h2 className="font-display heading-panel text-nybb-bone uppercase">{title}</h2>
        {description ? (
          <div className="text-nybb-bone/65 mt-2 space-y-1.5 text-xs leading-relaxed">
            {description}
          </div>
        ) : null}
        {aside ? <div className="text-nybb-bone/55 mt-3 text-xs">{aside}</div> : null}
      </div>
      <div className={cn("mt-4 lg:mt-0", bodyClassName)}>{children}</div>
    </section>
  );
}
