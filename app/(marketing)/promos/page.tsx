import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PromoCard } from "@/components/site/PromoCard";
import { PromoPushOptIn } from "@/components/site/PromoPushOptIn";
import { StoreBar } from "@/components/store/StoreBar";
import { ButtonLink } from "@/components/ui/Button";
import { getStoreSelection } from "@/lib/branches/selection";
import { listPromos } from "@/lib/promos/read";
import { featuredPromo } from "@/lib/promos/schema";
import { PROMO_USED_COOKIE, parseUsed, withoutUsed } from "@/lib/promos/used";

export const metadata: Metadata = {
  title: "Promos",
  description:
    "Promo codes running now at New York Buffalo Brad's Hot Wings, and how to use them.",
  // What is here depends on who is asking, because a signed-in customer sees
  // their own rewards alongside the public offers. Indexing one visitor's
  // version of that would be indexing the wrong page for everybody else.
  robots: { index: false, follow: true },
};

/**
 * Every promo this customer may be told about, at the counter they chose.
 *
 * The page does no filtering of its own. `list_customer_promos` decides what
 * may be shown and applies the flag, the publicise tick, the ownership rules
 * and every eligibility rule that does not need a cart. Adding a condition
 * here would be a second opinion about who may see what, and the one place
 * that question is answered is the one place it should be answered.
 *
 * The counter matters and is shown, not assumed. A promo tied to one branch
 * is filtered out for a customer who has chosen a different one, so the bar
 * that lets them change counters belongs on the page that depends on it.
 */
export default async function PromosPage() {
  const [selection, jar] = await Promise.all([getStoreSelection(), cookies()]);

  // The same two filters the bar is given, so a promo cannot be absent from
  // one and present on the other. A customer who followed the bar here and
  // found something it had not mentioned would trust neither again.
  const promos = withoutUsed(
    await listPromos(selection.selected?.slug ?? null),
    parseUsed(jar.get(PROMO_USED_COOKIE)?.value),
  );

  const mine = promos.filter((promo) => promo.personal);
  const open = promos.filter((promo) => !promo.personal);
  // The promo the owner put first (0078), after every filter above, so a
  // placed code this browser already spent hands the lead to the next one.
  // Null while no order is set: the page then reads as it always has.
  const featured = featuredPromo(open);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display heading-page">Promos</h1>
      <p className="text-nybb-ink/70 mt-4 max-w-lg text-base leading-relaxed">
        One code per order, and codes cannot be combined. Applying one takes you
        to checkout, where the discount is worked out on your actual order.
      </p>

      {selection.stores.some((store) => store.orderable) ? (
        <StoreBar selection={selection} returnTo="/promos" className="mt-8" />
      ) : null}

      {promos.length === 0 ? (
        // AN HONEST EMPTY PAGE RATHER THAN A 404. This link goes in the footer
        // and on the bar, so it is an address customers will have, and a page
        // that vanished when nothing was running would read as a fault. It is
        // also what a customer sees while the engine is switched off, which is
        // the truth from where they stand: there are no promos to have.
        <div className="border-nybb-ink/12 mt-10 rounded-lg border border-dashed p-8 text-center">
          <p className="font-display heading-panel text-nybb-ink">
            No promos running right now
          </p>
          <p className="text-nybb-ink/60 mx-auto mt-3 max-w-sm text-sm leading-relaxed">
            When there is one, it appears here and at the top of the site. If
            somebody gave you a code, you can still enter it at checkout.
          </p>
          <ButtonLink href="/menu" tone="light" variant="primary" className="mt-6">
            Browse the menu
          </ButtonLink>
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {mine.length > 0 ? (
            <section aria-labelledby="promos-yours">
              {/* Grouped apart, so a reward issued to this account does not
                  read as a general offer anybody can use. */}
              <h2 id="promos-yours" className="font-display heading-panel text-nybb-ink">
                Yours
              </h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {mine.map((promo) => (
                  <PromoCard key={promo.code} promo={promo} />
                ))}
              </ul>
            </section>
          ) : null}

          {open.length > 0 ? (
            <section aria-labelledby="promos-open">
              <h2 id="promos-open" className="font-display heading-panel text-nybb-ink">
                Running now
              </h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {/* The featured promo is already first in the list's order, so
                    it leads without being moved; it only changes its card. */}
                {open.map((promo) => (
                  <PromoCard
                    key={promo.code}
                    promo={promo}
                    featured={promo.code === featured?.code}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      {/* Under the list rather than above it, because somebody who arrived
          here wants to see what is running before being asked whether they
          want to be told about the next one. It is offered whether or not
          anything is running now: an empty page is exactly when a standing
          alert is worth having. */}
      <div className="border-nybb-ink/12 mt-12 border-t pt-8">
        <h2 className="font-display heading-panel text-nybb-ink">Hear about new promos</h2>
        <PromoPushOptIn />
      </div>
    </div>
  );
}
