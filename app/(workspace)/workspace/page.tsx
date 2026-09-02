import { ArrowRight, ClipboardList } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { getWorkspaceSnapshot } from "@/lib/staff/dashboard";
import { workspaceLandingPath } from "@/lib/staff/roles";
import { hasStaffPermission, requireStaff } from "@/lib/staff/session";

export default async function WorkspaceDashboard() {
  const { profile } = await requireStaff();
  const landingPath = workspaceLandingPath(profile);
  if (landingPath !== "/workspace") redirect(landingPath);

  const snapshot = await getWorkspaceSnapshot(profile.branchId);
  const firstName = profile.displayName.trim().split(/\s+/)[0] || "team";
  const mayOpenBoard = hasStaffPermission(profile, "orders:view");

  /**
   * Every count is a place on the board, so every count is a link there.
   *
   * These were five dead numbers. A cashier reading "New 3" during a rush had
   * to look away from the figure that told them to act, find the nav, and tap
   * a different word. The number is now the control, and `hot` marks the two
   * columns that mean somebody is waiting on a person rather than on a fryer.
   */
  const cards = snapshot
    ? [
        { label: "Orders today", value: snapshot.total, hot: false },
        { label: "New", value: snapshot.pending, hot: snapshot.pending > 0 },
        { label: "Preparing", value: snapshot.preparing, hot: false },
        { label: "Ready", value: snapshot.ready, hot: snapshot.ready > 0 },
        { label: "Claimed", value: snapshot.claimed, hot: false },
      ]
    : [];

  return (
    <div>
      <p className="type-caps text-nybb-yellow">Today at New York Buffalo Brad&apos;s</p>
      <h1 className="font-display heading-major mt-3">Good shift, {firstName}</h1>
      <p className="text-nybb-bone/70 mt-3 max-w-2xl">
        What follows is today&apos;s count for the counter you work, from midnight Manila time.
        You see the pages your role allows, and the same check runs again on the server every
        time you open one.
      </p>

      {snapshot ? (
        <section aria-labelledby="today-heading" className="mt-8">
          <h2 id="today-heading" className="sr-only">Today&apos;s order counts</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cards.map((card) => {
              const body = (
                <>
                  <p className="type-caps text-nybb-bone/60">{card.label}</p>
                  <p
                    className={`mt-3 font-mono text-3xl tabular-nums ${card.hot ? "text-nybb-orange" : "text-nybb-bone"}`}
                  >
                    {card.value}
                    {card.hot ? <span className="sr-only">, waiting on the counter</span> : null}
                  </p>
                </>
              );
              // A lit edge as well as a lit numeral. Colour alone is the first
              // thing a bright kitchen and a colour-blind reader both lose.
              const surface = `bg-nybb-charcoal rounded-md p-4 sm:p-5 ${card.hot ? "ring-nybb-orange ring-1" : ""}`;

              return mayOpenBoard ? (
                <Link
                  key={card.label}
                  href="/workspace/orders"
                  className={`${surface} hover:bg-nybb-graphite block transition-colors duration-200`}
                >
                  {body}
                </Link>
              ) : (
                <div key={card.label} className={surface}>
                  {body}
                </div>
              );
            })}
          </div>
          {snapshot.testCount > 0 ? (
            <p className="text-nybb-bone/55 mt-3 text-xs">
              These counts leave out {snapshot.testCount} test{" "}
              {snapshot.testCount === 1 ? "order" : "orders"}, which the board still shows with a
              Test badge.
            </p>
          ) : null}
        </section>
      ) : (
        <div role="alert" className="border-nybb-bone/30 mt-8 rounded-md border border-dashed p-5">
          <p className="font-display heading-panel">Live order counts are unavailable</p>
          <p className="text-nybb-bone/60 mt-2 text-sm">Your staff session is valid. Refresh after the database connection recovers.</p>
        </div>
      )}

      {mayOpenBoard ? (
        <section className="bg-nybb-charcoal mt-8 grid items-center gap-5 rounded-md p-5 sm:grid-cols-[auto_1fr_auto] sm:p-6">
          <span className="bg-nybb-graphite text-nybb-orange grid size-12 place-items-center rounded-md">
            <ClipboardList aria-hidden className="size-6" />
          </span>
          <div>
            <h2 className="font-display heading-minor">Live orders board</h2>
            <p className="text-nybb-bone/70 mt-2 text-sm leading-relaxed">
              New, Preparing, Ready and Claimed, kept current on their own. Leave it open on the
              counter tablet.
            </p>
          </div>
          <ButtonLink href="/workspace/orders" tone="dark" variant="secondary">
            Open board <ArrowRight aria-hidden className="size-4" />
          </ButtonLink>
        </section>
      ) : null}
    </div>
  );
}
