import type { Metadata } from "next";
import { CalendarClock, ShieldAlert, UserRound } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import {
  auditFilterParams,
  getAuditLog,
  normalizeAuditFilters,
  type AuditLogEntry,
} from "@/lib/staff/audit-log";
import { requireStaffPermission } from "@/lib/staff/session";

export const metadata: Metadata = { title: "Audit log" };

/**
 * The action strings are written by the database, in one vocabulary, so the
 * screen can afford to name them. An unmapped action falls back to the raw
 * string rather than to a blank: an audit trail that hides an entry it does
 * not recognise is worse than one that shows an ugly one.
 *
 * This map used to cover ten of the twenty-three actions the migrations
 * actually write, and the thirteen it missed were the ones a manager comes
 * here for: every refund, every pause, every change to hours. The fallback
 * meant the log worked, and read like a stack trace. Keep this list level with
 * `grep -ohE "'[a-z_]+\.[a-z_]+'" supabase/migrations/*.sql`.
 */
const ACTION_LABELS: Record<string, string> = {
  // Orders
  "order.accepted": "Order accepted",
  "order.started": "Order started",
  "order.ready": "Order marked ready",
  "order.claimed": "Order claimed at the counter",
  "order.rejected": "Order refused by the branch",
  "order.zenpos_entry_recorded": "Order entered into the POS",
  // Money
  "refund.requested": "Refund requested",
  "refund.succeeded": "Refund completed",
  "refund.failed": "Refund failed",
  // The shop
  "store.orders_paused": "Counter paused",
  "store.orders_resumed": "Counter resumed",
  "store.hours_changed": "Opening hours changed",
  "store.hours_cleared": "Opening hours cleared",
  "store.branch_settings_changed": "Branch settings changed",
  "store.order_intake_changed": "Business-wide intake changed",
  // Access
  "workspace.access_granted": "Workspace access granted",
  "workspace.access_reactivated": "Workspace access restored",
  "workspace.access_revoked": "Workspace access revoked",
  "workspace.role_changed": "Workspace role changed",
  "workspace.branch_changed": "Workspace branch changed",
  "workspace.access_confirmed": "Workspace access confirmed",
  "workspace.permission_granted": "Permission granted",
  "workspace.permission_revoked": "Permission revoked",
  "workspace.permission_inherited": "Permission back to role default",
  "workspace.kitchen_role_retired": "Kitchen role retired",
  "staff.super_admin_bootstrapped": "Super Admin provisioned",
  "staff.super_admin_revoked_by_configuration": "Super Admin replaced by configuration",
  // The menu
  "menu.category.created": "Menu category created",
  "menu.category.updated": "Menu category changed",
  "menu.category.deleted": "Menu category deleted",
  "menu.item.created": "Menu item created",
  "menu.item.updated": "Menu item changed",
  "menu.item.deleted": "Menu item deleted",
  "menu.item.held": "Menu item marked sold out",
  "menu.item.released": "Menu item back on the menu",
  "menu.item.image_changed": "Menu item photograph changed",
  "menu.item.option_prices_set": "Option prices by size changed",
  "menu.option.created": "Menu option created",
  "menu.option.updated": "Menu option changed",
  "menu.option.deleted": "Menu option deleted",
  "menu.option.image_changed": "Menu option photograph changed",
  "menu.option_group.created": "Option group created",
  "menu.option_group.updated": "Option group changed",
  "menu.option_group.deleted": "Option group deleted",
  "menu.reordered": "Menu order changed",
  // Machinery
  "cron.job": "Scheduled job ran",
};

function manilaDateTime(value: string): string {
  return new Date(value).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });
}

