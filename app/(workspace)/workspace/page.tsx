import { ArrowRight, ClipboardList } from "lucide-react";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { getWorkspaceSnapshot } from "@/lib/staff/dashboard";
import { workspaceLandingPath } from "@/lib/staff/roles";
import { requireStaff } from "@/lib/staff/session";

export default async function WorkspaceDashboard() {
  const { profile } = await requireStaff();
  const landingPath = workspaceLandingPath(profile);
  if (landingPath !== "/workspace") redirect(landingPath);

  const snapshot = await getWorkspaceSnapshot(profile.branchId);
  const firstName = profile.displayName.trim().split(/\s+/)[0] || "team";

  const cards = snapshot
    ? [
        { label: "Orders today", value: snapshot.total },
        { label: "New", value: snapshot.pending, hot: snapshot.pending > 0 },
        { label: "Preparing", value: snapshot.preparing },
        { label: "Ready", value: snapshot.ready, hot: snapshot.ready > 0 },
        { label: "Claimed", value: snapshot.claimed },
      ]
    : [];

  return (
    <div>
      <p className="type-caps text-nybb-yellow">Today at New York Buffalo Brad&apos;s</p>
      <h1 className="font-display heading-major mt-3">Good shift, {firstName}</h1>
      <p className="text-nybb-bone/60 mt-3 max-w-2xl">
        This workspace is live against the operations role on your staff profile. Orders and Team
        controls stay on the same server-checked permission boundary.
      </p>

      {snapshot ? (
        <section aria-labelledby="today-heading" className="mt-8">
          <h2 id="today-heading" className="sr-only">Today&apos;s order counts</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cards.map((card) => (
              <div key={card.label} className="bg-nybb-charcoal rounded-md p-4 sm:p-5">
                <p className="type-caps text-nybb-bone/55">{card.label}</p>
                <p className={`mt-3 font-mono text-3xl tabular-nums ${card.hot ? "text-nybb-orange" : "text-nybb-bone"}`}>
                  {card.value}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="border-nybb-bone/30 mt-8 rounded-md border border-dashed p-5">
          <p className="font-display heading-panel">Live order counts are unavailable</p>
          <p className="text-nybb-bone/60 mt-2 text-sm">Your staff session is valid. Refresh after the database connection recovers.</p>
        </div>
      )}

      <section className="bg-nybb-charcoal mt-8 grid items-center gap-5 rounded-md p-5 sm:grid-cols-[auto_1fr_auto] sm:p-6">
        <span className="bg-nybb-graphite text-nybb-orange grid size-12 place-items-center rounded-md">
          <ClipboardList aria-hidden className="size-6" />
        </span>
        <div>
          <h2 className="font-display heading-minor">Live orders board</h2>
          <p className="text-nybb-bone/60 mt-2 text-sm leading-relaxed">New, Preparing, Ready, and Claimed stay current through realtime with a polling fallback.</p>
        </div>
        <ButtonLink href="/workspace/orders" tone="dark" variant="secondary">
          Open board <ArrowRight aria-hidden className="size-4" />
        </ButtonLink>
      </section>
    </div>
  );
}
