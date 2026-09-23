import { ButtonLink } from "@/components/ui/Button";
import { promoEndsLabel, promoSentence, type Promo } from "@/lib/promos/schema";

/**
 * One promo, explained and applicable.
 *
 * The code is the loud thing, because it is what the customer would read back
 * over the phone if the counter asked and what they would recognise on a
 * poster. The sentence under it is `voucherSummary`, the same words the owner
 * sees in the workspace, so there is one description of one promo rather than
 * two that drift.
 *
 * WHAT THIS CARD DOES NOT PROMISE. The listing behind it applies every rule
 * that does not need a cart, and none of the rules that do: the minimum, the
 * item scope, and how many times this customer has already used it are all
 * checked when the code is actually applied. So the card says what the promo
 * is and never says it will work on your order. That asymmetry is deliberate
 * and it is why Apply runs the real preview rather than trusting this screen.
 */
export function PromoCard({ promo }: { promo: Promo }) {
  const ends = promoEndsLabel(promo.expiresAt);

  return (
    <li className="border-nybb-ink/12 bg-nybb-cream/50 rounded-lg border p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-nybb-ink min-w-0 truncate text-lg tracking-wide">
          {promo.code}
        </p>
        {promo.personal ? (
          // A reward belonging to this account, not a public offer. Said in a
          // word rather than by putting it in a different colour, because the
          // distinction is a fact and not an emphasis.
          <span className="type-caps text-nybb-ink/55 shrink-0">Yours</span>
        ) : null}
      </div>

      <p className="text-nybb-ink/80 mt-2 text-sm leading-relaxed">
        {promoSentence(promo)}
      </p>

      {promo.description ? (
        <p className="text-nybb-ink/60 mt-2 text-sm leading-relaxed">
          {promo.description}
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-3">
        {/* Silence when it never ends, rather than a line saying so. */}
        {ends ? (
          <p className="text-nybb-ink/55 text-xs">Ends {ends}</p>
        ) : (
          <span />
        )}

        {/* ALWAYS A PLAIN LINK, EVEN THOUGH THE CART MAY BE EMPTY.
            The cart lives in localStorage, so a server component cannot know
            whether there is anything to apply this to. The alternatives were
            both worse than the one taken: a client island here would render
            "Apply" and then swap to something else after hydration, which is
            a control changing its meaning under the reader's finger, and
            guessing would be wrong for exactly the people arriving from a
            poster with nothing in their cart yet. So the link always goes to
            checkout, and checkout says the true thing when it gets there. */}
        <ButtonLink
          href={`/checkout?promo=${encodeURIComponent(promo.code)}`}
          tone="light"
          variant="secondary"
        >
          Apply
        </ButtonLink>
      </div>
    </li>
  );
}
