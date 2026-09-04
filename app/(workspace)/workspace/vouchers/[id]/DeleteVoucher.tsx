"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import type { VoucherActionState } from "@/lib/vouchers/schema";
import { deleteVoucher } from "../actions";

const INITIAL: VoucherActionState = { ok: false };

/**
 * Deleting a promo code, which is only offered while nobody has used one.
 *
 * A redeemed voucher cannot be removed: 0008 makes voucher_redemptions.voucher_id
 * `on delete restrict`, so its history is not rewritable, and 0066 names that
 * refusal rather than letting a foreign key error reach a screen. Rather than
 * offer a button that always fails, the page hides it and says why, and the
 * reversible control, the switch on the form above, is the one left in reach.
 */
export function DeleteVoucher({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(deleteVoucher, INITIAL);

  useEffect(() => {
    if (state.deleted) router.push("/workspace/vouchers");
  }, [state.deleted, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <ConfirmDeleteButton
        label="Delete this code"
        name={code}
        meta="Promo code"
        consequence="The code stops working immediately and is removed from this list. Nobody has used it, so no order or receipt changes."
        pending={pending}
      />
      {state.error ? (
        <p role="alert" className="border-nybb-red text-nybb-bone mt-3 border-l-2 pl-3 text-sm leading-relaxed">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
