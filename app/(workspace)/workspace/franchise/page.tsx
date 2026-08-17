import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarClock, Mail, MapPin, Phone } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import {
  franchiseLeadParams,
  getFranchiseLeads,
  normalizeFranchiseLeadFilters,
  type FranchiseLead,
} from "@/lib/staff/franchise-leads";
import { requireStaff, WORKSPACE_HOME } from "@/lib/staff/session";
import { telHref } from "@/lib/phone";
import { LeadHandledControl } from "./LeadHandledControl";

export const metadata: Metadata = { title: "Franchise leads" };

function manilaDateTime(value: string): string {
  return new Date(value).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });
}

/**
 * Franchise leads from the public site.
 *
 * Gated on the admin role rather than on a staff permission, and that is the
 * database's decision rather than this page's. RLS on `franchise_inquiries` has
 * been `is_admin()` since 0022, so a staff member reaching this page would be
 * shown an empty list and told there are no leads, which is a lie. Matching the
 * rule here means the only people who see the page are the people who can see
 * the rows.
 */
export default async function FranchiseLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ profile }, values] = await Promise.all([
    requireStaff("/workspace/franchise"),
    searchParams,
  ]);
  if (profile.role !== "admin") redirect(WORKSPACE_HOME);

  const filters = normalizeFranchiseLeadFilters(values);
  const page = await getFranchiseLeads(filters);
  const olderHref = page?.olderCursor
    ? `/workspace/franchise?${franchiseLeadParams(filters, page.olderCursor)}`
    : null;
  const isPaged = filters.before !== "";
  const showingOpen = filters.scope === "open";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">From the website</p>
          <h1 className="font-display heading-major mt-2">Franchise leads</h1>
          <p className="text-nybb-bone/55 mt-2 max-w-2xl text-sm">
            People who asked about opening a franchise, newest first. Mark one handled once
            somebody has been in touch, so two people do not call the same person.
          </p>
        </div>
        <ButtonLink href="/workspace" tone="dark" variant="secondary">
          Back to dashboard
        </ButtonLink>
      </div>

      <form className="bg-nybb-charcoal mt-7 grid gap-4 rounded-md p-4 md:grid-cols-[2fr_1fr_auto]">
        <div>
          <WorkspaceFieldLabel htmlFor="lead-query">Search</WorkspaceFieldLabel>
          <WorkspaceInput
            id="lead-query"
            name="q"
            defaultValue={filters.query}
            maxLength={80}
            placeholder="Name, email, phone or location"
          />
        </div>
        <div>
          <WorkspaceFieldLabel htmlFor="lead-scope">Showing</WorkspaceFieldLabel>
          <select
            id="lead-scope"
            name="scope"
            defaultValue={filters.scope}
            className="border-nybb-bone/30 text-nybb-bone mt-2 h-11 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus:border-nybb-bone"
          >
            <option value="open" className="text-nybb-ink">Not yet handled</option>
            <option value="all" className="text-nybb-ink">Everything</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" tone="dark" className="flex-1">Filter</Button>
          <ButtonLink href="/workspace/franchise" tone="dark" variant="ghost">Reset</ButtonLink>
        </div>
      </form>

      {page ? (
        <>
          {page.leads.length ? (
            <div className="mt-6 space-y-3">
              {page.leads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
            </div>
          ) : (
            <div className="border-nybb-bone/25 mt-6 rounded-md border border-dashed px-4 py-12 text-center">
              <p className="font-display heading-panel">
                {isPaged
                  ? "No older leads"
                  : showingOpen
                    ? "Nothing waiting"
                    : "No leads yet"}
              </p>
              <p className="text-nybb-bone/50 mt-2 text-sm">
                {isPaged
                  ? "This is the end of the list for these filters."
                  : showingOpen
                    ? "Every lead has been handled. Switch to Everything to see them."
                    : "Inquiries from the franchise page appear here as they arrive."}
              </p>
            </div>
          )}

          {olderHref ? (
            <div className="mt-5 flex justify-center">
              <ButtonLink href={olderHref} tone="dark" variant="secondary">
                Load older
              </ButtonLink>
            </div>
          ) : null}
        </>
      ) : (
        <div role="alert" className="border-nybb-bone/30 mt-7 rounded-md border border-dashed p-5">
          <p className="font-display heading-panel">The leads could not be read</p>
          <p className="text-nybb-bone/60 mt-2 text-sm">
            The database could not be reached. Your session is still valid, so try again.
          </p>
        </div>
      )}
    </div>
  );
}

function LeadCard({ lead }: { lead: FranchiseLead }) {
  const handled = lead.handledAt !== null;

  return (
    <article className="bg-nybb-charcoal rounded-md p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display heading-panel">{lead.name}</h2>
          <p className="text-nybb-bone/55 mt-1 inline-flex items-center gap-1.5 text-xs">
            <CalendarClock aria-hidden className="text-nybb-orange size-3.5" />
            {manilaDateTime(lead.createdAt)}
          </p>
        </div>
        <LeadHandledControl id={lead.id} handled={handled} name={lead.name} />
      </div>

      {/* The contact details are the point of the row, so they are links rather
          than text: the person reading this is about to call or write. */}
      <div className="text-nybb-bone/75 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <a
          href={`mailto:${lead.email}`}
          className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
        >
          <Mail aria-hidden className="text-nybb-orange size-4" />
          {lead.email}
        </a>
        <a
          href={telHref(lead.phone)}
          className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
        >
          <Phone aria-hidden className="text-nybb-orange size-4" />
          {lead.phone}
        </a>
        {lead.city ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin aria-hidden className="text-nybb-orange size-4" />
            {lead.city}
          </span>
        ) : null}
      </div>

      {lead.message ? (
        <p className="text-nybb-bone/70 border-nybb-bone/15 mt-4 border-l-2 pl-3 text-sm leading-relaxed whitespace-pre-line">
          {lead.message}
        </p>
      ) : null}

      {handled ? (
        <p className="text-nybb-bone/45 mt-4 text-xs">
          Handled {manilaDateTime(lead.handledAt!)}
          {lead.handledByName ? ` by ${lead.handledByName}` : ""}
        </p>
      ) : null}
    </article>
  );
}
