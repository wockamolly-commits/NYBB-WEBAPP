import type { Metadata } from "next";
import Link from "next/link";
import { Detail, LegalPage, LegalSection } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms for ordering New York Buffalo Brad's for pickup on this website: payment, pickup, cancellations, refunds and promo codes.",
};

/**
 * The Terms of Service.
 *
 * Like the Privacy Policy, every operational statement here describes what
 * the code does today:
 *
 *   Pickup only, no delivery     spec "Current direction"; Tablevibe link
 *   Payment first, QR Ph only    spec section 17; CheckoutView, lib/customer/payment.ts
 *   Unpaid orders auto-cancel    pg_cron expire-unpaid-online-orders (0031), payment.failed (0032)
 *   Staff may decline an order   reject reasons in lib/orders/reject-reasons.ts
 *   No customer cancel button    lib/orders/status.ts ("Please call the branch")
 *   Refunds by staff, via PayMongo, full or partial   0033, lib/paymongo/refunds.ts
 *   A cancelled order gives its promo use back        0065
 *
 * The refund, cancellation and no-show rules are the owner's to set (spec
 * section 28, item 5b) and come from lib/legal/details.ts.
 */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      sibling={{ href: "/privacy", label: "Privacy Policy" }}
      intro={
        <>
          <p>
            These terms apply when you use this website to order New York Buffalo Brad&rsquo;s Hot
            Wings for pickup. The website and the branches are operated by{" "}
            <Detail field="businessName" label="registered business name" />, of{" "}
            <Detail field="businessAddress" label="registered business address" /> (&ldquo;we&rdquo;,
            &ldquo;us&rdquo;). By placing an order you agree to these terms and to our{" "}
            <Link href="/privacy" className="text-nybb-ink underline decoration-nybb-ink/40 underline-offset-4 hover:decoration-nybb-ink">
              Privacy Policy
            </Link>
            .
          </p>
        </>
      }
    >
      <LegalSection id="ordering" title="Ordering for pickup">
        <p>
          Orders placed on this website are for pickup only, at the branch and in the pickup window
          you choose at checkout. Delivery is not offered here; delivery orders placed through
          Tablevibe are covered by Tablevibe&rsquo;s own terms.
        </p>
        <p>
          You can order as a guest or signed in. Please give a name and a mobile number that are
          really yours, so the branch can call out your order and reach you if something changes.
          A guest&rsquo;s only way back to an order is the tracking link shown after checkout, so
          keep it.
        </p>
        <p>
          Kitchen notes are passed to the branch with your order. If an allergy is serious, call
          the branch before ordering to confirm what they can do.
        </p>
      </LegalSection>

      <LegalSection id="prices" title="Prices and payment">
        <p>
          Prices are in Philippine pesos and are the ones shown at checkout, worked out by our
          system from the current menu. Any promo discount is shown before you pay.
        </p>
        <p>
          Every order is paid online before the kitchen receives it. Payment is by QR Ph, processed
          by PayMongo, and we never see your bank or e-wallet login. Your order is sent to the
          branch only once PayMongo confirms the payment. If payment is not completed in time or
          fails, the order is cancelled automatically and its pickup slot is released.
        </p>
      </LegalSection>

      <LegalSection id="pickup" title="Collecting your order">
        <p>
          You will get a pickup code and a tracking page that shows when your order is being made
          and when it is ready. Show the code at the counter to collect it.
        </p>
        <p>
          <strong>If you cannot collect your order:</strong>{" "}
          <Detail field="noShowPolicy" label="how long a ready order is held, and what happens to it and to the payment if it is not collected" />
        </p>
      </LegalSection>

      <LegalSection id="cancellations" title="Cancellations">
        <p>
          A branch may decline an order it cannot fulfil, for example when an item has sold out,
          the kitchen is too busy, or the branch is closing. If you have already paid, the order is
          refunded under the refund policy below.
        </p>
        <p>
          There is no cancel button on the site. To ask to cancel, call the branch you ordered
          from; their numbers are on the{" "}
          <Link href="/contact" className="text-nybb-ink underline decoration-nybb-ink/40 underline-offset-4 hover:decoration-nybb-ink">
            branches page
          </Link>
          .{" "}
          <Detail field="cancellationPolicy" label="whether a customer can cancel a paid order, until when, and what is refunded" />
        </p>
      </LegalSection>

      <LegalSection id="refunds" title="Refunds">
        <p>
          <Detail field="refundPolicy" label="when an order is refunded in full or in part, how to ask for one, and how long it takes" />
        </p>
        <p>
          Refunds go back through PayMongo to the account you paid from. Your tracking page shows
          when a payment has been refunded.
        </p>
      </LegalSection>

      <LegalSection id="promos" title="Promo codes">
        <p>
          Promo codes have their own conditions, such as a minimum order, an end date, a limit on
          uses per customer, or particular branches, and those are checked when the code is
          applied. A code has no cash value and cannot be combined with another code on the same
          order. If an order that used a code is cancelled, the use is returned to you.
        </p>
      </LegalSection>

      <LegalSection id="accounts" title="Accounts">
        <p>
          Signing in uses a one-time code sent to your email. Keep access to that email secure,
          since anyone who can read it can sign in as you.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="Our responsibility">
        <p>
          We work to keep the site available and its menu, prices and opening hours correct, but
          the site may sometimes be unavailable or show something out of date. Nothing in these
          terms limits rights you have under Philippine consumer law, including the Consumer Act
          of the Philippines (Republic Act No. 7394).
        </p>
      </LegalSection>

      <LegalSection id="law" title="Governing law and contact">
        <p>
          These terms are governed by the laws of the Philippines. If something goes wrong with an
          order, call the branch first, since they can usually fix it fastest. For anything else,
          write to us at <Detail field="businessAddress" label="registered business address" />.
        </p>
        <p>
          We may update these terms. The version in effect when you place an order is the one that
          applies to it.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
