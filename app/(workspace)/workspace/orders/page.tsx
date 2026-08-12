import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
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

export default async function WorkspaceOrdersPage() {
  const { profile } = await requireStaffPermission("orders:view", "/workspace/orders");
  const orders = await getWorkspaceOrders(profile.branchId);
  const mayRefund = hasStaffPermission(profile, "refunds:manage");

  return (
    <div>
      <OrdersPoller branchId={profile.branchId} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Live operations</p>
          <h1 className="font-display heading-major mt-2">Orders board</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-nybb-bone/50 max-w-md text-sm">Realtime is primary, with a 20-second polling fallback when a socket drops.</p>
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
                  <p className="border-nybb-bone/20 text-nybb-bone/35 rounded-md border border-dashed px-3 py-8 text-center text-sm">No orders here</p>
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
