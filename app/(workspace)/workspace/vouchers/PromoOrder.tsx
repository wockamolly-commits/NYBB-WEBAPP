"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { featuredVoucherId, moveLiveVoucher, nextStatusChange } from "@/lib/vouchers/order";
import type { VoucherActionState } from "@/lib/vouchers/schema";
import type { VoucherStatus } from "@/lib/vouchers/status";
import { setVoucherOrder } from "./actions";
import { PosterThumb } from "./PosterThumb";

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
 * ONLY LIVE CODES ARE LISTED. A code that is scheduled, ended, used up or
 * switched off is not shown to customers, so it is not shown here either; the
 * table below still lists it, with its status, for editing. Hiding is not
 * forgetting: a hidden code that was placed keeps its slot through every move
 * (moveLiveVoucher), so a scheduled campaign comes in where it was put.
 *
 * The page refreshes itself when the next advertised code starts or ends
 * (nextStatusChange), so a code drops out on its end date, or in on its start
 * date, without anybody reloading.
 */

export type PromoOrderRow = {
  id: string;
  code: string;
  status: VoucherStatus;
  displayPriority: number | null;
  offer: string;
  poster: { url: string; width: number; height: number } | null;
  /** Null is "live already". */
  startsAt: string | null;
  /** Null is "never ends". */
  expiresAt: string | null;
};

/** The longest delay setTimeout honours; past it the timer fires at once. */
const MAX_TIMEOUT_MS = 2_147_483_647;

const INITIAL: VoucherActionState = { ok: false };

export function PromoOrder({ rows }: { rows: PromoOrderRow[] }) {
  const [state, action, pending] = useActionState(setVoucherOrder, INITIAL);
  const router = useRouter();

  // Statuses are worked out on the server when the page renders, so the page
  // has to render again for a code to leave or join the list on its date.
  // A second late, so the server's clock is past the boundary when it does.
  const changeAt = nextStatusChange(rows);
  useEffect(() => {
    if (changeAt === null) return;
    const timer = setTimeout(
      () => router.refresh(),
      Math.min(Math.max(changeAt - Date.now(), 0) + 1000, MAX_TIMEOUT_MS),
    );
    return () => clearTimeout(timer);
  }, [changeAt, router]);

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
  const featured = featuredVoucherId(list.map((r) => ({ ...r, publicise: true })));
  const shown = list.filter((r) => r.status === "active");
  const hidden = list.length - shown.length;

  function save(next: PromoOrderRow[]) {
    const formData = new FormData();
    formData.set(
      "order",
      JSON.stringify(next.filter((r) => r.displayPriority !== null).map((r) => r.id)),
    );
    startTransition(() => action(formData));
  }

  function move(id: string, direction: -1 | 1) {
    // Moving anything places every live code, in the order on screen, so the
    // storefront matches this list exactly from the first move on. Hidden
    // codes ride along in their slots (see moveLiveVoucher).
    const next = moveLiveVoucher(list, id, direction);
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

      {shown.length === 0 ? (
        <p className="text-nybb-bone/55 mt-4 text-sm leading-relaxed">
          {list.length === 0
            ? "No code is on the storefront yet. Switch on Show it on the storefront on a code, and it appears here to be placed."
            : "No code on the storefront is live right now. A scheduled code appears here on its start date."}
        </p>
      ) : (
        <ol className="mt-4" aria-busy={pending}>
          {shown.map((row, index) => {
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
                <PosterThumb poster={row.poster} className="h-11 w-8" />
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
                    disabled={pending || index === shown.length - 1}
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

      {hidden > 0 ? (
        <p className="text-nybb-bone/55 mt-3 text-xs leading-relaxed">
          {hidden === 1 ? "1 code is" : `${hidden} codes are`} set to show on the
          storefront but not live (scheduled, ended, used up or off), so customers
          do not see {hidden === 1 ? "it" : "them"}. Find {hidden === 1 ? "it" : "them"} in
          the list below.
        </p>
      ) : null}

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
