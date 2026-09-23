import Link from "next/link";
import { X } from "lucide-react";
import { dismissPromo } from "@/app/actions/promos";
import { isDismissed, promoDismissalKey } from "@/lib/promos/dismissal";
import { promoSentence, type Promo } from "@/lib/promos/schema";

/**
 * The line that says a promo is running.
 *
 * A SERVER COMPONENT, AND THAT IS THE WHOLE DESIGN. The dismissal lives in a
 * cookie, so the layout already knows whether to draw this before it renders
 * anything. Nothing appears and then retracts, there is no inline script
 * reading storage before paint, and there is no hydration question to answer.
 * `lib/promos/dismissal.ts` records why the cookie beat localStorage here.
 *
 * IT IS NOT A LIVE REGION, which is the correct reading of the ReorderNotice
 * rule rather than an exception to it. That rule is about content that arrives
 * after first paint and therefore has to be announced. This is present in the
 * document from the start, so a `role="status"` on it would make a screen
 * reader read an advert aloud on every page of the site. It is an `aside`
 * with a label, which is a landmark somebody can skip and come back to.
 *
 * BELOW THE STICKY HEADER, NOT INSIDE IT. Header is `sticky top-0`, so a bar
 * placed within it would be pinned to the top of the viewport for the entire
 * session, which is the definition of obtrusive. Here it is seen on arrival
 * and scrolls away, and the footer's link is what carries it afterwards.
 */
export function PromoBar({
  promos,
  dismissed,
}: {
  promos: readonly Promo[];
  /** Keys already in this browser's cookie, parsed. */
  dismissed: readonly string[];
}) {
  // The leading promo is the one the reader sorted first, which is the one
  // expiring soonest. Showing every running promo here would make the bar a
  // list, and a list belongs on the page this links to.
  const promo = promos.find((candidate) => !isDismissed(candidate, dismissed));
  if (!promo) return null;

  const others = promos.length - 1;

  return (
    <aside
      aria-label="Promo"
      className="band-ink text-nybb-bone border-nybb-bone/10 border-b"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        {/* The one piece of orange, and it is a graphic rather than type.
            Orange measures 1.8:1 on amber and 2.6:1 on parchment, so it may
            never be a letter, but as a mark against ink it is exactly the
            flag this line needs. Hidden from the reading order because it
            says nothing the sentence does not. */}
        <span
          aria-hidden
          className="bg-nybb-orange h-4 w-[3px] shrink-0 rounded-full sm:h-5"
        />

        {/* The message is the link. One target rather than a sentence plus a
            separate "See all", because at 320px a second inline target is
            what pushes this into two rows and starts crowding the dismiss
            button. `min-w-0` is what lets the truncate below actually bite
            inside a flex row. */}
        <Link
          href="/promos"
          className="group flex min-h-11 min-w-0 flex-1 items-center gap-2 py-2 text-sm"
        >
          <span className="font-display group-hover:text-nybb-orange shrink-0 tracking-wide transition-colors duration-200">
            {promo.code}
          </span>
          {/* bone/70 rather than anything fainter. bone/55 is this system's
              floor for text and this is a full sentence, not a caption. */}
          <span className="text-nybb-bone/70 min-w-0 truncate">
            {promoSentence(promo)}
          </span>
          {others > 0 ? (
            <span className="text-nybb-bone/55 hidden shrink-0 sm:inline">
              {others === 1 ? "and 1 more" : `and ${others} more`}
            </span>
          ) : null}
        </Link>

        {/* A real form and a real submit, so this works with JavaScript off.
            The bar is the one piece of chrome somebody may actively want gone,
            and a dismiss control that quietly did nothing would be worse than
            no control at all. */}
        <form action={dismissPromo} className="shrink-0">
          <input type="hidden" name="key" value={promoDismissalKey(promo)} />
          <button
            type="submit"
            // 2.75rem square, the floor this system uses everywhere, and it
            // has to hold at 320px where everything else is being squeezed.
            className="text-nybb-bone/55 hover:text-nybb-bone focus-visible:outline-nybb-bone flex min-h-11 min-w-11 items-center justify-center transition-colors duration-200 focus-visible:outline-3 focus-visible:outline-offset-2"
            // The code, so somebody hearing a list of buttons knows which
            // advert this one puts away.
            aria-label={`Dismiss the ${promo.code} promo`}
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}
