"use client";

import { LoaderCircle, ShieldCheck, ShieldOff } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import {
  WorkspaceSelect,
  type WorkspaceSelectOption,
} from "@/components/ui/WorkspaceSelect";
import {
  STAFF_JOB_ROLES,
  STAFF_ROLES,
  type PermissionOverride,
  type StaffJobRole,
} from "@/lib/staff/roles";
import { ALL_BRANCHES } from "@/lib/staff/team-schemas";
import type {
  AssignableBranch,
  WorkspaceAccessActionState,
  WorkspaceMember,
} from "@/lib/staff/team-types";
import { MemberPermissions } from "./MemberPermissions";
import { setWorkspaceAccess } from "./actions";

const initialState: WorkspaceAccessActionState = { status: "idle" };
const roleOptions = STAFF_JOB_ROLES.map(
  (role): WorkspaceSelectOption<StaffJobRole> => ({
    value: role,
    label: STAFF_ROLES[role].label,
    description: STAFF_ROLES[role].description,
  }),
);

/**
 * The branch choices, roving first.
 *
 * Eight of the nine counters are not trading yet, and an assignment to one of
 * them is legitimate (it is how a new shop is staffed before it opens), so they
 * are offered rather than hidden, with the state said out loud.
 */
function branchOptions(branches: AssignableBranch[]): WorkspaceSelectOption<string>[] {
  return [
    {
      value: ALL_BRANCHES,
      label: "All branches",
      description: "Business wide. Every counter, and the shared menu catalog.",
    },
    ...branches.map((branch) => ({
      value: branch.id,
      label: branch.isActive ? branch.shortName : `${branch.shortName} (not trading)`,
    })),
  ];
}

function branchLabel(branchId: string | null, branches: AssignableBranch[]): string {
  if (!branchId) return "All branches";
  return branches.find((branch) => branch.id === branchId)?.shortName ?? "Unknown branch";
}

function ActionMessage({ state }: { state: WorkspaceAccessActionState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={state.status === "error" ? "text-nybb-orange text-sm" : "text-nybb-yellow text-sm"}
    >
      {state.message}
    </p>
  );
}

function MemberCard({
  member,
  branches,
  overrides,
}: {
  member: WorkspaceMember;
  branches: AssignableBranch[];
  overrides: readonly PermissionOverride[];
}) {
  const [state, action, pending] = useActionState(setWorkspaceAccess, initialState);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  // The card no longer remounts on save, so the open confirmation has to be
  // closed deliberately rather than by accident of a changing key. Done during
  // render off a change in the action result rather than in an effect, which
  // is the adjust-state-on-new-input pattern: useActionState hands back a new
  // object per submission, so identity is the signal that one just landed.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.status === "success") setConfirmingRevoke(false);
  }
  const roleLabel = member.role === "admin"
    ? "Super Admin"
    : member.staffRole
      ? STAFF_ROLES[member.staffRole].label
      : "Staff";

  return (
    /* Stacked, not two columns. The controls used to be a role select and a
       button, which sat beside the name comfortably. A third control took the
       row past the width of the card, and since the controls column sizes to
       its own content and will not shrink, the name column was the thing that
       gave: "Cashier at Central Bloc, IT Park" wrapped one word per line under
       an overlapping heading. */
    <li className="border-nybb-bone/15 grid gap-4 rounded-md border p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-lg">{member.displayName}</p>
          <span
            className={
              member.isActive
                ? "bg-nybb-yellow/15 text-nybb-yellow rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider"
                : "bg-nybb-bone/10 text-nybb-bone/55 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider"
            }
          >
            {member.isActive ? "Active" : "Revoked"}
          </span>
        </div>
        <p className="text-nybb-bone/55 mt-1 truncate text-sm">{member.email}</p>
        <p className="text-nybb-bone/70 mt-2 text-sm">
          {roleLabel}
          <span className="text-nybb-bone/55"> at {branchLabel(member.branchId, branches)}</span>
        </p>
      </div>

      {member.role === "admin" ? (
        <p className="text-nybb-bone/55 max-w-prose text-xs leading-relaxed">
          The Super Admin is controlled by server configuration and cannot be changed here.
        </p>
      ) : (
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="email" value={member.email} />
          <WorkspaceSelect
            id={`role-${member.profileId}`}
            name="staffRole"
            label="Role"
            options={roleOptions}
            defaultValue={member.staffRole ?? "cashier"}
            disabled={pending}
            className="min-w-44"
          />
          <WorkspaceSelect
            id={`branch-${member.profileId}`}
            name="branchId"
            label="Branch"
            options={branchOptions(branches)}
            defaultValue={member.branchId ?? ALL_BRANCHES}
            disabled={pending}
            className="min-w-52"
          />
          <Button
            type="submit"
            tone="dark"
            variant="secondary"
            disabled={pending}
            name="active"
            value="true"
          >
            {pending ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <ShieldCheck aria-hidden className="size-4" />
            )}
            {member.isActive ? "Save role" : "Restore"}
          </Button>
          {member.isActive && !confirmingRevoke ? (
            <Button
              type="button"
              tone="dark"
              variant="danger"
              disabled={pending}
              onClick={() => setConfirmingRevoke(true)}
            >
              <ShieldOff aria-hidden className="size-4" />
              Revoke
            </Button>
          ) : null}
          {member.isActive && confirmingRevoke ? (
            <div
              role="group"
              aria-labelledby={`revoke-${member.profileId}`}
              className="border-nybb-orange/60 bg-nybb-orange/10 basis-full rounded-md border p-3"
            >
              <p id={`revoke-${member.profileId}`} className="text-sm leading-relaxed">
                Revoke {member.displayName}&apos;s Workspace access?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="submit"
                  tone="dark"
                  variant="danger"
                  disabled={pending}
                  name="active"
                  value="false"
                >
                  <ShieldOff aria-hidden className="size-4" />
                  Confirm revoke
                </Button>
                <Button
                  type="button"
                  tone="dark"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setConfirmingRevoke(false)}
                >
                  Keep access
                </Button>
              </div>
            </div>
          ) : null}
          <div className="basis-full"><ActionMessage state={state} /></div>
        </form>
      )}

      {/*
        A sibling of the form above, never a child of it: forms cannot nest,
        and this one has thirteen submit buttons of its own. The Super Admin's
        own card gets the note instead, the same way the role controls do.
      */}
      {member.role === "admin" ? null : (
        <MemberPermissions member={member} overrides={overrides} />
      )}
    </li>
  );
}

