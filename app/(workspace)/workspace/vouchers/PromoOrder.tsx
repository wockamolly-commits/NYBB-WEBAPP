"use client";

import { startTransition, useActionState, useState } from "react";
import { ArrowDown, ArrowUp, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { featuredVoucherId, moveVoucher } from "@/lib/vouchers/order";
import type { VoucherActionState } from "@/lib/vouchers/schema";
import { VOUCHER_STATUS_LABELS, type VoucherStatus } from "@/lib/vouchers/status";
import { setVoucherOrder } from "./actions";

/**
 * Which promo leads the storefront, and in what order the rest follow.
 *
 * The list is drawn in the order customers see it (storefrontOrder mirrors
 * list_customer_promos), so this is not a settings form describing an order
 * somewhere else: it IS the order. The first live code is featured: the large
 * card on /promos, the first poster in the popup, the code in the promo bar,
 * the first checkout suggestion.
 *
 * EVERY MOVE SAVES. There is no Save button to forget. Each Up or Down posts
 * the whole new order at once (see setVoucherOrder for why the whole order),
 * and the list moves immediately rather than waiting for the round trip. If
 * the save is refused, the list goes back to what the server holds and the
 * reason is shown under it.
 *
 * Codes that are on the storefront but not live (scheduled, ended, used up,
 * switched off) stay in the list, so the owner can line a campaign up before
 * it starts, and are marked so it is clear why the featured badge skipped
 * them.
 */

export type PromoOrderRow = {
  id: string;
  code: string;
  status: VoucherStatus;
  displayPriority: number | null;
  offer: string;
};

const INITIAL: VoucherActionState = { ok: false };

export function PromoOrder({ rows }: { rows: PromoOrderRow[] }) {
  const [state, action, pending] = useActionState(setVoucherOrder, INITIAL);

  // The server's order, and the order on screen. They differ only between a
  // move and the refreshed page arriving, or after a refused save, when the
  // screen goes back to the server's.
  const serverKey = rows.map((r) => `${r.id}:${r.displayPriority ?? "-"}`).join(",");
  const [seenKey, setSeenKey] = useState(serverKey);
  const [list, setList] = useState(rows);
  if (seenKey !== serverKey) {
    setSeenKey(serverKey);
    setList(rows);
  }
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.error) setList(rows);
  }

  const placed = list.some((r) => r.displayPriority !== null);
  const featured = featuredVoucherId(list.map((r) => ({ ...r, publicise: true, expiresAt: null })));

  function save(next: PromoOrderRow[]) {
    const formData = new FormData();
    formData.set("order", JSON.stringify(next.map((r) => r.id)));
    startTransition(() => action(formData));
  }

  function move(id: string, direction: -1 | 1) {
    // Moving anything places everything, in the order on screen, so the
    // storefront matches this list exactly from the first move on.
    const next = moveVoucher(list, id, direction).map((r, i) => ({ ...r, displayPriority: i + 1 }));
    setList(next);
    save(next);
  }

  function reset() {
    setList(list.map((r) => ({ ...r, displayPriority: null })));
    const formData = new FormData();
    formData.set("order", "[]");
    startTransition(() => action(formData));
  }

  return (
    <section
      aria-labelledby="promo-order-title"
      className="bg-nybb-charcoal mt-4 rounded-md p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id="promo-order-title" className="font-display heading-panel text-nybb-bone uppercase">
            Storefront order
          </h2>
          <p className="text-nybb-bone/55 mt-2 text-sm leading-relaxed">
            {placed
              ? "Customers see these in this order. The first live code is featured: the large card on the promos page, the first poster in the popup, and the promo in the bar under the header."
              : "Automatic: the code ending soonest leads and nothing is featured. Move any code to set your own order, and the first live one becomes the featured promo."}
          </p>
        </div>
        {placed ? (
          <Button
            type="button"
            tone="dark"
            variant="ghost"
            onClick={reset}
            disabled={pending}
            className="min-h-11"
          >
            Back to automatic
          </Button>
        ) : null}
      </div>

      {list.length === 0 ? (
        <p className="text-nybb-bone/55 mt-4 text-sm leading-relaxed">
          No code is on the storefront yet. Switch on Show it on the storefront
          on a code, and it appears here to be placed.
        </p>
      ) : (
        <ol className="mt-4" aria-busy={pending}>
          {list.map((row, index) => {
            const live = row.status === "active";
            const isFeatured = row.id === featured;
            return (
              <li
                key={row.id}
                className="border-nybb-bone/10 flex items-center gap-3 border-t py-2 first:border-t-0"
              >
                <span
                  aria-hidden
                  className="font-mono-tabular text-nybb-bone/55 w-6 shrink-0 text-right text-sm"
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <a
                      href={`/workspace/vouchers/${row.id}`}
                      className="font-display text-nybb-bone hover:text-nybb-orange break-all underline-offset-4 hover:underline"
                    >
                      {row.code}
                    </a>
                    {isFeatured ? (
                      <span className="type-caps bg-nybb-orange text-nybb-ink inline-flex items-center gap-1 rounded px-1.5 py-0.5">
                        <Star aria-hidden className="size-3 fill-current" />
                        Featured
                      </span>
                    ) : null}
                    {!live ? (
                      <span className="type-caps text-nybb-bone/55">
                        {VOUCHER_STATUS_LABELS[row.status]}, not shown
                      </span>
                    ) : null}
                  </p>
                  <p className="text-nybb-bone/55 mt-0.5 truncate text-xs">{row.offer}</p>
                </div>
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => move(row.id, -1)}
                    disabled={pending || index === 0}
                    aria-label={`Move ${row.code} up`}
                    className="text-nybb-bone/70 hover:text-nybb-bone hover:bg-nybb-bone/10 inline-flex size-11 items-center justify-center rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ArrowUp aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(row.id, 1)}
                    disabled={pending || index === list.length - 1}
                    aria-label={`Move ${row.code} down`}
                    className="text-nybb-bone/70 hover:text-nybb-bone hover:bg-nybb-bone/10 inline-flex size-11 items-center justify-center rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ArrowDown aria-hidden className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {state.error ? (
        <p role="alert" className="border-nybb-red text-nybb-bone mt-3 border-l-2 pl-3 text-sm">
          {state.error}
        </p>
      ) : (
        <p role="status" className="sr-only">
          {pending ? "Saving the order" : state.ok ? "Order saved" : ""}
        </p>
      )}
    </section>
  );
}
