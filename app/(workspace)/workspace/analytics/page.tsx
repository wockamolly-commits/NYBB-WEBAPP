import type { Metadata } from "next";
import { HeatMeter } from "@/components/menu/HeatMeter";
import { Button, ButtonLink } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { WorkspaceSelect, type WorkspaceSelectOption } from "@/components/ui/WorkspaceSelect";
import { formatPeso } from "@/lib/format";
import { getSalesReport } from "@/lib/staff/analytics";
import {
  analyticsFilterParams,
  datesReversed,
  discountRate,
  hasRanking,
  normalizeAnalyticsFilters,
  slotUtilization,
  type SalesReport,
} from "@/lib/staff/analytics-schema";
import { requireStaffPermission } from "@/lib/staff/session";
import { listAssignableBranches } from "@/lib/staff/team";
import { HourChart } from "./HourChart";

export const metadata: Metadata = { title: "Analytics" };

/**
 * The sales report, gated on analytics:view.
 *
 * Modelled on /workspace/audit, which is the closest existing screen in shape:
 * permission gated, read only, filters in a plain GET form so a view is a URL
 * somebody can send to the owner. Nothing here is a client component and
 * nothing writes.
 *
 * WHO SEES WHOSE NUMBERS.
 *
 * Decided by the database, not by this page. Migration 0062 pins a
 * branch-assigned caller to its own counter and ignores any branch argument
 * from them. Owner ruling, 2026-09-04: an assigned manager sees their own
 * counter, and an unassigned manager or the Super Admin sees the whole
 * business with a filter. This page draws the picker for the second kind and
 * nothing else; withholding it is a courtesy, and the function is the rule.
 * Hiding it were it to be shown anyway would cost nothing, because the
 * argument behind it is discarded.
 */

/** Seconds as "12m 30s", or "2m" when it lands on the minute. */
function duration(seconds: number | null): string {
  if (seconds === null) return "Not measured yet";
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  if (minutes === 0) return `${rest}s`;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function Tile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="bg-nybb-charcoal rounded-md p-4">
      <p className="type-caps text-nybb-bone/55">{label}</p>
      <p className="font-mono-tabular mt-2 text-2xl">{value}</p>
      {note ? <p className="text-nybb-bone/55 mt-1 text-xs">{note}</p> : null}
    </div>
  );
}

