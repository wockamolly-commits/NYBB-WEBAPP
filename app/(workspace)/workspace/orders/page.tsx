import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { StaffPushOptIn } from "@/components/workspace/StaffPushOptIn";
import { OrderCard } from "./OrderCard";
import { OrdersPoller } from "./OrdersPoller";
import { getWorkspaceOrders } from "@/lib/staff/orders";
import { hasStaffPermission, requireStaffPermission } from "@/lib/staff/session";
import type { WorkspaceOrder } from "@/lib/staff/order-types";

export const metadata: Metadata = { title: "Orders" };

const columns: Array<{
  key: "new" | "preparing" | "ready" | "claimed";
  label: string;
  matches: (order: WorkspaceOrder) => boolean;
}> = [
  { key: "new", label: "New", matches: (order) => order.status === "pending" },
  { key: "preparing", label: "Preparing", matches: (order) => order.status === "accepted" || order.status === "preparing" },
  { key: "ready", label: "Ready", matches: (order) => order.status === "ready" },
  { key: "claimed", label: "Claimed today", matches: (order) => order.status === "claimed" },
];

/**
 * Formatted on the server, so it is one string by the time it reaches the
 * browser and cannot disagree with itself across a hydration boundary.
 */
function manilaTime(value: Date): string {
  return value.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

export default async function WorkspaceOrdersPage() {
  const { profile } = await requireStaffPermission("orders:view", "/workspace/orders");
  const orders = await getWorkspaceOrders(profile.branchId);
  const mayRefund = hasStaffPermission(profile, "refunds:manage");
  const readAt = manilaTime(new Date());

  return (
    <div>
      <OrdersPoller branchId={profile.branchId} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Live operations</p>
          <h1 className="font-display heading-major mt-2">Orders board</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {/*
            This replaced "Realtime is primary, with a 20-second polling
            fallback when a socket drops", which describes the transport to a
            reader who has no transport problem to solve. What a counter needs
            from this corner is proof the board is not frozen, and the only
            honest proof is the time it was last read. If that clock stops
            moving, the tablet has lost the site, which is the one fault the
            old sentence could not have told anybody about.
          */}
          <p className="text-nybb-bone/55 max-w-md text-sm">
            Updates on its own. Last read {readAt}.
          </p>
          {/*
            No permission check around this. requireStaffPermission above already
            turns this whole page away without orders:view, which is the same
            permission register_staff_push_subscription asks the database about.
            A second check here would be a second place for the two to drift.
          */}
          <StaffPushOptIn />
          <ButtonLink href="/workspace/orders/history" tone="dark" variant="secondary">History</ButtonLink>
        </div>
      </div>

      {orders ? (
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((column) => {
          const columnOrders = orders
            .filter(column.matches)
            .sort((left, right) =>
              column.key === "ready"
                ? Number(right.customerArrived) - Number(left.customerArrived)
                : 0,
            );
          return (
            <section key={column.key} aria-labelledby={`orders-${column.key}`} className="min-w-0">
              <div className="mb-3 flex items-center justify-between">
                <h2 id={`orders-${column.key}`} className="font-display heading-panel">{column.label}</h2>
                <span className="bg-nybb-charcoal rounded px-2 py-1 font-mono text-sm">{columnOrders.length}</span>
              </div>
              <div className="space-y-3">
                {columnOrders.map((order) => <OrderCard key={order.id} order={order} mayRefund={mayRefund} />)}
                {columnOrders.length === 0 ? (
                  <p className="border-nybb-bone/20 text-nybb-bone/55 rounded-md border border-dashed px-3 py-8 text-center text-sm">No orders here</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      ) : (
        <div role="alert" className="border-nybb-bone/30 mt-7 rounded-md border border-dashed p-5">
          <p className="font-display heading-panel">Live orders are unavailable</p>
          <p className="text-nybb-bone/60 mt-2 text-sm">
            The board could not read the database. It will retry automatically.
          </p>
        </div>
      )}
    </div>
  );
}
