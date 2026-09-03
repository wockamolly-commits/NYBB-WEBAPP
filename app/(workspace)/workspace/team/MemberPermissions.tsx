"use client";

import { ChevronDown, ChevronUp, LoaderCircle, SlidersHorizontal } from "lucide-react";
import { useActionState, useOptimistic, useState } from "react";
import { WorkspaceToggle } from "@/components/ui/WorkspaceToggle";
import {
  PERMISSION_DESCRIPTIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
} from "@/lib/staff/permission-catalog";
import { permissionRowState, summarizePermissions } from "@/lib/staff/permission-panel";
import { BUSINESS_WIDE_PERMISSIONS, type PermissionOverride } from "@/lib/staff/roles";
import type { PermissionActionState, WorkspaceMember } from "@/lib/staff/team-types";
import { setStaffPermission } from "./actions";

const initialState: PermissionActionState = { status: "idle" };

/**
 * Applying a pressed switch to the list of override rows, so that everything
 * downstream keeps working on the shape it already understands.
 *
 * The optimistic value is a row rather than a flag because that is what the
 * server is about to write, and because permissionRowState already reads a row
 * that agrees with the default as inherited. So an optimistic entry that lands
 * on the default shows the DEFAULT badge immediately, which is what the
 * database will make true a moment later by deleting the row.
 */
function withPressed(
  overrides: readonly PermissionOverride[],
  pressed: PermissionOverride,
): PermissionOverride[] {
  const rest = overrides.filter((row) => row.permission !== pressed.permission);
  return [...rest, pressed];
}

export function MemberPermissions({
  member,
  overrides,
}: {
  member: WorkspaceMember;
  overrides: readonly PermissionOverride[];
}) {
  const [state, action, pending] = useActionState(setStaffPermission, initialState);
  const [open, setOpen] = useState(false);
  const [shown, applyPressed] = useOptimistic(overrides, withPressed);

  const summary = summarizePermissions(member.staffRole, member.branchId, shown);
  const panelId = `permissions-${member.profileId}`;
  const isAssigned = member.branchId !== null;

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
          One form for all thirteen switches. Each switch is a submit button
          carrying its own name and value, which is what a submit sends, so
          there is no hidden field per row and no form per row. It sits outside
          the role and branch form in MemberCard rather than inside it, because
          forms cannot nest.
        */}
        <form
          action={(formData) => {
            const toggle = formData.get("toggle");
            if (typeof toggle === "string") {
              const [permission, next] = toggle.split("|");
              applyPressed({
                permission: permission as PermissionOverride["permission"],
                granted: next === "on",
              });
            }
            return action(formData);
          }}
          className="border-nybb-bone/15 border-t"
        >
          <input type="hidden" name="profileId" value={member.profileId} />

          {PERMISSION_GROUPS.map((group) => {
            const rows = group.permissions.map((permission) => ({
              permission,
              ...permissionRowState(member.staffRole, member.branchId, shown, permission),
            }));
            const onInGroup = rows.filter((row) => row.on).length;

            return (
              <div key={group.label}>
                <div className="bg-nybb-bone/5 flex items-center justify-between px-4 py-2">
                  <p className="type-caps text-nybb-bone/55 text-xs">{group.label}</p>
                  <p className="text-nybb-bone/55 text-xs">
                    {onInGroup}/{rows.length}
                  </p>
                </div>
                <ul>
                  {rows.map((row) => {
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
                          name="toggle"
                          value={`${row.permission}|${row.on ? "off" : "on"}`}
                          disabled={pending || !member.isActive}
                          aria-labelledby={labelId}
                          aria-describedby={`${labelId}-hint`}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          <div className="flex min-h-10 items-center gap-2 px-4 py-3">
            {pending ? (
              <LoaderCircle
                aria-hidden
                className="text-nybb-bone/55 size-4 animate-spin motion-reduce:animate-none"
              />
            ) : null}
            {!member.isActive ? (
              <p className="text-nybb-bone/55 text-sm">
                This account is revoked. Restore it to change what it can reach.
              </p>
            ) : null}
            {state.status === "error" && state.message ? (
              <p role="alert" className="text-nybb-orange text-sm">
                {state.message}
              </p>
            ) : null}
            {state.status === "success" && state.permission ? (
              <p role="status" className="text-nybb-yellow text-sm">
                {PERMISSION_LABELS[state.permission]} is now{" "}
                {state.granted ? "on" : "off"}.
              </p>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