export function WorkspaceAccessManager({
  members,
  branches,
  overrides,
}: {
  members: WorkspaceMember[];
  branches: AssignableBranch[];
  /** Every override row, by profile id. Absent means the person has none. */
  overrides: Map<string, PermissionOverride[]>;
}) {
  const [state, action, pending] = useActionState(setWorkspaceAccess, initialState);
  const grantForm = useRef<HTMLFormElement>(null);

  // An email left sitting in the box after a successful grant is an invitation
  // to grant the same person again, and the second attempt reads as a failure
  // to anybody who does not know it already worked.
  useEffect(() => {
    if (state.status === "success") grantForm.current?.reset();
  }, [state.status]);

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[22rem_1fr]">
      <section className="bg-nybb-charcoal rounded-md p-5" aria-labelledby="grant-access-title">
        <h2 id="grant-access-title" className="font-display heading-minor">Grant access</h2>
        <p className="text-nybb-bone/55 mt-3 text-sm leading-relaxed">
          The person must first sign in once through the regular website login so their account exists.
        </p>
        <form ref={grantForm} action={action} className="mt-5 space-y-4">
          <input type="hidden" name="active" value="true" />
          <div>
            <WorkspaceFieldLabel htmlFor="team-email">Email address</WorkspaceFieldLabel>
            <WorkspaceInput
              id="team-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="team@example.com"
            />
          </div>
          <WorkspaceSelect
            id="team-role"
            name="staffRole"
            label="Workspace role"
            options={roleOptions}
            defaultValue="cashier"
          />
          {/* No preselected branch. Where somebody works is the whole point of
              this form, so it is a decision to make rather than a default to
              leave alone. */}
          <WorkspaceSelect
            id="team-branch"
            name="branchId"
            label="Branch"
            options={branchOptions(branches)}
            defaultValue={null}
            placeholder="Choose a branch"
          />
          <Button type="submit" tone="dark" block disabled={pending}>
            {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <ShieldCheck aria-hidden className="size-4" />}
            Grant Workspace access
          </Button>
          <ActionMessage state={state} />
        </form>
      </section>

      <section aria-labelledby="access-list-title">
        <div>
          <h2 id="access-list-title" className="font-display heading-minor">Authorized accounts</h2>
          <p className="text-nybb-bone/55 mt-3 text-sm">
            Revocation takes effect on the next Workspace request, even if the user is still signed in.
          </p>
        </div>
        <ul className="mt-5 space-y-3">
          {members.map((member) => (
            /*
              Keyed on the person, and on nothing that changes when you edit
              them. The key used to carry staffRole and isActive, and later the
              branch as well, so the first thing a successful save did was
              change the key, remount the card and throw away the "Workspace
              access saved." it had just been handed. An admin changed a role
              and watched nothing happen.

              Nothing is lost by dropping them. The summary line and the button
              label read from props, which the revalidation refreshes in place,
              and each select is already showing the value the admin just
              picked.
            */
            <MemberCard
              key={member.profileId}
              member={member}
              branches={branches}
              overrides={overrides.get(member.profileId) ?? []}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
