import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { requireStaffPermission } from "@/lib/staff/session";
import { getScopeChoices } from "@/lib/staff/vouchers";
import { VoucherEditor } from "../VoucherEditor";

export const metadata: Metadata = { title: "New promo code" };

export default async function NewVoucherPage() {
  await requireStaffPermission("vouchers:manage");
  const choices = await getScopeChoices();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Promotions</p>
          <h1 className="font-display heading-major mt-2">New promo code</h1>
          <p className="text-nybb-bone/55 mt-2 max-w-2xl text-sm leading-relaxed">
            A new code starts switched on and unrestricted. Everything below
            narrows it, and anything left alone stays open.
          </p>
        </div>
        <ButtonLink href="/workspace/vouchers" tone="dark" variant="secondary">
          Back to promo codes
        </ButtonLink>
      </div>

      <VoucherEditor voucher={null} choices={choices} />
    </div>
  );
}
