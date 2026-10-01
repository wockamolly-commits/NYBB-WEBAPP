import Image from "next/image";
import { Star } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  promoEndsLabel,
  promoHeadline,
  promoPoster,
  promoSentence,
  type Promo,
} from "@/lib/promos/schema";

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
export function PromoCard({ promo, featured = false }: { promo: Promo; featured?: boolean }) {
  const ends = promoEndsLabel(promo.expiresAt);
  const poster = promoPoster(promo);
  const { value } = promoHeadline(promo);

  // THE FEATURED CARD is the promo the owner put first (0078). It spans both
  // columns from sm, takes a firm ink edge instead of the hairline, sets the
  // offer in the display face at a size the eye lands on first, and puts the
  // poster beside the words rather than above them, so it reads as the lead
  // offer rather than as the first of equals. "Featured" is said in a word as
  // well, for the same reason "Yours" is: the emphasis is a fact.
  return (
    <li
      className={cn(
        "bg-nybb-cream/50 rounded-lg p-5 sm:p-6",
        featured
          ? "border-nybb-ink border-2 sm:col-span-2"
          : "border-nybb-ink/12 border",
      )}
    >
      <div
        className={cn(
          featured && poster && "sm:grid sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-center sm:gap-7",
        )}
      >
      {/* The owner's artwork, at its own shape and never cropped, above the
          words. The words stay: a poster is a picture of the offer, and the
          sentence below is the offer itself, in text a screen reader and a
          search engine can read. */}
      {poster ? (
        <Image
          src={poster.url}
          alt={`Poster for ${promo.code}${value ? `, ${value}` : ""}`}
          width={poster.width}
          height={poster.height}
          sizes={featured ? "(min-width: 640px) 24rem, 100vw" : "(min-width: 640px) 50vw, 100vw"}
          placeholder={poster.blurDataUrl ? "blur" : "empty"}
          blurDataURL={poster.blurDataUrl ?? undefined}
          className={cn(
            "mb-5 h-auto w-full rounded-md",
            // Beside the words from sm, so its height is capped rather than
            // letting a portrait poster make the card a column of picture.
            featured && "sm:mb-0 sm:max-h-[28rem] sm:object-contain",
          )}
        />
      ) : null}
      <div>
      {featured ? (
        <p className="type-caps bg-nybb-ink text-nybb-bone mb-3 inline-flex items-center gap-1.5 rounded px-2 py-1">
          <Star aria-hidden className="text-nybb-yellow size-3.5 fill-current" />
          Featured
        </p>
      ) : null}
      {featured && value ? (
        <p className="font-display heading-minor text-nybb-ink mb-2 uppercase">{value}</p>
      ) : null}
      <div className="flex items-baseline justify-between gap-3">
        <p
          className={cn(
            "font-display text-nybb-ink min-w-0 truncate tracking-wide",
            featured ? "text-xl" : "text-lg",
          )}
        >
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
          variant={featured ? "primary" : "secondary"}
        >
          Apply
        </ButtonLink>
      </div>
      </div>
      </div>
    </li>
  );
}
