import type { Metadata } from "next";
import { Building2, KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import { getStaffBranchLabel } from "@/lib/staff/profile";
import { STAFF_ROLES, type StaffPermission } from "@/lib/staff/roles";
import { requireStaff } from "@/lib/staff/session";

export const metadata: Metadata = {
  title: "Profile",
};

const PERMISSION_LABELS: Record<StaffPermission, string> = {
  "dashboard:view": "View dashboard",
  "orders:view": "View orders",
  "orders:manage": "Manage orders",
  "menu:view": "View menu",
  "menu:availability": "Change menu availability",
  "menu:configure": "Configure menu",
  "pos:manage": "Manage POS",
  "analytics:view": "View analytics",
  "vouchers:manage": "Manage vouchers",
  "store:availability": "Change store availability",
  "settings:manage": "Manage settings",
  "audit:view": "View audit log",
  "team:manage": "Manage team access",
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
      <p className="type-caps text-nybb-yellow">Signed-in profile</p>
      <h1 className="font-display heading-major mt-3">Your Workspace profile</h1>
      <p className="text-nybb-bone/60 mt-3 max-w-2xl leading-relaxed">
        These details and permissions are checked by the server whenever you use the Workspace.
      </p>

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
            <p className="text-nybb-bone/55 mt-1 text-sm">{roleLabel}</p>
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
        ) : (
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
        )}
      </section>
    </div>
  );
}
