"use client";

import { ChevronDown, ChevronUp, LoaderCircle, Save, SlidersHorizontal } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceToggle } from "@/components/ui/WorkspaceToggle";
import {
  PERMISSION_DESCRIPTIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
} from "@/lib/staff/permission-catalog";
import {
  panelRows,
  summarizePermissions,
  togglePending,
  type PendingChanges,
} from "@/lib/staff/permission-panel";
import { BUSINESS_WIDE_PERMISSIONS, type PermissionOverride } from "@/lib/staff/roles";
import type { PermissionActionState, WorkspaceMember } from "@/lib/staff/team-types";
import { setStaffPermissions } from "./actions";

const initialState: PermissionActionState = { status: "idle" };

export function MemberPermissions({
  member,
  overrides,
}: {
  member: WorkspaceMember;
  overrides: readonly PermissionOverride[];
}) {
  const [state, action, pending] = useActionState(setStaffPermissions, initialState);
  const [open, setOpen] = useState(false);

  /**
   * The switches that have been moved and not saved.
   *
   * A key is present only while it disagrees with what is stored, which
   * togglePending maintains, so moving a switch and moving it back leaves this
   * empty and Save has nothing to offer. That is also why the hidden fields
   * below can just be its entries: everything in here is a real change.
   */
  const [changes, setChanges] = useState<PendingChanges>({});

  // Cleared when a save lands, not by an effect. useActionState hands back a
  // new object per submission, so identity is the signal that one just
  // arrived; this is the same adjust-state-on-new-input pattern MemberCard
  // uses to close its revoke confirmation. Clearing on success is what makes
  // the panel fall back to the freshly revalidated props. Clearing on failure
  // would throw away what the person had asked for, so it does not.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.status === "success") setChanges({});
  }

  const rows = panelRows(member.staffRole, member.branchId, overrides, changes);
  const summary = summarizePermissions(member.staffRole, member.branchId, overrides, changes);
  const byPermission = new Map(rows.map((row) => [row.permission, row]));
  const panelId = `permissions-${member.profileId}`;
  const isAssigned = member.branchId !== null;
  const editable = member.isActive && !pending;

  return (
    <section
      aria-labelledby={`${panelId}-title`}
      className="border-nybb-bone/15 rounded-md border"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className="bg-nybb-bone/10 mt-0.5 grid size-8 flex-none place-items-center rounded-md"
          >
            <SlidersHorizontal className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 id={`${panelId}-title`} className="font-display text-base">
              Manage permissions
            </h3>
            <p className="text-nybb-bone/55 mt-1 text-sm">
              Override the role defaults for this member.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/*
            The changed count, not just the on count. The question being asked
            of this card is usually "has anybody been given something their job
            does not come with", and a bare "7/13 on" cannot answer it without
            opening every panel.
          */}
          <p className="text-nybb-bone/55 text-sm">
            {summary.on}/{summary.total} on
            {summary.changed > 0 ? `, ${summary.changed} changed` : null}
          </p>
          {/*
            Said in the heading as well as inside the panel, because the panel
            can be collapsed with changes still in it, and a change nobody can
            see is a change about to be lost.
          */}
          {summary.unsaved > 0 ? (
            <p className="text-nybb-orange text-sm font-semibold">
              {summary.unsaved} unsaved
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls={panelId}
            className="text-nybb-yellow flex items-center gap-1 text-sm font-semibold"
          >
            {open ? "Hide permissions" : "Show permissions"}
            {open ? (
              <ChevronUp aria-hidden className="size-4" />
            ) : (
              <ChevronDown aria-hidden className="size-4" />
            )}
          </button>
        </div>
      </div>

      <div id={panelId} hidden={!open}>
        {/*
          One form for the whole panel, submitted by Save and by nothing else.
          The switches are buttons that move React state; what is posted is the
          hidden field per moved switch below. It sits outside the role and
          branch form in MemberCard rather than inside it, because forms cannot
          nest: a nested one is dropped by the parser and its fields would end
          up in the role form.
        */}
        <form action={action} className="border-nybb-bone/15 border-t">
          <input type="hidden" name="profileId" value={member.profileId} />
          {Object.entries(changes).map(([permission, granted]) => (
            <input
              key={permission}
              type="hidden"
              name="change"
              value={`${permission}|${granted ? "on" : "off"}`}
            />
          ))}

          {PERMISSION_GROUPS.map((group) => {
            const groupRows = group.permissions.map((permission) => byPermission.get(permission)!);
            const onInGroup = groupRows.filter((row) => row.on).length;

            return (
              <div key={group.label}>
                <div className="bg-nybb-bone/5 flex items-center justify-between px-4 py-2">
                  <p className="type-caps text-nybb-bone/55 text-xs">{group.label}</p>
                  <p className="text-nybb-bone/55 text-xs">
                    {onInGroup}/{groupRows.length}
                  </p>
                </div>
                <ul>
                  {groupRows.map((row) => {
                    const labelId = `${panelId}-${row.permission.replace(":", "-")}`;
                    return (
                      <li
                        key={row.permission}
                        className="border-nybb-bone/10 flex items-start justify-between gap-4 border-b px-4 py-3 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p id={labelId} className="font-semibold">
                              {PERMISSION_LABELS[row.permission]}
                            </p>
                            {row.isDefault ? (
                              <span className="bg-nybb-bone/10 text-nybb-bone/55 rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider">
                                Default
                              </span>
                            ) : null}
                            {row.unsaved ? (
                              <span className="bg-nybb-orange/15 text-nybb-orange rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider">
                                Not saved
                              </span>
                            ) : null}
                          </div>
                          <p
                            id={`${labelId}-hint`}
                            className="text-nybb-bone/55 mt-1 text-sm leading-relaxed"
                          >
                            {PERMISSION_DESCRIPTIONS[row.permission]}
                            {/*
                              The one switch whose default needs explaining. A
                              manager pinned to a counter does not inherit the
                              catalog, because it is one shared list, so this
                              reads as off by default on their card while the
                              same switch on a roving manager reads as on.
                            */}
                            {isAssigned &&
                            (BUSINESS_WIDE_PERMISSIONS as readonly string[]).includes(
                              row.permission,
                            ) ? (
                              <span className="text-nybb-bone/55 mt-1 block">
                                The menu catalog is shared by every counter, so a member
                                assigned to one does not get this from their role. Switching
                                it on hands the whole catalog to this person.
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <WorkspaceToggle
                          on={row.on}
                          disabled={!editable}
                          aria-labelledby={labelId}
                          aria-describedby={`${labelId}-hint`}
                          onClick={() =>
                            setChanges((current) =>
                              togglePending(
                                member.staffRole,
                                member.branchId,
                                overrides,
                                current,
                                row.permission,
                              ),
                            )
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          <div className="border-nybb-bone/15 flex flex-wrap items-center gap-3 border-t p-4">
            <Button type="submit" tone="dark" disabled={!editable || summary.unsaved === 0}>
              {pending ? (
                <LoaderCircle
                  aria-hidden
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Save aria-hidden className="size-4" />
              )}
              {summary.unsaved > 0
                ? `Save ${summary.unsaved} change${summary.unsaved === 1 ? "" : "s"}`
                : "Save"}
            </Button>
            {summary.unsaved > 0 ? (
              <Button
                type="button"
                tone="dark"
                variant="ghost"
                disabled={!editable}
                onClick={() => setChanges({})}
              >
                Discard
              </Button>
            ) : null}

            {!member.isActive ? (
              <p className="text-nybb-bone/55 text-sm">
                This account is revoked. Restore it to change what it can reach.
              </p>
            ) : null}
            {state.status === "error" && state.message ? (
              <p role="alert" className="text-nybb-orange text-sm">
                {state.message} Nothing was saved.
              </p>
            ) : null}
            {state.status === "success" ? (
              <p role="status" className="text-nybb-yellow text-sm">
                {/*
                  What the database changed, which is not always what was
                  asked: a switch already sitting where it was put writes
                  nothing, and saying "1 saved" for it would be a small lie.
                */}
                {state.savedCount === 0
                  ? "Nothing needed changing."
                  : `Saved ${state.savedCount} permission${state.savedCount === 1 ? "" : "s"}.`}
              </p>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
