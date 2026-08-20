import type { Metadata } from "next";
import { Button, ButtonLink } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { WorkspaceSelect, type WorkspaceSelectOption } from "@/components/ui/WorkspaceSelect";
import { formatPeso } from "@/lib/format";
import { describePayment } from "@/lib/staff/board";
import { canIssueRefund, reservedRefundCents } from "@/lib/staff/refunds";
import {
  getOrderHistory,
  ORDER_HISTORY_LIMIT,
  normalizeOrderHistoryFilters,
  summarizeOrderHistory,
  type OrderHistoryEntry,
  type OrderHistoryStatus,
} from "@/lib/staff/order-history";
import { hasStaffPermission, requireStaffPermission } from "@/lib/staff/session";
import { RefundControl } from "../RefundControl";

export const metadata: Metadata = { title: "Order history" };

const statusOptions: readonly WorkspaceSelectOption<"all" | OrderHistoryStatus>[] = [
  { value: "all", label: "All closed orders" },
  { value: "claimed", label: "Claimed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No-show" },
];

const statusLabels: Record<OrderHistoryStatus, string> = {
  claimed: "Claimed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  no_show: "No-show",
};

function manilaDateTime(value: string): string {
  return new Date(value).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });
}

function paymentLabel(order: OrderHistoryEntry): string {
  return describePayment(order.payment, { settled: true });
}

function refundLabel(order: OrderHistoryEntry): string | null {
  if (!order.payment?.refunds.length) return null;
  const refunded = order.payment.refunds
    .filter((refund) => refund.status === "succeeded")
    .reduce((sum, refund) => sum + refund.amountCents, 0);
  if (order.payment.refunds.some((refund) => refund.status === "pending")) {
    return "Refund awaiting confirmation";
  }
  // "Refund not completed" read as though it were still in progress. Every
  // refund on this order is finished and none of them succeeded.
  return refunded > 0
    ? `Refunded ${formatPeso(refunded)}`
    : "A refund was attempted and did not go through";
}

