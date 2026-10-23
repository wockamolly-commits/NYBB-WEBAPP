import type { Metadata } from "next";
import Link from "next/link";
import { Detail, LegalPage, LegalSection } from "@/components/legal/LegalDocument";
import { NpcSeal } from "@/components/legal/NpcSeal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What personal data New York Buffalo Brad's collects when you order or sign in, why, who processes it, and your rights under the Data Privacy Act.",
};

/**
 * The Privacy Policy.
 *
 * Written from what the code does, not from a template. Each claim below has
 * a place in the codebase that makes it true, and when that place changes the
 * sentence has to change with it:
 *
 *   Checkout fields        components/checkout/CustomerDetails.tsx, lib/checkout/schema.ts
 *   Account fields         app/(marketing)/account/actions.ts
 *   Franchise fields       lib/franchise/inquiry.ts (source_ip and user_agent left null, 0045)
 *   Sent to PayMongo       lib/paymongo/intents.ts, lib/customer/payment.ts
 *   Sentry scrubbing       lib/monitoring/sentry-options.ts
 *   Rate-limit keys        lib/rate-limit/address.ts, place_order in 0090
 *   Cookies and storage    lib/supabase/constants.ts, lib/branches/selection.ts,
 *                          lib/promos/used.ts, lib/cart/storage.ts
 *   Push                   push_subscriptions (0007, 0038), push_promo_optins (0075)
 *   Hosting regions        vercel.json (sin1), Supabase ap-southeast-1
 *
 * Owner-supplied facts come from lib/legal/details.ts and show as placeholders
 * until they are filled in.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      sibling={{ href: "/terms", label: "Terms of Service" }}
      intro={
        <>
          <p>
            This policy explains what personal data we collect when you use this website to order
            for pickup, sign in, or send a franchise inquiry, what we do with it, who else handles
            it on our behalf, and the rights you have over it under the Data Privacy Act of 2012
            (Republic Act No. 10173) and its implementing rules.
          </p>
          <p>
            &ldquo;We&rdquo; and &ldquo;us&rdquo; means <Detail field="businessName" label="registered business name" />,
            {" "}of <Detail field="businessAddress" label="registered business address" />, which operates New York
            Buffalo Brad&rsquo;s Hot Wings and this website and is the personal information
            controller for the data described here.
          </p>
          <NpcSeal />
        </>
      }
    >
      <LegalSection id="collect" title="What we collect">
        <p>
          <strong>When you place an order.</strong> Your name (so the counter can call it out), your
          mobile number (so the branch can reach you about the order), your email address if you
          choose to give it, and any kitchen notes you write, such as allergies. We also record what
          you ordered, the branch, the pickup time you chose, any promo code you used, the amounts,
          and the status of the order and its payment. You can order without an account.
        </p>
        <p>
          <strong>When you sign in.</strong> Your email address, which is how we send you a one-time
          login code. If you save them on your account page, your pickup name and mobile number, so
          checkout can fill them in for you. While you are signed in, your cart is saved to your
          account so it follows you between devices, and your orders are listed in your order
          history.
        </p>
        <p>
          <strong>When you send a franchise inquiry.</strong> Your name, email address, phone
          number, and the city and message you write, if any.
        </p>
        <p>
          <strong>When you turn on notifications.</strong> If you allow order updates or promo alerts
          in your browser, we store the technical address your browser gives us for delivering them
          (a push endpoint and its encryption keys) and which orders it should hear about. It
          contains no name or contact details. Promo alerts are a separate choice from order
          updates, and you can turn either off in your browser at any time.
        </p>
        <p>
          <strong>Automatically.</strong> To stop abuse, such as repeated login codes or bulk
          orders, we count requests per IP address and per email or phone number for a short window.
          IP addresses and email addresses are stored for this only as one-way hashes, not as you
          typed them; a guest&rsquo;s mobile number is used as written so a counter can be kept per
          number. If you ask the site to find the nearest branch, your browser asks for your
          permission first, and your location is used for that one calculation and not stored.
        </p>
        <p>
          <strong>What we never see.</strong> Card numbers, bank details, and e-wallet logins. Payment
          is completed on PayMongo&rsquo;s side, and we receive only the result.
        </p>
      </LegalSection>

      <LegalSection id="use" title="Why we use it">
        <ul>
          <li>
            To take, prepare and hand over your order, and to contact you about it if something
            changes (a sold-out item, a delay, or a refund). This is necessary to fulfil the order
            you asked for.
          </li>
          <li>To take payment and to issue refunds, through PayMongo.</li>
          <li>To let you sign in, see your order history, and reorder.</li>
          <li>To answer a franchise inquiry you sent us.</li>
          <li>
            To apply promo codes fairly, including limits on how many times one customer may use a
            code, which are counted by account or mobile number.
          </li>
          <li>
            To keep the site secure and working: preventing abuse, and finding and fixing errors.
          </li>
          <li>To keep the business and tax records the law requires us to keep.</li>
        </ul>
        <p>
          We do not sell your personal data, and we do not use it for advertising profiles. The site
          runs no analytics or advertising trackers.
        </p>
      </LegalSection>

      <LegalSection id="processors" title="Who processes it for us">
        <p>
          We use the following service providers to run the site. Each handles personal data only
          to provide its service to us.
        </p>
        <ul>
          <li>
            <strong>Supabase</strong>: our database and login service. Orders, accounts, saved
            profiles, carts, franchise inquiries and notification subscriptions are stored there,
            in Singapore.
          </li>
          <li>
            <strong>Vercel</strong>: hosts the website and runs its server code, in Singapore.
          </li>
          <li>
            <strong>PayMongo</strong>: processes payments and refunds. We send it the amount, the
            order reference, and your name, mobile number and email (if given) as billing details.
          </li>
          <li>
            <strong>Resend</strong>: delivers emails, namely your login codes and, for franchise
            inquiries, the alert that passes your inquiry to our franchise team.
          </li>
          <li>
            <strong>Sentry</strong>: receives reports when a page or the server fails, so we can
            fix it. Before a report leaves the site, IP addresses, cookies, form contents and
            account details are removed, and email addresses and mobile numbers in error text are
            blanked out.
          </li>
          <li>
            <strong>Google Maps and Mapbox</strong>: show branch maps and work out distances to a
            branch. A map you open is loaded from Google, and Mapbox receives your location only
            when you ask for the nearest branch.
          </li>
        </ul>
        <p>
          Some of these providers store or process data outside the Philippines, including in
          Singapore. Wherever it is processed, we remain responsible for it under the Data Privacy
          Act. We may also disclose personal data where the law requires it, for
          example to a court or a government agency with authority to ask.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies and storage on your device">
        <p>The site uses only what it needs to work. None of it tracks you across other sites.</p>
        <ul>
          <li>A login cookie, if you sign in, which keeps you signed in.</li>
          <li>A cookie remembering which branch you chose, for up to one year.</li>
          <li>
            A cookie remembering which promo codes this browser has already used, stored in a form
            that does not show the codes, for up to one year.
          </li>
          <li>
            Your cart, and a few display preferences such as whether order alerts make a sound,
            kept in your browser&rsquo;s own storage.
          </li>
        </ul>
        <p>You can clear all of these from your browser settings at any time.</p>
      </LegalSection>

      <LegalSection id="retention" title="How long we keep it">
        <p>
          <Detail field="retentionPolicy" label="how long orders, accounts, franchise inquiries and abuse-prevention records are kept, and when they are deleted or anonymised" />
        </p>
        <p>
          Notification subscriptions are removed when your browser reports them as no longer
          valid, and you can withdraw one yourself at any time by turning notifications off.
        </p>
      </LegalSection>

      <LegalSection id="security" title="How we protect it">
        <p>
          Data travels to and from the site encrypted. Access to the database is restricted by
          rules that let a customer see only their own orders and let staff see only what their
          role requires, and every staff change to an order, a refund or a setting is logged. Login
          uses one-time codes sent to your email, so there is no password to steal.
        </p>
        <p>
          If a breach puts your personal data at real risk, we will notify you and the National
          Privacy Commission as the law requires.
        </p>
      </LegalSection>

      <LegalSection id="rights" title="Your rights">
        <p>Under the Data Privacy Act you have the right to:</p>
        <ul>
          <li>be informed about how your personal data is processed, which is what this page is for;</li>
          <li>access the personal data we hold about you;</li>
          <li>have inaccurate or incomplete data corrected;</li>
          <li>object to processing, and withdraw consent you have given;</li>
          <li>have your data erased or blocked where the law allows;</li>
          <li>receive your data in a portable electronic format;</li>
          <li>be compensated for damages caused by unlawful processing; and</li>
          <li>file a complaint with the National Privacy Commission.</li>
        </ul>
        <p>
          You can update your pickup name and mobile number yourself on your{" "}
          <Link href="/account" className="text-nybb-ink underline decoration-nybb-ink/40 underline-offset-4 hover:decoration-nybb-ink">
            account page
          </Link>
          . For anything else, including closing your account or asking for a copy of your data,
          contact our Data Protection Officer below. We may need to confirm it is you before acting
          on a request, and some records, such as completed sales, may have to be kept for as long
          as tax law requires even after you ask us to delete them.
        </p>
      </LegalSection>

      <LegalSection id="dpo" title="Contact our Data Protection Officer">
        <ul>
          <li>Name: <Detail field="dpoName" label="Data Protection Officer's name" /></li>
          <li>Email: <Detail field="dpoEmail" label="Data Protection Officer's email" /></li>
          <li>Phone: <Detail field="dpoPhone" label="Data Protection Officer's phone" /></li>
          <li>Post: <Detail field="businessAddress" label="registered business address" /></li>
        </ul>
        <p>
          If you are not satisfied with our answer, you may complain to the National Privacy
          Commission at privacy.gov.ph.
        </p>
      </LegalSection>

      <LegalSection id="minors" title="Children">
        <p>
          The site is not aimed at children, and we do not knowingly collect personal data from
          anyone under 18 without a parent or guardian&rsquo;s consent. If you believe a child has
          given us personal data, contact the Data Protection Officer and we will delete it.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to this policy">
        <p>
          When what we collect or how we use it changes, we will update this page and its effective
          date. If a change is significant, we will say so on the site before it takes effect.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
