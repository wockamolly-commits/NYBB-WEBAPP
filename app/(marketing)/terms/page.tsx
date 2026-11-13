import type { Metadata } from "next";
import { LegalContentView } from "@/components/content/LegalContentView";
import { getPageContent } from "@/lib/content/read";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms for ordering New York Buffalo Brad's for pickup on this website: payment, pickup, cancellations, refunds and promo codes.",
};

/**
 * The Terms of Service.
 *
 * Edited from /workspace/content; DEFAULT_TERMS in lib/content/defaults.ts is
 * the built-in text. Every operational statement in that built-in text
 * describes what the code does today:
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
 * section 28, item 5b). In the built-in text they are [[pending: ...]]
 * placeholders, which keep the page marked as a draft until somebody with
 * content:manage replaces them with the owner's answers.
 */
export default async function TermsPage() {
  const content = await getPageContent("terms");
  return <LegalContentView content={content} sibling={{ href: "/privacy", label: "Privacy Policy" }} />;
}
