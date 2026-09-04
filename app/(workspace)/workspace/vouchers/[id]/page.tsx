import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { formatPeso } from "@/lib/format";
import { requireStaffPermission } from "@/lib/staff/session";
import { getScopeChoices, getVoucher, listVoucherUses } from "@/lib/staff/vouchers";
import { usageLabel, VOUCHER_STATUS_LABELS } from "@/lib/vouchers/status";
import { VoucherEditor } from "../VoucherEditor";
import { DeleteVoucher } from "./DeleteVoucher";

export const metadata: Metadata = { title: "Promo code" };

/** A Manila timestamp, the way the audit log writes one. */
function stamp(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(iso));
}

export default async function VoucherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaffPermission("vouchers:manage");

  const { id } = await params;
  const voucher = await getVoucher(id);
  if (!voucher) notFound();

  const [choices, uses] = await Promise.all([getScopeChoices(), listVoucherUses(id)]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="type-caps text-nybb-yellow">Promotions</p>
          <h1 className="font-display heading-major mt-2 break-words">{voucher.code}</h1>
          <p className="text-nybb-bone/55 mt-2 max-w-2xl text-sm leading-relaxed">
            {VOUCHER_STATUS_LABELS[voucher.status]}, used{" "}
            {usageLabel(voucher.usesCount, voucher.maxUses)}.
          </p>
        </div>
        <ButtonLink href="/workspace/vouchers" tone="dark" variant="secondary">
          Back to promo codes
        </ButtonLink>
      </div>

      <VoucherEditor voucher={voucher} choices={choices} />

      {/* Usage sits under the form rather than above it, because the form is
          what somebody opened this page to change and a table of redemptions
          between the heading and the first control would push it off screen. */}
      <section className="bg-nybb-charcoal mt-4 rounded-md p-4 sm:p-5">
        <h2 className="font-display heading-panel text-nybb-bone uppercase">Who has used it</h2>
        <p className="text-nybb-bone/55 mt-2 max-w-2xl text-xs leading-relaxed">
          Each row is what was true when the code was redeemed, kept on the
          redemption itself, so a later refund or rejection does not rewrite it.
          A cancelled or rejected order gives its use back and leaves this list.
        </p>

        {uses.length === 0 ? (
          <p className="text-nybb-bone/55 mt-4 text-sm">Nobody has used this code yet.</p>
        ) : (
          <div className="mt-4">
            <div className="border-nybb-bone/15 hidden border-b pb-3 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)] lg:gap-4">
              {["Order", "Customer", "Counter", "Taken off", "When"].map((head) => (
                <span key={head} className="type-caps text-nybb-bone/55">
                  {head}
                </span>
              ))}
            </div>
            <ul>
              {uses.map((use) => (
                <li
                  key={use.id}
                  className="border-nybb-bone/15 border-b py-3 text-sm lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)] lg:items-baseline lg:gap-4"
                >
                  <div className="min-w-0">
                    <span className="type-caps text-nybb-bone/55 lg:sr-only">Order</span>
                    <p className="font-mono-tabular text-nybb-bone">
                      {use.orderShortCode ?? "Gone"}
                    </p>
                    {use.orderStatus ? (
                      <p className="text-nybb-bone/55 text-xs">{use.orderStatus}</p>
                    ) : null}
                  </div>
                  <div className="mt-2 min-w-0 lg:mt-0">
                    <span className="type-caps text-nybb-bone/55 lg:sr-only">Customer</span>
                    <p className="text-nybb-bone/70 break-words">{use.customerName ?? "Not recorded"}</p>
                    {use.phoneDigits ? (
                      <p className="font-mono-tabular text-nybb-bone/55 text-xs">{use.phoneDigits}</p>
                    ) : null}
                  </div>
                  <div className="mt-2 lg:mt-0">
                    <span className="type-caps text-nybb-bone/55 lg:sr-only">Counter</span>
                    <p className="text-nybb-bone/70">{use.branchName ?? "Not recorded"}</p>
                  </div>
                  <div className="mt-2 lg:mt-0">
                    <span className="type-caps text-nybb-bone/55 lg:sr-only">Taken off</span>
                    <p className="font-mono-tabular text-nybb-bone">
                      {formatPeso(use.discountCents)}
                    </p>
                    {use.subtotalCents !== null && use.totalCents !== null ? (
                      <p className="font-mono-tabular text-nybb-bone/55 text-xs">
                        {formatPeso(use.subtotalCents)} to {formatPeso(use.totalCents)}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-2 lg:mt-0">
                    <span className="type-caps text-nybb-bone/55 lg:sr-only">When</span>
                    <p className="text-nybb-bone/70">{stamp(use.redeemedAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* The Destructive Control Comes After The Thing It Deletes Rule: at the
          foot of the page, below the form and the history it would remove the
          record of, not between them. */}
      <section className="bg-nybb-charcoal mt-4 rounded-md p-4 sm:p-5">
        <h2 className="font-display heading-panel text-nybb-bone uppercase">Delete</h2>
        {/* The same test the form and migration 0067 use, not the length of
            the list above it. A cancelled order gives its use back and leaves
            that list empty, but the order still names the code, and deleting
            the voucher would null that reference and erase the fact. */}
        {voucher.locked ? (
          <p className="text-nybb-bone/55 mt-2 max-w-2xl text-sm leading-relaxed">
            This code has been applied to an order, so it cannot be deleted:
            removing it would rewrite what those receipts say. Switch it off at
            the top of this page instead, which stops it working and leaves the
            history alone.
          </p>
        ) : (
          <>
            <p className="text-nybb-bone/55 mt-2 max-w-2xl text-xs leading-relaxed">
              Nobody has used this code, so it can be removed outright.
            </p>
            <div className="mt-4">
              <DeleteVoucher id={voucher.id} code={voucher.code} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
