import type { Metadata } from "next";
import { LegalPage, LegalSection, LegalSubsection } from "@/components/legal/LegalDocument";
import { NpcSeal } from "@/components/legal/NpcSeal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How 5 Brad's Dragon Food Corporation collects, uses, shares and protects your personal data under the Data Privacy Act of 2012.",
};

/**
 * The Privacy Policy.
 *
 * The text is the company's own Privacy Notice, supplied by the owner as
 * "NY Privacy Policy.pdf" (Last Updated February 18, 2026), copied here as
 * written. Edits made in copying, and only these:
 *
 *   - the one em dash in section 1 became a comma (house style);
 *   - the second of two subsections both numbered "2.2" is numbered 2.3.
 *
 * Change the wording only when the owner supplies a revised notice, and
 * update `lastUpdated` below to the date printed on it.
 *
 * The NPC seal in section 11 renders only while it is valid; see `npcSeal`
 * in lib/legal/details.ts.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Notice"
      sibling={{ href: "/terms", label: "Terms of Service" }}
      lastUpdated="2026-02-18"
      intro={null}
    >
      <LegalSection id="background" title="1. Company Background">
        <p>
          5 Brad&rsquo;s Dragon Food Corporation (&ldquo;5BDF Corporation&rdquo;,
          &ldquo;Company&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) operates
          restaurant outlets, franchises, promotional campaigns, online platforms, and related
          food-service operations. We are committed to handling personal data in accordance with
          Republic Act No. 10173 (Data Privacy Act of 2012), its Implementing Rules and Regulations
          (&ldquo;IRR&rdquo;), National Privacy Commission (NPC) issuances, and other applicable
          laws.
        </p>
        <p>
          This Privacy Policy explains how we collect, process, use, store, share, secure, and
          protect your personal data when you engage with us, whether through our stores,
          promotions, raffle entries, loyalty activities, websites, online forms, QR codes, or
          social media platforms.
        </p>
      </LegalSection>

      <LegalSection id="collect" title="2. What We Collect">
        <LegalSubsection title="2.1 Personal Data">
          <p>
            Personal data refers to any information that can be used, either on its own or together
            with other details, to identify a person.
          </p>
          <p>
            &ldquo;Personal data&rdquo; refers to any information that identifies you, whether alone
            or combined with other information. This includes but is not limited to:
          </p>
          <ul>
            <li>Full name</li>
            <li>Date of birth or age</li>
            <li>Address or location</li>
            <li>Email address</li>
            <li>Contact number</li>
            <li>Payment information</li>
            <li>Social media accounts or handles</li>
            <li>
              Any information submitted through forms, surveys, feedback, or promotional entries
            </li>
          </ul>
        </LegalSubsection>

        <LegalSubsection title="2.2 Sensitive Personal Information">
          <p>
            We do not intentionally collect sensitive personal data (e.g., government IDs, health
            data) unless legally required and explicitly provided by you.
          </p>
        </LegalSubsection>

        <LegalSubsection title="2.3 Information We Collect">
          <p>
            When you access any of our websites, services, or raffles we may collect personal
            information, such as your full name, date of birth, address or location, email address,
            contact number, payment information, and other information required to enable your
            access to our service or website. These may include but not limited to:
          </p>
          <ul>
            <li>IP addresses</li>
            <li>Device information</li>
            <li>Browser type</li>
            <li>Cookies and tracking technologies</li>
            <li>Usage data and browsing behavior</li>
          </ul>
          <p>These are processed primarily for security, analytics, and service improvement.</p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection id="how" title="3. How We Collect Data">
        <p>
          5BDF Corporation collects data when you access any of our websites, services, or raffles
          (e.g. promo pages, physical forms, QR codes, inquiries, orders, or feedback).
        </p>
      </LegalSection>

      <LegalSection id="purposes" title="4. Purposes and Bases for Data Collection">
        <p>
          5BDF Corporation processes personal data only for legitimate, specified, and lawful
          purposes, and only to the extent necessary.
        </p>

        <LegalSubsection title="4.1 Why We Collect and Use">
          <p>
            When you access our website, services, or raffles, we collect certain information to
            serve the following purposes:
          </p>
          {PURPOSES.map((purpose) => (
            <div key={purpose.number}>
              <p>
                {purpose.number}{" "}
                <strong className="text-nybb-ink">{purpose.title}</strong>
                {purpose.note ? ` ${purpose.note}` : null}
              </p>
              <ul className="mt-1 [&>li]:mt-1" style={{ listStyleType: "circle" }}>
                {purpose.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </LegalSubsection>

        <LegalSubsection title="4.2 Marketing Communications and Consent">
          <p>
            We may use data from past promotions, including raffle entries, for future marketing if
            you previously consented under our Privacy Policy. You may opt out at any time using
            &ldquo;STOP&rdquo; instructions in SMS, unsubscribe links, or by contacting our company.
          </p>
          <p>
            Third-party providers sending messages on our behalf follow strict confidentiality
            rules. Any sharing of your data with other companies for their marketing requires your
            explicit consent. We keep records of your consent to ensure your rights are protected.
          </p>
          <p>Withdrawal of consent does not affect the lawfulness of previous processing.</p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection id="sharing" title="5. Data Sharing and Disclosure">
        <LegalSubsection title="5.1 How We Handle Your Information">
          <p>
            We do not sell or share your personal data with outside parties not involved with our
            services. All personal data collected will be handled with strict confidentiality and
            protected in accordance with applicable data protection laws.
          </p>
        </LegalSubsection>

        <LegalSubsection title="5.2 Authorized Data Recipients">
          <p>
            We may share personal data with authorized employees and representatives who require
            access to perform their duties; related companies, such as third-party service
            providers or partners who process data on our behalf under strict confidentiality
            agreements and contractual safeguards in compliance with our laws; government
            authorities or regulators when required by law or court order; other parties as you may
            authorize or as allowed by law.
          </p>
        </LegalSubsection>

        <LegalSubsection title="5.3 Rights of Data Provider">
          <p>
            You have the right to be informed about how your data is collected and used, access and
            request a copy of your personal data, rectify inaccurate or outdated information, object
            to or withdraw consent to data processing, and request deletion or blocking of your data
            under certain circumstances.
          </p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection id="retention" title="6. Data Retention">
        <p>
          We retain personal data only for as long as necessary to fulfill the purposes stated
          above or as required by applicable laws and regulations. When no longer needed, the data
          will be removed or rendered anonymous in a secure manner.
        </p>
      </LegalSection>

      <LegalSection id="security" title="7. Data Security">
        <p>
          We implement measures to protect your data against loss, unauthorized access, alteration,
          or disclosure. Only authorized personnel have access to your personal data. However, no
          system can be completely immune to breaches. If any personal data under our control is
          compromised due to any security incident, we will make reasonable efforts to investigate
          the matter and, if appropriate and required, notify affected individuals and take further
          actions in compliance with the Data Privacy Act of 2012 and applicable rules and
          regulations.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="8. Cookies">
        <p>
          A &ldquo;cookie&rdquo; is a small piece of text or data that a website stores on a
          user&rsquo;s device when they visit a website. Cookies are primarily used to help websites
          remember information about the user to improve their browsing experience. Our website may
          use cookies to enhance your browsing experience. You may manage or disable cookies through
          your browser settings.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="9. Updates to This Policy">
        <p>
          5BDF Corporation may update or modify this Privacy Policy at any time to ensure
          consistency with evolving business practices, legal developments, or regulatory
          directives. Any revisions will be posted with an updated &ldquo;Last Updated&rdquo; date.
        </p>
        <p>
          We encourage you to review this policy periodically to stay informed about how we
          safeguard your personal data. The continued use of our websites, services, or raffles
          after such updates signifies your acknowledgement and acceptance of the amended Privacy
          Policy.
        </p>
      </LegalSection>

      <LegalSection id="acknowledgement" title="10. Acknowledgement">
        <p>
          By using our website, services, or raffles, you confirm that you have read and understood
          this Privacy Policy. You also voluntarily agree and give your consent to the collection,
          use, storage, and processing of your personal data in accordance with the terms stated
          herein, in line with the applicable laws.
        </p>
      </LegalSection>

      <LegalSection id="controller" title="11. Controller">
        <p>
          The identity of the respective controller of 5BDF Corporation, which processes your
          personal information, is provided below:
        </p>
        <div className="flex flex-col items-center text-center">
          <p>
            <strong className="text-nybb-ink">New York Buffalo Brad&rsquo;s Hot Wings</strong>
            <br />
            Brand
          </p>
          <NpcSeal />
          <p className="mt-6">
            <strong className="text-nybb-ink text-xl">5BDF Corporation</strong>
            <br />
            Controller
          </p>
        </div>
      </LegalSection>

      <LegalSection id="dpo" title="12. Contact Us">
        <p>
          If you have questions or concerns regarding this Privacy Policy or our data processing
          practices or if you wish to exercise your rights as a data provider or unsubscribe to any
          of our promotional communications, you may submit your request or contact our Data
          Protection Officer. We may ask you to verify your identity and provide additional
          documents necessary to process your request.
        </p>
        <address className="not-italic">
          <strong className="text-nybb-ink">
            Data Protection Officer
            <br />
            5BDF Corporation
            <br />
            968 Marconi Street, Lahug, Cebu City
            <br />
            Email:{" "}
            <a
              href="mailto:headoffice@5bdf.ph"
              className="underline decoration-nybb-ink/40 underline-offset-4 hover:decoration-nybb-ink"
            >
              headoffice@5bdf.ph
            </a>
          </strong>
          <br />
          Phone: (032) 520-4930 to 34
          <br />
          Business Hours: 08:00AM-05:00PM, Monday-Friday
        </address>
      </LegalSection>
    </LegalPage>
  );
}

const PURPOSES: { number: string; title: string; note?: string; items: string[] }[] = [
  {
    number: "4.1.1.",
    title: "Promo and Raffle Management",
    items: [
      "Verification of eligibility",
      "Contacting winners",
      "Delivery or claiming of prizes",
      "Processing of claims or disputes related to a promotion",
      "Compliance with DTI, tax, and regulatory requirements",
    ],
  },
  {
    number: "4.1.2.",
    title: "Customer Service and Business Operations",
    items: [
      "Responding to inquiries or requests",
      "Improving restaurant operations, customer experience, and product offerings",
      "Maintaining internal records and documentation",
    ],
  },
  {
    number: "4.1.3.",
    title: "Service Fulfillment",
    items: [
      "Processing orders, reservations, payments, or transactions",
      "Providing updates or notifications related to your transactions with us",
    ],
  },
  {
    number: "4.1.4.",
    title: "Legal and Regulatory Compliance",
    items: [
      "Compliance with government requirements",
      "Internal audits and risk management",
      "Responding to lawful requests by authorities",
    ],
  },
  {
    number: "4.1.5.",
    title: "Security and Fraud Prevention",
    items: [
      "Detecting suspicious or fraudulent activity",
      "Ensuring the safety and integrity of our systems",
    ],
  },
  {
    number: "4.1.6.",
    title: "Marketing and Promotional Activities",
    note: "(subject to your consent)",
    items: [
      "Sending marketing messages (SMS/email/online) about our restaurants, products, services, or future promotions",
      "Using past promo data (e.g., raffle entries) to assess customer preferences",
      "Inclusion in customer engagement programs, loyalty initiatives, or market research",
    ],
  },
];