export default async function OrderHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ profile }, values] = await Promise.all([
    requireStaffPermission("orders:view", "/workspace/orders/history"),
    searchParams,
  ]);
  const filters = normalizeOrderHistoryFilters(values);
  // YYYY-MM-DD sorts the same as a string as it does as a date, so no parsing.
  const datesReversed = filters.from !== "" && filters.to !== "" && filters.from > filters.to;
  const orders = await getOrderHistory(profile.branchId, filters);
  const summary = summarizeOrderHistory(orders ?? []);
  const mayRefund = hasStaffPermission(profile, "refunds:manage");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Branch records</p>
          <h1 className="font-display heading-major mt-2">Order history</h1>
          <p className="text-nybb-bone/55 mt-2 max-w-2xl text-sm">
            Claimed, rejected, cancelled, and no-show orders, including today.
          </p>
        </div>
        <ButtonLink href="/workspace/orders" tone="dark" variant="secondary">
          Back to orders
        </ButtonLink>
      </div>

      <form role="search" className="bg-nybb-charcoal mt-7 grid gap-4 rounded-md p-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="md:col-span-2 xl:col-span-1">
          <WorkspaceFieldLabel htmlFor="history-query">Search</WorkspaceFieldLabel>
          <WorkspaceInput
            id="history-query"
            name="q"
            defaultValue={filters.query}
            maxLength={80}
            placeholder="Code, name, phone, email"
          />
        </div>
        <WorkspaceSelect
          id="history-status"
          name="status"
          label="Status"
          options={statusOptions}
          defaultValue={filters.status}
        />
        <div>
          <WorkspaceFieldLabel htmlFor="history-from">Placed from</WorkspaceFieldLabel>
          <WorkspaceInput id="history-from" name="from" type="date" defaultValue={filters.from} />
        </div>
        <div>
          <WorkspaceFieldLabel htmlFor="history-to">Placed through</WorkspaceFieldLabel>
          <WorkspaceInput id="history-to" name="to" type="date" defaultValue={filters.to} />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" tone="dark" className="flex-1">Filter</Button>
          <ButtonLink href="/workspace/orders/history" tone="dark" variant="ghost">Reset</ButtonLink>
        </div>
      </form>

      {datesReversed ? (
        <p
          role="alert"
          className="border-nybb-orange/60 bg-nybb-orange/10 mt-4 rounded-md border p-4 text-sm leading-relaxed"
        >
          &ldquo;Placed from&rdquo; is after &ldquo;Placed through&rdquo;, so nothing can fall
          between them. Swap the two dates to see results.
        </p>
      ) : null}

      {orders ? (
        <>
          <section aria-label="History summary" className="mt-5 grid gap-px overflow-hidden rounded-md bg-nybb-bone/15 sm:grid-cols-3">
            <div className="bg-nybb-charcoal p-4">
              <p className="type-caps text-nybb-bone/50">Orders</p>
              <p className="font-display heading-panel mt-2">{summary.orderCount}</p>
              {summary.testOrderCount ? <p className="text-nybb-bone/55 mt-1 text-xs">Includes {summary.testOrderCount} test</p> : null}
            </div>
            <div className="bg-nybb-charcoal p-4">
              <p className="type-caps text-nybb-bone/50">Paid orders</p>
              <p className="font-display heading-panel mt-2">{summary.paidOrderCount}</p>
              <p className="text-nybb-bone/55 mt-1 text-xs">Test orders excluded</p>
            </div>
            <div className="bg-nybb-charcoal p-4">
              <p className="type-caps text-nybb-bone/50">Paid sales</p>
              <p className="font-display heading-panel mt-2">{formatPeso(summary.paidSalesCents)}</p>
              <p className="text-nybb-bone/55 mt-1 text-xs">Test orders excluded</p>
            </div>
          </section>

          {orders.length >= ORDER_HISTORY_LIMIT ? (
            <p role="status" className="text-nybb-bone/55 mt-4 text-xs">
              Showing the {ORDER_HISTORY_LIMIT} most recent matches. Narrow the dates or the
              search to be sure you are seeing everything.
            </p>
          ) : null}
          <div className="mt-4 space-y-3">
            {orders.map((order) => (
              <article key={order.id} className="bg-nybb-charcoal rounded-md p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-mono text-lg font-bold">{order.shortCode}</h2>
                      <span className="bg-nybb-graphite text-nybb-bone/70 rounded px-2 py-1 text-xs font-medium">{statusLabels[order.status]}</span>
                      {order.isTest ? <span className="border-nybb-yellow/60 text-nybb-yellow rounded border px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider">Test</span> : null}
                    </div>
                    <p className="text-nybb-bone/60 mt-1 text-sm">{order.customer.name} · {order.customer.phone}</p>
                    {order.customer.email ? <p className="text-nybb-bone/55 mt-0.5 text-xs">{order.customer.email}</p> : null}
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg font-bold">{formatPeso(order.totalCents)}</p>
                    <p className="text-nybb-bone/55 mt-1 text-xs">{paymentLabel(order)}</p>
                  </div>
                </div>

                <div className="border-nybb-bone/15 mt-4 grid gap-4 border-t pt-4 lg:grid-cols-[1fr_auto]">
                  <ul className="space-y-2 text-sm">
                    {order.items.map((item, index) => (
                      <li key={`${item.name}-${index}`}>
                        <span className="text-nybb-orange font-mono">{item.quantity}x</span>{" "}
                        {item.name} <span className="text-nybb-bone/55">{item.variation}</span>
                        {item.options.length ? <span className="text-nybb-bone/55 mt-0.5 block text-xs">{item.options.join(", ")}</span> : null}
                      </li>
                    ))}
                  </ul>
                  <dl className="grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2 lg:min-w-96">
                    <div><dt className="text-nybb-bone/55">Placed</dt><dd className="mt-0.5">{manilaDateTime(order.placedAt)}</dd></div>
                    <div><dt className="text-nybb-bone/55">Closed</dt><dd className="mt-0.5">{manilaDateTime(order.closedAt)}</dd></div>
                    <div><dt className="text-nybb-bone/55">Pickup</dt><dd className="mt-0.5">{order.pickupAt ? manilaDateTime(order.pickupAt) : "No slot"}</dd></div>
                    <div><dt className="text-nybb-bone/55">Contact</dt><dd className="mt-0.5">{order.customer.phone}</dd></div>
                  </dl>
                </div>
                {order.reason ? <p className="bg-nybb-graphite text-nybb-bone/70 mt-4 rounded p-3 text-sm"><span className="text-nybb-bone/55">Reason:</span> {order.reason}</p> : null}
                {order.notes ? <p className="text-nybb-bone/55 mt-3 text-sm"><span className="text-nybb-bone/55">Order note:</span> {order.notes}</p> : null}
                {refundLabel(order) ? <p className="text-nybb-bone/55 mt-3 text-sm">{refundLabel(order)}</p> : null}
                {/*
                  The same test `staff_request_refund` runs, including the
                  remainder. A fully refunded payment already flips to the
                  `refunded` status and drops out on the line above, but a
                  partly refunded one stays `paid` for ever, so without the
                  remainder check this offered an "Issue refund" button whose
                  only possible outcome was a red message.
                */}
                {mayRefund
                  && order.payment?.provider === "paymongo"
                  && order.payment.status === "paid"
                  && canIssueRefund(order.payment.amountCents, order.payment.refunds) ? (
                  <RefundControl
                    orderId={order.id}
                    amountCents={order.payment.amountCents}
                    refundedCents={reservedRefundCents(order.payment.refunds)}
                  />
                ) : null}
              </article>
            ))}
            {orders.length === 0 ? (
              <div className="border-nybb-bone/25 rounded-md border border-dashed px-4 py-12 text-center">
                <p className="font-display heading-panel">No matching orders</p>
                <p className="text-nybb-bone/50 mt-2 text-sm">
                  Nothing closed matches these filters. A search runs across every closed
                  order for this branch, so a code that finds nothing here was never placed
                  at this counter.
                </p>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div role="alert" className="border-nybb-bone/30 mt-7 rounded-md border border-dashed p-5">
          <p className="font-display heading-panel">Order history is unavailable</p>
          <p className="text-nybb-bone/60 mt-2 text-sm">The database could not be read. Please try again.</p>
        </div>
      )}
    </div>
  );
}
