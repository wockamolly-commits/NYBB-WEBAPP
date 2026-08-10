"use client";

import { LoaderCircle, ShieldCheck, ShieldOff } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import {
  WorkspaceSelect,
  type WorkspaceSelectOption,
} from "@/components/ui/WorkspaceSelect";
import { STAFF_ROLES, type StaffJobRole } from "@/lib/staff/roles";
import type {
  WorkspaceAccessActionState,
  WorkspaceMember,
} from "@/lib/staff/team-types";
import { setWorkspaceAccess } from "./actions";

const initialState: WorkspaceAccessActionState = { status: "idle" };
const roleOptions = (Object.keys(STAFF_ROLES) as StaffJobRole[]).map(
  (role): WorkspaceSelectOption<StaffJobRole> => ({
    value: role,
    label: STAFF_ROLES[role].label,
    description: STAFF_ROLES[role].description,
  }),
);

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

function MemberCard({ member }: { member: WorkspaceMember }) {
  const [state, action, pending] = useActionState(setWorkspaceAccess, initialState);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const roleLabel = member.role === "admin"
    ? "Super Admin"
    : member.staffRole
      ? STAFF_ROLES[member.staffRole].label
      : "Staff";

  return (
    <li className="border-nybb-bone/15 grid gap-4 rounded-md border p-4 sm:grid-cols-[1fr_auto] sm:items-center">
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
        <p className="text-nybb-bone/70 mt-2 text-sm">{roleLabel}</p>
      </div>

      {member.role === "admin" ? (
        <p className="text-nybb-bone/45 max-w-64 text-xs leading-relaxed">
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
    </li>
  );
}

export function WorkspaceAccessManager({ members }: { members: WorkspaceMember[] }) {
  const [state, action, pending] = useActionState(setWorkspaceAccess, initialState);

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[22rem_1fr]">
      <section className="bg-nybb-charcoal rounded-md p-5" aria-labelledby="grant-access-title">
        <h2 id="grant-access-title" className="font-display heading-minor">Grant access</h2>
        <p className="text-nybb-bone/55 mt-3 text-sm leading-relaxed">
          The person must first sign in once through the regular website login so their account exists.
        </p>
        <form action={action} className="mt-5 space-y-4">
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
            <MemberCard
              key={`${member.profileId}:${member.staffRole}:${member.isActive}`}
              member={member}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
