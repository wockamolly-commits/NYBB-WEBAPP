import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { getWorkspaceMembers, listAssignableBranches } from "@/lib/staff/team";
import { requireStaff } from "@/lib/staff/session";
import { WorkspaceAccessManager } from "./WorkspaceAccessManager";

// Every other workspace page names its own tab. This one did not, so the
// browser tab for Workspace access read "Workspace", the same as the dashboard.
export const metadata: Metadata = { title: "Workspace access" };

export default async function WorkspaceTeamPage() {
  const { profile } = await requireStaff("/workspace/team");
  if (profile.role !== "admin") redirect("/workspace");

  const [members, branches] = await Promise.all([
    getWorkspaceMembers(),
    listAssignableBranches(),
  ]);

  return (
    <div>
      {/* The other admin pages carry a way back. This one sent you to the nav. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Super Admin controls</p>
          <h1 className="font-display heading-major mt-2">Workspace access</h1>
          <p className="text-nybb-bone/70 mt-3 max-w-2xl leading-relaxed">
            Grant only the access each team member needs. Every change is checked by the database
            and written to the audit log.
          </p>
        </div>
        <ButtonLink href="/workspace" tone="dark" variant="secondary">
          Back to dashboard
        </ButtonLink>
      </div>

      {members && branches ? (
        <WorkspaceAccessManager members={members} branches={branches} />
      ) : (
        <p role="alert" className="border-nybb-bone/30 mt-8 rounded-md border border-dashed p-5">
          Workspace access records are unavailable. Refresh after the database connection recovers.
        </p>
      )}
    </div>
  );
}
