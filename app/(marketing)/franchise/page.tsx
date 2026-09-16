import type { Metadata } from "next";
import { telHref } from "@/lib/phone";
import { InquiryForm } from "./InquiryForm";

export const metadata: Metadata = {
  title: "Franchise",
  description:
    "Open a New York Buffalo Brad's Hot Wings franchise. Talk to Five Brad Dragons Food Franchise Corporation in Cebu.",
};

/**
 * The franchise inquiry page.
 *
 * This is the form and the contact route, and deliberately not the sales case.
 * The investment figures, the process, what a franchisee receives and the
 * timeline are the F2 pages, and they are blocked on copy from Marketing. What
 * is written here is only what the business has already published about itself,
 * because a claim about support or returns is a commitment somebody has to
 * honour and some of them bind legally.
 */
export default function FranchisePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display heading-page">Open for franchise</h1>
      <p className="text-nybb-ink/75 mt-4 max-w-xl text-base leading-relaxed">
        New York Buffalo Brad&rsquo;s is operated and franchised by Five Brad Dragons Food
        Franchise Corporation, based in Cebu Business Park. Tell us where you are looking to
        open and we will get back to you.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[3fr_2fr] lg:gap-12">
        <div className="bg-nybb-charcoal text-nybb-bone rounded-md p-6 sm:p-8">
          <h2 className="font-display heading-minor">Franchise inquiry</h2>
          <p className="text-nybb-bone/65 mt-3 mb-8 text-sm leading-relaxed">
            Three fields are all we need to call you back. The rest helps us come to the
            conversation prepared.
          </p>
          <InquiryForm />
        </div>

        <aside className="text-nybb-ink/75 space-y-8 text-sm leading-relaxed">
          {/* THE FEE AND THE CAPITAL FIGURE ARE DELIBERATELY NOT PRINTED HERE.
              ================================================================
              They were, as a two row table under the heading "The numbers":
              PHP 1,000,000 of franchise fee and PHP 9,000,000 of capital. Both
              are still true and both are published by the franchisor, so this
              is not a correction. It is a decision about what this page is for.

              A number that large, read cold and with nothing beside it, is the
              whole conversation. It answers "can I afford this" before the page
              has said what the money buys, what support comes with it or what a
              counter actually returns, and none of that is written yet: the
              sales case is the F2 work, still blocked on copy from Marketing.
              So the figures were doing the arguing with no argument behind
              them, and the form below them is the thing this page exists for.

              The inquiry asks for four fields and a sentence. Somebody who
              sends it gets the terms that apply to them from Five Brad Dragons
              directly, which the removed caption already said was the only
              place binding terms come from.

              If they come back, they belong beside the case for them, not in
              the margin of a contact form. The numbers themselves are kept in
              docs/IMPLEMENTATION-PROMPT.md and PRODUCT.md. */}
          <section>
            <h2 className="type-caps text-nybb-ink/50">Talk to a person</h2>
            <p className="mt-3">
              Five Brad Dragons Food Franchise Corporation
              <br />
              Unit D, 20th Floor, Latitude Corporate Center
              <br />
              Mindanao Ave., Cebu Business Park, Cebu City
            </p>
            <p className="mt-3">
              <a
                href="mailto:franchise@5bdf.ph"
                className="text-nybb-ink underline underline-offset-4"
              >
                franchise@5bdf.ph
              </a>
              <br />
              <a
                href={telHref("(032) 520-4930")}
                className="text-nybb-ink underline underline-offset-4"
              >
                (032) 520-4930
              </a>
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
