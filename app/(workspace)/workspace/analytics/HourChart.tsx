import { formatPeso } from "@/lib/format";
import type { SalesReport } from "@/lib/staff/analytics-schema";

/**
 * Orders and revenue by hour of day, the chart the page exists for.
 *
 * Spec section 20 calls this the single most actionable figure here, because
 * it is the one that decides how many people stand behind the counter at seven
 * and what the pickup slot capacity should be. Everything else on the screen
 * is a number somebody reads; this is a shape somebody acts on.
 *
 * WHY TWO ROWS RATHER THAN ONE CHART WITH TWO MEASURES.
 *
 * Orders and revenue answer different questions (how many hands, how much
 * money) and they do not have the same peak: a lunch hour full of single
 * baskets and an evening of family orders can trade places between the two.
 * Overlaying them needs a second axis, and a second axis on a bar chart is the
 * classic way to make two unrelated scales look like a comparison. So they are
 * two rows on one shared hour axis: the same twenty-four columns, read down.
 *
 * WHY IT IS STATIC.
 *
 * No client component, no charting library, no hover state carrying the only
 * copy of a number. Every value is printed in the table underneath, which is
 * also the accessible rendering, so nothing here is reachable only by pointer.
 * DESIGN.md's rule against blanket entrance animation applies with it: the
 * bars are drawn, not animated in.
 *
 * All twenty-four hours are drawn even when they are empty, because the axis
 * has to stay the day. A chart that plotted only the hours with orders in them
 * would rescale itself and make a quiet Tuesday look exactly like a rush.
 */

/** "19:00", on the counter's own clock. */
function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function peak<T extends { hour: number }>(
  rows: readonly T[],
  measure: (row: T) => number,
): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (measure(row) <= 0) continue;
    if (!best || measure(row) > measure(best)) best = row;
  }
  return best;
}

function BarRow({
  rows,
  measure,
  max,
  tone,
  label,
}: {
  rows: SalesReport["by_hour"];
  measure: (row: SalesReport["by_hour"][number]) => number;
  max: number;
  /**
   * Both rows are Buffalo Orange. They were orange and bone for a while, so
   * that two measures would read as two things, and value is how this system
   * usually separates surfaces. It is the wrong device here: these are not two
   * surfaces, they are two charts, each with its own label and its own axis,
   * and never adjacent. Spending a second colour on that says there is a
   * relationship to compare when there is not, and it costs the page its one
   * loud thing. See DESIGN.md, The One Loud Thing Rule.
   */
  tone: string;
  label: string;
}) {
  return (
    <div>
      <p className="type-caps text-nybb-bone/55">{label}</p>
      <div aria-hidden className="mt-2 flex h-24 items-end gap-px sm:h-28">
        {rows.map((row) => {
          const value = measure(row);
          // A zero column keeps a hairline so the axis reads as continuous
          // rather than as a gap where a bar failed to render.
          const height = max > 0 && value > 0 ? Math.max((value / max) * 100, 4) : 0;
          return (
            <div key={row.hour} className="flex h-full flex-1 items-end">
              {height > 0 ? (
                <span className={`block w-full rounded-t-[2px] ${tone}`} style={{ height: `${height}%` }} />
              ) : (
                <span className="bg-nybb-bone/15 block h-px w-full" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HourChart({ report }: { report: SalesReport }) {
  const rows = report.by_hour;
  const maxOrders = Math.max(...rows.map((row) => row.orders), 0);
  const maxSales = Math.max(...rows.map((row) => row.sales_cents), 0);
  const busiest = peak(rows, (row) => row.orders);
  const richest = peak(rows, (row) => row.sales_cents);

  return (
    <section className="bg-nybb-charcoal mt-6 rounded-md p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display heading-minor">Orders and revenue by hour</h2>
        <p className="text-nybb-bone/55 text-xs">Cut on the counter&rsquo;s clock, Asia/Manila</p>
      </div>

      {busiest ? (
        <p className="text-nybb-bone/70 mt-2 text-sm">
          Busiest at{" "}
          <span className="font-mono-tabular text-nybb-orange">{hourLabel(busiest.hour)}</span>
          {" "}with {busiest.orders} {busiest.orders === 1 ? "order" : "orders"}.
          {richest && richest.hour !== busiest.hour ? (
            <>
              {" "}The best hour for money was{" "}
              <span className="font-mono-tabular text-nybb-orange">{hourLabel(richest.hour)}</span>,
              at {formatPeso(richest.sales_cents)}.
            </>
          ) : null}
        </p>
      ) : (
        <p className="text-nybb-bone/70 mt-2 text-sm">
          No orders were placed in this range, so there is no shape to read yet.
        </p>
      )}

      {/*
        The chart is wider than a phone and scrolls inside its own container.
        DESIGN.md: horizontal overflow on the page body is a bug, and twenty
        four columns squeezed into 375px is not a chart, it is a texture.
      */}
      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[34rem] space-y-4">
          <BarRow
            rows={rows}
            measure={(row) => row.orders}
            max={maxOrders}
            tone="bg-nybb-orange"
            label="Orders"
          />
          <BarRow
            rows={rows}
            measure={(row) => row.sales_cents}
            max={maxSales}
            tone="bg-nybb-orange"
            label="Revenue"
          />
          <div aria-hidden className="flex gap-px">
            {rows.map((row) => (
              <div key={row.hour} className="flex-1 text-center">
                {row.hour % 3 === 0 ? (
                  <span className="font-mono-tabular text-nybb-bone/55 text-xs">
                    {String(row.hour).padStart(2, "0")}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/*
        The same twenty four rows as a table, for a screen reader and for
        anybody who wants the actual numbers rather than the shape. It is not a
        fallback: the bars above carry aria-hidden precisely so this is the one
        reading of the data rather than the second.
      */}
      <details className="border-nybb-bone/15 mt-4 rounded-md border">
        <summary className="type-caps text-nybb-bone/70 hover:text-nybb-bone flex min-h-11 cursor-pointer items-center px-3">
          Hour by hour, in figures
        </summary>
        <div className="overflow-x-auto">
          <table className="border-nybb-bone/15 w-full border-t text-sm">
            <caption className="sr-only">
              Orders and revenue for each hour of the day, in Asia/Manila
            </caption>
            <thead>
              <tr className="type-caps text-nybb-bone/55">
                <th scope="col" className="px-3 py-2 text-left font-normal">Hour</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">Orders</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.hour} className="border-nybb-bone/15 border-t">
                  <th scope="row" className="font-mono-tabular text-nybb-bone/70 px-3 py-1.5 text-left font-normal">
                    {hourLabel(row.hour)}
                  </th>
                  <td className="font-mono-tabular px-3 py-1.5 text-right">{row.orders}</td>
                  <td className="font-mono-tabular px-3 py-1.5 text-right">
                    {formatPeso(row.sales_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
