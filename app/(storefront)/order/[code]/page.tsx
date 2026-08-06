import type { Metadata } from "next";
import { OrderTracker } from "@/components/order/OrderTracker";
import { ButtonLink } from "@/components/ui/Button";
import { getOrderByTracking } from "@/lib/orders/reader";
import { TRACKING_TOKEN_PARAM, normalizeShortCode } from "@/lib/orders/tracking";

/**
 * `/order/[code]?t=<tracking token>`, screen five of the four in spec section
 * 11: where the customer waits.
 *
 * The URL is a bearer credential. Whoever holds it can read a name, a phone
 * number and the four digit code that claims the food, which is the trade that
 * lets a guest who never signed in look at their own order at all. Three
 * things pay for it, and all three have to stay true:
 *
 *   noindex here, so a link pasted somewhere public never lands in a search
 *   result. `Referrer-Policy: strict-origin-when-cross-origin` in
 *   `next.config.ts`, so tapping a branch phone number cannot hand the token
 *   to another host's access log. And nothing logs the token, ever.
 *
 * Nothing is cached, per spec section 23: order data never is. The route is
 * dynamic like every other one here, so this is a render per request against
 * whatever is true now.
 */

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const shortCode = normalizeShortCode(decodeURIComponent(code));

  return {
    // The short code is a handle rather than a secret, so it can sit in a
    // browser tab and a history entry. The token cannot, and does not.
    title: shortCode ? `Order ${shortCode}` : "Your order",
    robots: { index: false, follow: false },
  };
}

export default async function OrderPage({ params, searchParams }: PageProps) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const token = query[TRACKING_TOKEN_PARAM];

  const lookup = await getOrderByTracking(
    decodeURIComponent(code),
    typeof token === "string" ? token : null,
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display heading-page">
        {lookup.state === "found" ? "Your order" : "That order"}
      </h1>

      {lookup.state === "found" ? (
        <>
          <p className="text-nybb-ink/70 mt-4 max-w-lg text-base leading-relaxed">
            Keep this page. It carries the code the counter asks for, and it is
            the only copy of it.
          </p>
          <OrderTracker order={lookup.order} />
        </>
      ) : null}

      {/* Missing and unavailable read very differently to somebody standing in
          a car park, and the difference is the point of separating them. One
          of them means "check the link". The other means "your order is fine,
          we cannot see it this second", and getting that wrong sends a
          customer to order the same food twice. */}
      {lookup.state === "missing" ? (
        <div className="mt-8 max-w-prose">
          <p className="text-nybb-ink/70 leading-relaxed">
            We cannot find an order for that link. Order pages need the whole
            link, including the part after the question mark, so a code typed on
            its own will not open one.
          </p>
          <p className="text-nybb-ink/70 mt-4 leading-relaxed">
            If you have the order number but not the link, call the branch and
            read it to them. They can see it on their side.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/contact" tone="light">
              Branch phone numbers
            </ButtonLink>
            <ButtonLink href="/menu" tone="light" variant="ghost">
              Back to the menu
            </ButtonLink>
          </div>
        </div>
      ) : null}

      {lookup.state === "unavailable" ? (
        <div className="mt-8 max-w-prose">
          <p className="text-nybb-ink/70 leading-relaxed">
            We cannot reach the order system right now, so we cannot show you
            this one. Your order has not gone anywhere. Please try again in a
            moment.
          </p>
          <p className="text-nybb-ink/70 mt-4 leading-relaxed">
            Please do not place it again. If you need it sooner than we come
            back, call the branch and read them your order number.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/contact" tone="light">
              Branch phone numbers
            </ButtonLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}
