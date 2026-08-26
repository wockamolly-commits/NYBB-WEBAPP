/**
 * What a menu screen shows when getManagedMenu() returns null.
 *
 * A null menu is a failed read, not an empty catalog and not a missing
 * record, so the screen has to say the session is fine and the data is not.
 * The menu index, the categories screen and the option groups screen each
 * carry a verbatim copy of this block; the two item routes use this one
 * instead of adding a fourth and a fifth, in the spirit of ruling R17. The
 * three older copies are worth migrating to this component, but they belong
 * to other tasks' files and are not this task's to change.
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
