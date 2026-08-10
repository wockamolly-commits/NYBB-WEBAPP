import { redirect } from "next/navigation";
import { getWorkspaceMembers } from "@/lib/staff/team";
import { requireStaff } from "@/lib/staff/session";
import { WorkspaceAccessManager } from "./WorkspaceAccessManager";

export default async function WorkspaceTeamPage() {
  const { profile } = await requireStaff("/workspace/team");
  if (profile.role !== "admin") redirect("/workspace");

  const members = await getWorkspaceMembers();

  return (
    <div>
      <p className="type-caps text-nybb-yellow">Super Admin controls</p>
      <h1 className="font-display heading-major mt-3">Workspace access</h1>
      <p className="text-nybb-bone/60 mt-3 max-w-2xl leading-relaxed">
        Grant only the access each team member needs. Every change is checked by the database and
        written to the audit log.
      </p>

      {members ? (
        <WorkspaceAccessManager members={members} />
      ) : (
        <p role="alert" className="border-nybb-bone/30 mt-8 rounded-md border border-dashed p-5">
          Workspace access records are unavailable. Refresh after the database connection recovers.
        </p>
      )}
    </div>
  );
}
