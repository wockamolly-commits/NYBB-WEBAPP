import type { MenuActionState } from "@/lib/staff/menu-types";

/**
 * The success/error line under a menu action form.
 *
 * Ruling R17: CategoryEditor.tsx (Task 6) and ItemHoldControl.tsx (Task 4) each
 * carried a verbatim copy of this component. This is the one copy for the menu
 * feature; Task 9's item editor is meant to be the next consumer, not another
 * copy. SettingsManager.tsx keeps its own near-identical component: it carries
 * AvailabilityActionState, a different feature's type, and is out of scope for
 * this branch.
 */
export function MenuStatusMessage({ state }: { state: MenuActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={state.status === "error" ? "text-nybb-orange mt-3 text-sm" : "text-nybb-yellow mt-3 text-sm"}
    >
      {state.message}
    </p>
  );
}
