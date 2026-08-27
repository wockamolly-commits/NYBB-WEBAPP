/**
 * What a menu screen shows when getManagedMenu() returns null.
 *
 * A null menu is a failed read, not an empty catalog and not a missing
 * record, so the screen has to say the session is fine and the data is not.
 * Ruling R17, and this is now the only copy: the menu index, the categories
 * screen and the option groups screen each carried a verbatim one until the
 * whole-branch review, which is where the "not this task's files to change"
 * reasoning ran out. All five menu routes import this.
 */
export function MenuUnavailable() {
  return (
    <div role="alert" className="border-nybb-bone/30 mt-7 rounded-md border border-dashed p-5">
      <p className="font-display heading-panel">The menu is unavailable</p>
      <p className="text-nybb-bone/60 mt-2 text-sm">
        Your session is still valid. The workspace could not read the catalog, so try again.
      </p>
    </div>
  );
}
