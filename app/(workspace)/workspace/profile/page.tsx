import type { Metadata } from "next";
import { Building2, KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import { WorkspaceSignOut } from "@/components/workspace/WorkspaceSignOut";
import { getStaffBranchLabel } from "@/lib/staff/profile";
import { PERMISSION_LABELS } from "@/lib/staff/permission-catalog";
import { STAFF_ROLES } from "@/lib/staff/roles";
import { requireStaff } from "@/lib/staff/session";

export const metadata: Metadata = {
  title: "Profile",
};


export default async function WorkspaceProfilePage() {
  const { user, profile } = await requireStaff("/workspace/profile");
  const branchLabel = await getStaffBranchLabel(profile.branchId);
  const roleLabel =
    profile.role === "admin"
      ? "Super Admin"
      : profile.staffRole
        ? STAFF_ROLES[profile.staffRole].label
        : "Staff";

  return (
    <div>
      {/*
        Signing out lived only as an unlabelled icon in the header. This is the
        page a person opens when the question is "who am I signed in as", and
        the answer is very often followed by "not me".
      */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Signed-in profile</p>
          <h1 className="font-display heading-major mt-3">Your Workspace profile</h1>
          <p className="text-nybb-bone/70 mt-3 max-w-2xl leading-relaxed">
            These details and permissions are checked by the server whenever you use the
            Workspace. To change your name, your branch or what you can reach, ask the Super
            Admin: none of it can be edited from here.
          </p>
        </div>
        <WorkspaceSignOut withLabel />
      </div>

      <section
        aria-labelledby="profile-details"
        className="bg-nybb-charcoal mt-8 rounded-md p-5 sm:p-6"
      >
        <div className="flex items-center gap-3">
          <span className="bg-nybb-graphite text-nybb-orange grid size-12 place-items-center rounded-md">
            <UserRound aria-hidden className="size-6" />
          </span>
          <div>
            <h2 id="profile-details" className="font-display heading-minor">
              {profile.displayName}
            </h2>
            <p className="text-nybb-bone/70 mt-1 text-sm">{roleLabel}</p>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="border-nybb-bone/15 rounded-md border p-4">
            <dt className="type-caps text-nybb-bone/55 flex items-center gap-2">
              <Mail aria-hidden className="size-4" /> Email
            </dt>
            <dd className="mt-2 break-all text-sm">{user.email ?? "Verified account"}</dd>
          </div>
          <div className="border-nybb-bone/15 rounded-md border p-4">
            <dt className="type-caps text-nybb-bone/55 flex items-center gap-2">
              <ShieldCheck aria-hidden className="size-4" /> Role
            </dt>
            <dd className="mt-2 text-sm">{roleLabel}</dd>
          </div>
          <div className="border-nybb-bone/15 rounded-md border p-4 sm:col-span-2 lg:col-span-1">
            <dt className="type-caps text-nybb-bone/55 flex items-center gap-2">
              <Building2 aria-hidden className="size-4" /> Branch access
            </dt>
            <dd className="mt-2 text-sm">{branchLabel}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="profile-permissions" className="mt-8">
        <div className="flex items-center gap-3">
          <KeyRound aria-hidden className="text-nybb-orange size-5" />
          <h2 id="profile-permissions" className="font-display heading-minor">
            Permissions
          </h2>
        </div>
        {profile.role === "admin" ? (
          <p className="bg-nybb-charcoal text-nybb-bone/70 mt-4 rounded-md p-5 text-sm">
            Full Workspace access
          </p>
        ) : profile.permissions.length ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {profile.permissions.map((permission) => (
              <li
                key={permission}
                className="border-nybb-bone/15 bg-nybb-charcoal rounded-md border px-4 py-3 text-sm"
              >
                {PERMISSION_LABELS[permission]}
              </li>
            ))}
          </ul>
        ) : (
          // Reachable: every permission a role grants can be revoked one at a
          // time by an override. This is also the page such a person lands on,
          // so an empty list with no sentence under it was the whole workspace.
          <p
            role="status"
            className="border-nybb-bone/30 text-nybb-bone/70 mt-4 rounded-md border border-dashed p-5 text-sm"
          >
            You have no Workspace permissions yet, so there is nothing here to open. Ask the
            Super Admin to grant the access your shift needs.
          </p>
        )}
      </section>
    </div>
  );
}
