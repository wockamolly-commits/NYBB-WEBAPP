import { WorkspaceFieldLabel } from "@/components/ui/WorkspaceField";
import { cn } from "@/lib/utils";

/**
 * The Workspace table: the shape a management screen takes when it manages a
 * list of like records.
 *
 * WHY THIS IS ONE MODULE AND NOT THREE COPIES.
 * ================================================================
 * Three screens need it. Option groups list their options, Categories lists
 * the storefront's sections, and the item editor lists an item's sizes. All
 * three shipped first as a form per record in a `flex-wrap` row, and all three
 * had the same two faults, because a form per record always has them:
 *
 *   - A wrapping flex row sizes itself from its own contents, so no two rows
 *     can align even in principle. A row showing an amount field sits
 *     differently from one that is not.
 *   - Every field carries its own label, so the column names get printed once
 *     per record. Three lines of label text between one record's name and the
 *     next is precisely what stops an eye running down a column, and finding a
 *     record by name is the only reason anyone opens these screens.
 *
 * The fix in each case is the same table, so it is written once here.
 * DESIGN.md's "The workspace table" section states the rules; this is the
 * implementation of them, and a second column list written somewhere else
 * would drift from both on the first change.
 *
 * HOW A TABLE IS ASSEMBLED.
 * ================================================================
 * A row is its own <form> with its own Server Action, so the grid cannot be
 * one container with rows inside it. Instead the row *is* the grid, and the
 * header row is another grid with the identical template. That is why
 * `tableColumns` exists: both take their widths from one call, and nobody has
 * to remember to change two lists.
 *
 *   const columns = tableColumns("2.75rem", "minmax(6rem,1fr)", showHeat && "4rem");
 *
 *   <TableHead columns={columns}>...</TableHead>
 *   <form className={cn(TABLE_ROW, tableRowStyle(columns))}>...</form>
 *
 * Below `lg` the template is not applied at all and the row stacks, because
 * eight columns inside 390px is not a table, it is a horizontal scrollbar.
 * Callers group their cells into wrappers carrying `lg:contents` so the
 * stacked layout has real structure and the wide one has none: from `lg` up
 * `display: contents` dissolves those wrappers and their children become
 * direct grid items in header order.
 */

/**
 * The column widths, as one `grid-template-columns` value.
 *
 * Falsey entries drop out, which is how an optional column comes and goes
 * without the caller assembling a string by hand. An optional column is
 * always a property of the table rather than of a row: a column that appeared
 * on only the rows using it would not be a column.
 */
export function tableColumns(...columns: (string | false | null | undefined)[]): string {
  return columns.filter(Boolean).join(" ");
}

/**
 * The grid itself, on the row's own element.
 *
 * `items-end` from `lg` up so a cell with a label and one without still line
 * their controls up on the same baseline. The row gap only exists in the
 * stacked layout; at table width the row is one line.
 */
export const TABLE_ROW = "grid gap-x-2.5 gap-y-3 lg:items-end lg:gap-y-0";

/** The columns, keyed through a variable so the class stays static. */
export function tableRowStyle(columns: string): React.CSSProperties {
  return { "--table-columns": columns } as React.CSSProperties;
}

/** Pair with tableRowStyle. Kept apart so Tailwind can see the literal. */
export const TABLE_ROW_COLUMNS = "lg:grid-cols-(--table-columns)";

/**
 * A saved record's row, and the blank one that adds another.
 *
 * The new row takes a dashed rule for the same reason the "new" card does at
 * card scale: it is an invitation rather than a record. Rows separate with a
 * rule and not a plate, because this system separates by value and a table is
 * not an exception to that.
 */
export function tableRowClass(kind: "saved" | "new"): string {
  return cn(
    "border-nybb-bone/15 border-t py-3.5 lg:py-2.5",
    kind === "new" && "border-nybb-bone/25 border-dashed",
  );
}

/**
 * The column names, printed once above the rows.
 *
 * `aria-hidden`, and that is not a shortcut: a grid header cell is not
 * programmatically the label of an input three rows below it, so the real
 * labelling is done by each cell's own TableCellLabel. This is the visible
 * half only, and duplicating it into the accessibility tree would make every
 * field announce its column name twice.
 *
 * It draws no bottom rule of its own. The first row already draws a top one,
 * and a second would land 8px above it and read as a double line.
 */
export function TableHead({
  columns,
  className,
  children,
}: {
  columns: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden
      className={cn("text-nybb-bone/55 type-caps hidden pb-2 lg:grid lg:gap-x-2.5", className)}
      style={{ gridTemplateColumns: columns }}
    >
      {children}
    </div>
  );
}

/**
 * A cell's label: read normally in the stacked layout, folded into the
 * accessibility tree once the header row is doing the visible work.
 *
 * Never simply deleted at `lg`. Removing it would leave every field on the
 * widest layout announcing nothing but its value.
 */
export function TableCellLabel({
  htmlFor,
  className,
  children,
}: {
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceFieldLabel htmlFor={htmlFor} className={cn("lg:sr-only", className)}>
      {children}
    </WorkspaceFieldLabel>
  );
}

/** Inputs sit tight under a visible label and flush in a column that has none. */
export const TABLE_CELL_INPUT = "mt-1.5 lg:mt-0";

/**
 * A checkbox or radio cell: the mark plus its word while stacked, the mark
 * alone once the column header carries the word.
 *
 * The 44px cell holds the target on the floor this system states even though
 * the mark itself is 22, and the control keeps an aria-label naming its own
 * row, because a column of fifteen boxes called the same thing is fifteen
 * identical choices to anyone who cannot see which row they are in.
 */
export const TABLE_MARK_CELL =
  "flex min-h-11 shrink-0 items-center gap-3 lg:justify-center lg:gap-0";

/**
 * The word beside a mark, which the column header replaces at table width.
 *
 * `whitespace-nowrap` is load bearing rather than tidy. In a stacked tail
 * holding a count, a switch, Save and a delete, a label allowed to wrap gets
 * squeezed to its narrowest column by its neighbours: "On the menu" came out
 * as three stacked words 30px wide between a checkbox and a button. A mark's
 * word is two or three words at most, so it never needs to break.
 */
export const TABLE_MARK_WORD = "type-caps text-nybb-bone/65 whitespace-nowrap lg:hidden";