function actorRoleLabel(entry: AuditLogEntry): string {
  if (entry.actorRole === "admin") return "Super Admin";
  if (entry.actorRole === "staff") return "Staff";
  return "System";
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [, values] = await Promise.all([
    requireStaffPermission("audit:view", "/workspace/audit"),
    searchParams,
  ]);
  const filters = normalizeAuditFilters(values);
  const datesReversed = filters.from !== "" && filters.to !== "" && filters.from > filters.to;
  const page = await getAuditLog(filters);
  const olderHref = page?.olderCursor
    ? `/workspace/audit?${auditFilterParams(filters, page.olderCursor)}`
    : null;
  const isPaged = filters.before !== "";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Recorded activity</p>
          <h1 className="font-display heading-major mt-2">Audit log</h1>
          <p className="text-nybb-bone/55 mt-2 max-w-2xl text-sm">
            Every staff action the database recorded, newest first. Entries tied to a
            counter are scoped to the branches you work.
          </p>
        </div>
        <ButtonLink href="/workspace" tone="dark" variant="secondary">
          Back to dashboard
        </ButtonLink>
      </div>

      <form role="search" className="bg-nybb-charcoal mt-7 grid gap-4 rounded-md p-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <WorkspaceFieldLabel htmlFor="audit-query">Search</WorkspaceFieldLabel>
          <WorkspaceInput
            id="audit-query"
            name="q"
            defaultValue={filters.query}
            maxLength={80}
            placeholder="Action or target id"
          />
        </div>
        <div>
          <WorkspaceFieldLabel htmlFor="audit-from">Recorded from</WorkspaceFieldLabel>
          <WorkspaceInput id="audit-from" name="from" type="date" defaultValue={filters.from} />
        </div>
        <div>
          <WorkspaceFieldLabel htmlFor="audit-to">Recorded through</WorkspaceFieldLabel>
          <WorkspaceInput id="audit-to" name="to" type="date" defaultValue={filters.to} />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" tone="dark" className="flex-1">Filter</Button>
          <ButtonLink href="/workspace/audit" tone="dark" variant="ghost">Reset</ButtonLink>
        </div>
      </form>

      {datesReversed ? (
        <p
          role="alert"
          className="border-nybb-orange/60 bg-nybb-orange/10 mt-4 rounded-md border p-4 text-sm leading-relaxed"
        >
          &ldquo;Recorded from&rdquo; is after &ldquo;Recorded through&rdquo;, so nothing can fall
          between them. Swap the two dates to see results.
        </p>
      ) : null}

      {page ? (
        <>
          {page.entries.length ? (
            <div className="mt-6 space-y-3">
              {page.entries.map((entry) => (
                <AuditEntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="border-nybb-bone/25 mt-6 rounded-md border border-dashed px-4 py-12 text-center">
              <p className="font-display heading-panel">
                {isPaged ? "No older entries" : "No recorded activity"}
              </p>
              <p className="text-nybb-bone/60 mt-2 text-sm">
                {isPaged
                  ? "This is the end of the trail for these filters."
                  : "Nothing matches these filters yet. Staff actions appear here as they happen."}
              </p>
            </div>
          )}

          {/*
            "Load older" was the only control here, so the trail ran one way.
            Three pages in, the way back to the top was the browser's own back
            button pressed three times, or Reset, which also threw away the
            filters that got you there.
          */}
          {olderHref || isPaged ? (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {isPaged ? (
                <ButtonLink
                  href={`/workspace/audit?${auditFilterParams(filters, null)}`}
                  tone="dark"
                  variant="ghost"
                >
                  Back to newest
                </ButtonLink>
              ) : null}
              {olderHref ? (
                <ButtonLink href={olderHref} tone="dark" variant="secondary">
                  Load older
                </ButtonLink>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <div role="alert" className="border-nybb-bone/30 mt-7 rounded-md border border-dashed p-5">
          <p className="font-display heading-panel">The audit log is unavailable</p>
          <p className="text-nybb-bone/60 mt-2 text-sm">
            The database could not be read. Your session is still valid, so try again.
          </p>
        </div>
      )}
    </div>
  );
}

function AuditEntryCard({ entry }: { entry: AuditLogEntry }) {
  const label = ACTION_LABELS[entry.action] ?? entry.action;
  const hasDetail = entry.detail !== null && Object.keys(entry.detail).length > 0;

  return (
    <article className="bg-nybb-charcoal rounded-md p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display heading-panel">{label}</h2>
          <p className="text-nybb-bone/55 mt-1 font-mono text-xs break-all">
            {entry.action} · {entry.targetTable}
            {entry.targetId ? ` · ${entry.targetId}` : ""}
          </p>
        </div>
        <p className="text-nybb-bone/55 inline-flex items-center gap-1.5 text-xs">
          <CalendarClock aria-hidden className="text-nybb-orange size-3.5" />
          {manilaDateTime(entry.createdAt)}
        </p>
      </div>

      <div className="text-nybb-bone/70 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <span className="inline-flex items-center gap-1.5">
          {entry.actorName ? (
            <UserRound aria-hidden className="text-nybb-orange size-4" />
          ) : (
            <ShieldAlert aria-hidden className="text-nybb-orange size-4" />
          )}
          {entry.actorName ?? "System or an account no longer in the workspace"}
        </span>
        <span className="bg-nybb-graphite text-nybb-bone/70 rounded px-2 py-1 text-xs font-medium">
          {actorRoleLabel(entry)}
        </span>
        <span className="text-nybb-bone/55 text-xs">
          {entry.branchName ?? "Business wide"}
        </span>
      </div>

      {hasDetail ? (
        <details className="border-nybb-bone/15 mt-4 rounded-md border">
          <summary className="type-caps text-nybb-bone/70 hover:text-nybb-bone flex min-h-11 cursor-pointer items-center px-3">
            What changed
          </summary>
          <pre className="border-nybb-bone/15 text-nybb-bone/80 overflow-x-auto border-t px-3 py-3 text-xs leading-relaxed">
            {JSON.stringify(entry.detail, null, 2)}
          </pre>
        </details>
      ) : null}
    </article>
  );
}