function Card({
  title,
  children,
  hint,
}: {
  title: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <section className="bg-nybb-charcoal rounded-md p-4 sm:p-5">
      <h2 className="font-display heading-panel">{title}</h2>
      {hint ? <p className="text-nybb-bone/55 mt-1 text-xs leading-relaxed">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * A ranked list, drawn as bars only when there is a ranking to draw.
 *
 * Shares are read against the top row rather than against the total, because
 * the question these answer is "what outsells what", and a share of the whole
 * basket would flatten nine flavours into nine indistinguishable slivers.
 *
 * Which is also why the bars come off when the rows are level. Reading against
 * the top row makes the top row full by construction, so a range where
 * everything tied drew a column of identical full bars: two items at one sale
 * each rendered as two maxed-out charts, and one flavour on its own rendered as
 * a flavour outselling a set containing only itself. A bar that is always full
 * is not a chart, it is an orange rule.
 *
 * So below two rows, or with no spread between the top and the bottom, the list
 * keeps its numbers and drops the bars, and says why rather than leaving the
 * reader to wonder where the chart went. This is not only a thin-data case that
 * volume will cure: one counter on one day ties constantly.
 */
function RankedBars({
  rows,
  empty,
}: {
  rows: readonly { name: string; qty: number; trailing?: React.ReactNode }[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-nybb-bone/55 text-sm">{empty}</p>;
  }
  const quantities = rows.map((row) => row.qty);
  const top = Math.max(...quantities, 1);
  const ranked = hasRanking(quantities);

  return (
    <>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.name}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm">{row.name}</span>
              <span className="font-mono-tabular text-nybb-bone/70 shrink-0 text-xs">
                {row.trailing ?? row.qty}
              </span>
            </div>
            {ranked ? (
              <div aria-hidden className="bg-nybb-graphite mt-1 h-1.5 w-full rounded-full">
                <span
                  className="bg-nybb-orange block h-full rounded-full"
                  style={{ width: `${Math.max((row.qty / top) * 100, 3)}%` }}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {ranked ? null : (
        <p className="text-nybb-bone/55 mt-3 text-xs">
          {rows.length === 1
            ? "One row, so there is nothing to rank it against yet."
            : "Every row here sold the same amount, so there is nothing to rank yet."}
        </p>
      )}
    </>
  );
}

function Report({ report }: { report: SalesReport }) {
  const utilization = slotUtilization(report.slots);
  const discounted = discountRate(report.discounts);
  const customers = report.customers.new + report.customers.returning;
  const returningShare =
    customers > 0 ? Math.round((report.customers.returning / customers) * 100) : null;
  const noShowShare =
    report.orders_count > 0
      ? Math.round((report.no_shows.orders / report.orders_count) * 100)
      : null;

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Orders"
          value={String(report.orders_count)}
          note={`${report.paid_count} paid for`}
        />
        <Tile
          label="Gross sales"
          value={formatPeso(report.gross_sales_cents)}
          note="Paid, and not refused"
        />
        <Tile label="Average order" value={formatPeso(report.avg_order_value_cents)} />
        <Tile
          label="Slot utilization"
          value={utilization === null ? "No windows" : `${utilization}%`}
          note={
            utilization === null
              ? "Nobody picked a pickup time in this range"
              : `${report.slots.reserved} of ${report.slots.capacity} places, across ${report.slots.windows} windows`
          }
        />
      </div>

      <HourChart report={report} />

      <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <Card
          title="Prep time"
          hint="From the moment the kitchen starts an order to the moment it is ready. The promise the platform makes."
        >
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="type-caps text-nybb-bone/55">Median</dt>
              <dd className="font-mono-tabular mt-1 text-xl">
                {duration(report.prep_seconds.median)}
              </dd>
            </div>
            <div>
              <dt className="type-caps text-nybb-bone/55">p90</dt>
              <dd className="font-mono-tabular mt-1 text-xl">
                {duration(report.prep_seconds.p90)}
              </dd>
            </div>
          </dl>
          <p className="text-nybb-bone/55 mt-3 text-xs">
            {report.prep_seconds.sample} {report.prep_seconds.sample === 1 ? "order" : "orders"} timed.
            Nine in ten were ready inside the p90.
          </p>
        </Card>

        <Card
          title="Waiting on the shelf"
          hint="From ready to collected. How long food sits before somebody takes it."
        >
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="type-caps text-nybb-bone/55">Median</dt>
              <dd className="font-mono-tabular mt-1 text-xl">
                {duration(report.wait_seconds.median)}
              </dd>
            </div>
            <div>
              <dt className="type-caps text-nybb-bone/55">p90</dt>
              <dd className="font-mono-tabular mt-1 text-xl">
                {duration(report.wait_seconds.p90)}
              </dd>
            </div>
          </dl>
          <p className="text-nybb-bone/55 mt-3 text-xs">
            {report.wait_seconds.sample} {report.wait_seconds.sample === 1 ? "order" : "orders"} collected.
          </p>
        </Card>

        <Card
          title="No-shows"
          hint="Paid for and never collected. The cost is what actually went back out as a settled refund."
        >
          <div className="flex items-baseline gap-4">
            <p className="font-mono-tabular text-2xl">{report.no_shows.orders}</p>
            {noShowShare !== null ? (
              <p className="text-nybb-bone/55 text-sm">{noShowShare}% of orders</p>
            ) : null}
          </div>
          <p className="text-nybb-bone/70 mt-2 text-sm">
            {formatPeso(report.no_shows.refunded_cents)} refunded
          </p>
        </Card>

        <Card
          title="New and returning"
          hint="People, not tickets: each phone number counts once however many times it ordered. Counted by number so a guest who never made an account still counts, and returning means that number had ordered before its first order in this range."
        >
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p>
              <span className="font-mono-tabular text-2xl">{report.customers.returning}</span>
              <span className="text-nybb-bone/55 ml-2 text-sm">returning</span>
            </p>
            <p>
              <span className="font-mono-tabular text-2xl">{report.customers.new}</span>
              <span className="text-nybb-bone/55 ml-2 text-sm">new</span>
            </p>
          </div>
          {returningShare !== null ? (
            <p className="text-nybb-bone/55 mt-2 text-xs">
              {returningShare}% of the people who ordered in this range had ordered before.
            </p>
          ) : null}
        </Card>

        <Card
          title="Discount check"
          hint="Compare this against the POS's own discount report for the same dates. Equal means the counter is applying them correctly. Lower there means a discount was forgotten and somebody was overcharged; higher means one was rung that no order asked for."
        >
          <p className="font-mono-tabular text-2xl">{formatPeso(report.discounts.given_cents)}</p>
          <p className="text-nybb-bone/70 mt-2 text-sm">
            {report.discounts.discounted_orders} of {report.discounts.rung_in_pos_orders}{" "}
            {report.discounts.rung_in_pos_orders === 1 ? "order" : "orders"} rung into the POS
            {discounted !== null ? ` (${discounted}%)` : ""}
          </p>
        </Card>

        <Card title="Heat mix" hint="Which levels the kitchen is actually cooking.">
          {report.heat_mix.length ? (
            <ul className="space-y-2">
              {report.heat_mix.map((row) => (
                <li key={`${row.name}-${row.heat_percent}`} className="flex items-center justify-between gap-3">
                  <HeatMeter percent={row.heat_percent} label={row.name} size="sm" />
                  <span className="font-mono-tabular text-nybb-bone/70 shrink-0 text-xs">
                    {row.qty}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-nybb-bone/55 text-sm">No heat levels were chosen in this range.</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Card title="Flavour mix" hint="Prep and inventory planning, by quantity sold.">
          <RankedBars rows={report.flavour_mix} empty="No flavours were chosen in this range." />
        </Card>

        <Card title="Top items" hint="By quantity, on paid orders the branch did not refuse.">
          <RankedBars
            rows={report.top_items.map((row) => ({
              name: row.item_name,
              qty: row.qty,
              trailing: `${row.qty} · ${formatPeso(row.sales_cents)}`,
            }))}
            empty="Nothing has been sold in this range."
          />
        </Card>
      </div>

      <div className="mt-4">
        <Card
          title="Top pairings"
          hint="Two different items on one ticket, counted once per order. Menu engineering: what to put beside what."
        >
          {report.top_pairings.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[24rem] text-sm">
                <thead>
                  <tr className="type-caps text-nybb-bone/55">
                    <th scope="col" className="py-2 text-left font-normal">Bought together</th>
                    <th scope="col" className="py-2 text-right font-normal">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {report.top_pairings.map((row) => (
                    <tr
                      key={`${row.first_item}-${row.second_item}`}
                      className="border-nybb-bone/15 border-t"
                    >
                      <td className="py-2 pr-3">
                        {row.first_item} <span className="text-nybb-bone/55">and</span>{" "}
                        {row.second_item}
                      </td>
                      <td className="font-mono-tabular py-2 text-right">{row.orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-nybb-bone/55 text-sm">
              No order in this range carried two different items.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ profile }, values] = await Promise.all([
    requireStaffPermission("analytics:view", "/workspace/analytics"),
    searchParams,
  ]);
  const filters = normalizeAnalyticsFilters(values);
  const reversed = datesReversed(filters);
  const report = await getSalesReport(filters);

  // Only a business-wide reader gets the picker. This is the same
  // profiles.branch_id that 0062 reads for the same session, not a second
  // opinion about it, so the control cannot appear for somebody the function
  // would then pin anyway. Asked here rather than taken from the report so the
  // filter form still holds its shape when the read fails.
  const branches = profile.branchId === null ? await listAssignableBranches() : null;
  const branchOptions: WorkspaceSelectOption<string>[] = [
    { value: "", label: "All branches" },
    ...(branches ?? []).map((branch) => ({ value: branch.id, label: branch.shortName })),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Sales report</p>
          <h1 className="font-display heading-major mt-2">Analytics</h1>
          <p className="text-nybb-bone/55 mt-2 max-w-2xl text-sm">
            Every figure below excludes staff test orders, and every peso is from an order that
            was actually paid for. Hours are the counter&rsquo;s own, Asia/Manila.
          </p>
        </div>
        <ButtonLink href="/workspace" tone="dark" variant="secondary">
          Back to dashboard
        </ButtonLink>
      </div>

      <form
        role="search"
        className="bg-nybb-charcoal mt-7 grid gap-4 rounded-md p-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <div>
          <WorkspaceFieldLabel htmlFor="analytics-from">From</WorkspaceFieldLabel>
          <WorkspaceInput id="analytics-from" name="from" type="date" defaultValue={filters.from} />
        </div>
        <div>
          <WorkspaceFieldLabel htmlFor="analytics-to">Through</WorkspaceFieldLabel>
          <WorkspaceInput id="analytics-to" name="to" type="date" defaultValue={filters.to} />
        </div>
        {branches ? (
          <WorkspaceSelect
            id="analytics-branch"
            name="branch"
            label="Counter"
            options={branchOptions}
            defaultValue={filters.branch}
            placeholder="All branches"
          />
        ) : null}
        <div className="flex items-end gap-2">
          <Button type="submit" tone="dark" className="flex-1">Filter</Button>
          <ButtonLink href="/workspace/analytics" tone="dark" variant="ghost">Reset</ButtonLink>
        </div>
      </form>

      {reversed ? (
        <p
          role="alert"
          className="border-nybb-orange/60 bg-nybb-orange/10 mt-4 rounded-md border p-4 text-sm leading-relaxed"
        >
          &ldquo;From&rdquo; is after &ldquo;Through&rdquo;, so nothing can fall between them. Swap
          the two dates to see the report.
        </p>
      ) : null}

      {report ? (
        <Report report={report} />
      ) : (
        <div role="alert" className="border-nybb-bone/30 mt-7 rounded-md border border-dashed p-5">
          <p className="font-display heading-panel">The report is unavailable</p>
          <p className="text-nybb-bone/60 mt-2 text-sm">
            The database could not be read. Your session is still valid, so try again.
          </p>
        </div>
      )}

      <p className="text-nybb-bone/55 mt-6 text-xs">
        Showing {filters.from} through {filters.to}.{" "}
        <a
          className="underline decoration-dotted underline-offset-4"
          href={`/workspace/analytics?${analyticsFilterParams(filters)}`}
        >
          Link to this view
        </a>
      </p>
    </div>
  );
}
