import type { AboutContent, ContentFor, ContentPage, HomeContent, LegalContent } from "./schema";

/**
 * The built-in text of every editable page.
 *
 * This is what the pages said before the content editor existed, moved here
 * verbatim from their JSX. A page shows this until somebody publishes from
 * /workspace/content, shows it again after "Restore the original text", and
 * falls back to it whenever the published copy cannot be read. So it is both
 * the starting point of the editor and the floor under the live site.
 *
 * The history of the wording (why the hero says what it says, what the
 * privacy text was copied from) is in the git log of the pages these came
 * from: app/(marketing)/page.tsx, about/page.tsx, privacy/page.tsx and
 * terms/page.tsx before the content editor shipped.
 */

export const DEFAULT_HOME: HomeContent = {
  hero: {
    tagline: "#Your All Time Favorite Chicken Wings",
    headline: "Wings worth",
    headlineAccent: "the burn.",
    lede: "Ten flavours, five levels of heat, fried to order.",
  },
  flavours: {
    title: "Ten flavours",
    body: "One shoot, one basket, ten sauces. Every one of them takes a level of heat on top, at no change to the flavour you picked.",
  },
  heat: {
    title: "Heat is on the menu",
    body: "Five stops, from a warm edge to something you will remember. Drag the bar and watch it catch. Pick a level and pay for the level, not for a different dish.",
    note: "Any level goes on top of any flavour. Choose for real on the wings page.",
  },
  pickup: {
    title: "How pickup works",
    steps: [
      {
        title: "Order from your phone",
        body: "The whole menu, with every flavour and every level of heat priced as you build it.",
      },
      {
        title: "Pick a collection time",
        body: "Fifteen minute windows. Full ones close, so the kitchen is never promised more than it can cook.",
      },
      {
        title: "We cook to your slot",
        body: "Your phone buzzes the moment the food is up, even on a locked screen.",
      },
      {
        title: "Quote your code",
        body: "Tap to say you have arrived, give the counter your four digit code, and go.",
      },
    ],
  },
  more: {
    title: "Not just wings",
    body: "Burgers, hotdogs, ribs and rice meals come off the same counter, so nobody in the group has to compromise.",
  },
  branches: {
    body: "Mall food halls, petrol forecourts, a medical mall and a resort.",
  },
  franchise: {
    line: "Open for franchise. Five Brad Dragons Food Franchise Corporation, Cebu Business Park.",
    email: "franchise@5bdf.ph",
  },
};

export const DEFAULT_ABOUT: AboutContent = {
  heading: { first: "A wing house,", second: "Cebu built" },
  intro: [
    "New York Buffalo Brad’s Hot Wings serves American style chicken wings across Cebu, from a street front on Mango Avenue to food hall counters, a medical mall, a resort and four petrol station forecourts. The brand is operated and franchised by Five Brad Dragons Food Franchise Corporation, based in Cebu Business Park.",
    "Wings come by the half order of six or the full order of ten, sauced in one of ten flavours. Alongside them sit burgers numbered BB1 to BB5, hotdogs numbered H1 to H5, ribs, pasta, waffles and an iced coffee line.",
    "The thing that makes the menu ours is the heat. Every flavour takes a level, from Lite at twenty percent up to Insane at a hundred, priced against the size you ordered rather than sold as a separate dish.",
  ].join("\n\n"),
  claim: {
    title: "All time favorite is a claim",
    body: [
      "It is a large thing to write on a wing shop, and it is not a claim about a website. It is a claim about one basket, handed across one counter, to somebody who is hungry now. That is the only place it can be won or lost, so that is where the argument gets settled.",
      "Which is why picking a sauce never costs more than picking a different one, why the heat is a number you choose rather than a dare somebody sets for you, and why a half order is six wings and a full order is ten with nothing else to work out. Fewer decisions, and none of them are traps.",
    ].join("\n\n"),
    signature: "#Your All Time Favorite Chicken Wings",
  },
  fried: {
    title: "Fried to order",
    body: [
      "Wings go into the fryer when the order does. That is the reason there is a wait, and it is the reason the wait is worth sitting through. What comes out is hot, in the basket, sauced to the level you asked for and not to the level somebody assumed you wanted.",
      "Then you collect it, or it comes to you. The shortest trip between the fryer and you is the counter, because fried chicken has a short window where the skin is still the point, so pickup is what this site is built for. When the counter is too far, delivery is ordered on [Tablevibe](https://buffalobrads.tablevibe.co/).",
      "Ordering ahead from your phone is being built, branch by branch. Until it lands the [menu](/menu) is here and every [branch number](/contact) takes an order.",
    ].join("\n\n"),
  },
};

export const DEFAULT_PRIVACY: LegalContent = {
  title: "Privacy Notice",
  dateLabel: "updated",
  date: "2026-02-18",
  intro: "",
  sections: [
    {
      id: "background",
      title: "1. Company Background",
      body: [
        "5 Brad’s Dragon Food Corporation (“5BDF Corporation”, “Company”, “we”, “us”, “our”) operates restaurant outlets, franchises, promotional campaigns, online platforms, and related food-service operations. We are committed to handling personal data in accordance with Republic Act No. 10173 (Data Privacy Act of 2012), its Implementing Rules and Regulations (“IRR”), National Privacy Commission (NPC) issuances, and other applicable laws.",
        "This Privacy Policy explains how we collect, process, use, store, share, secure, and protect your personal data when you engage with us, whether through our stores, promotions, raffle entries, loyalty activities, websites, online forms, QR codes, or social media platforms.",
      ].join("\n\n"),
    },
    {
      id: "collect",
      title: "2. What We Collect",
      body: [
        "### 2.1 Personal Data",
        "Personal data refers to any information that can be used, either on its own or together with other details, to identify a person.",
        "“Personal data” refers to any information that identifies you, whether alone or combined with other information. This includes but is not limited to:",
        [
          "- Full name",
          "- Date of birth or age",
          "- Address or location",
          "- Email address",
          "- Contact number",
          "- Payment information",
          "- Social media accounts or handles",
          "- Any information submitted through forms, surveys, feedback, or promotional entries",
        ].join("\n"),
        "### 2.2 Sensitive Personal Information",
        "We do not intentionally collect sensitive personal data (e.g., government IDs, health data) unless legally required and explicitly provided by you.",
        "### 2.3 Information We Collect",
        "When you access any of our websites, services, or raffles we may collect personal information, such as your full name, date of birth, address or location, email address, contact number, payment information, and other information required to enable your access to our service or website. These may include but not limited to:",
        [
          "- IP addresses",
          "- Device information",
          "- Browser type",
          "- Cookies and tracking technologies",
          "- Usage data and browsing behavior",
        ].join("\n"),
        "These are processed primarily for security, analytics, and service improvement.",
      ].join("\n\n"),
    },
    {
      id: "how",
      title: "3. How We Collect Data",
      body: "5BDF Corporation collects data when you access any of our websites, services, or raffles (e.g. promo pages, physical forms, QR codes, inquiries, orders, or feedback).",
    },
    {
      id: "purposes",
      title: "4. Purposes and Bases for Data Collection",
      body: [
        "5BDF Corporation processes personal data only for legitimate, specified, and lawful purposes, and only to the extent necessary.",
        "### 4.1 Why We Collect and Use",
        "When you access our website, services, or raffles, we collect certain information to serve the following purposes:",
        "4.1.1. **Promo and Raffle Management**",
        [
          "- Verification of eligibility",
          "- Contacting winners",
          "- Delivery or claiming of prizes",
          "- Processing of claims or disputes related to a promotion",
          "- Compliance with DTI, tax, and regulatory requirements",
        ].join("\n"),
        "4.1.2. **Customer Service and Business Operations**",
        [
          "- Responding to inquiries or requests",
          "- Improving restaurant operations, customer experience, and product offerings",
          "- Maintaining internal records and documentation",
        ].join("\n"),
        "4.1.3. **Service Fulfillment**",
        [
          "- Processing orders, reservations, payments, or transactions",
          "- Providing updates or notifications related to your transactions with us",
        ].join("\n"),
        "4.1.4. **Legal and Regulatory Compliance**",
        [
          "- Compliance with government requirements",
          "- Internal audits and risk management",
          "- Responding to lawful requests by authorities",
        ].join("\n"),
        "4.1.5. **Security and Fraud Prevention**",
        [
          "- Detecting suspicious or fraudulent activity",
          "- Ensuring the safety and integrity of our systems",
        ].join("\n"),
        "4.1.6. **Marketing and Promotional Activities** (subject to your consent)",
        [
          "- Sending marketing messages (SMS/email/online) about our restaurants, products, services, or future promotions",
          "- Using past promo data (e.g., raffle entries) to assess customer preferences",
          "- Inclusion in customer engagement programs, loyalty initiatives, or market research",
        ].join("\n"),
        "### 4.2 Marketing Communications and Consent",
        "We may use data from past promotions, including raffle entries, for future marketing if you previously consented under our Privacy Policy. You may opt out at any time using “STOP” instructions in SMS, unsubscribe links, or by contacting our company.",
        "Third-party providers sending messages on our behalf follow strict confidentiality rules. Any sharing of your data with other companies for their marketing requires your explicit consent. We keep records of your consent to ensure your rights are protected.",
        "Withdrawal of consent does not affect the lawfulness of previous processing.",
      ].join("\n\n"),
    },
    {
      id: "sharing",
      title: "5. Data Sharing and Disclosure",
      body: [
        "### 5.1 How We Handle Your Information",
        "We do not sell or share your personal data with outside parties not involved with our services. All personal data collected will be handled with strict confidentiality and protected in accordance with applicable data protection laws.",
        "### 5.2 Authorized Data Recipients",
        "We may share personal data with authorized employees and representatives who require access to perform their duties; related companies, such as third-party service providers or partners who process data on our behalf under strict confidentiality agreements and contractual safeguards in compliance with our laws; government authorities or regulators when required by law or court order; other parties as you may authorize or as allowed by law.",
        "### 5.3 Rights of Data Provider",
        "You have the right to be informed about how your data is collected and used, access and request a copy of your personal data, rectify inaccurate or outdated information, object to or withdraw consent to data processing, and request deletion or blocking of your data under certain circumstances.",
      ].join("\n\n"),
    },
    {
      id: "retention",
      title: "6. Data Retention",
      body: "We retain personal data only for as long as necessary to fulfill the purposes stated above or as required by applicable laws and regulations. When no longer needed, the data will be removed or rendered anonymous in a secure manner.",
    },
    {
      id: "security",
      title: "7. Data Security",
      body: "We implement measures to protect your data against loss, unauthorized access, alteration, or disclosure. Only authorized personnel have access to your personal data. However, no system can be completely immune to breaches. If any personal data under our control is compromised due to any security incident, we will make reasonable efforts to investigate the matter and, if appropriate and required, notify affected individuals and take further actions in compliance with the Data Privacy Act of 2012 and applicable rules and regulations.",
    },
    {
      id: "cookies",
      title: "8. Cookies",
      body: "A “cookie” is a small piece of text or data that a website stores on a user’s device when they visit a website. Cookies are primarily used to help websites remember information about the user to improve their browsing experience. Our website may use cookies to enhance your browsing experience. You may manage or disable cookies through your browser settings.",
    },
    {
      id: "changes",
      title: "9. Updates to This Policy",
      body: [
        "5BDF Corporation may update or modify this Privacy Policy at any time to ensure consistency with evolving business practices, legal developments, or regulatory directives. Any revisions will be posted with an updated “Last Updated” date.",
        "We encourage you to review this policy periodically to stay informed about how we safeguard your personal data. The continued use of our websites, services, or raffles after such updates signifies your acknowledgement and acceptance of the amended Privacy Policy.",
      ].join("\n\n"),
    },
    {
      id: "acknowledgement",
      title: "10. Acknowledgement",
      body: "By using our website, services, or raffles, you confirm that you have read and understood this Privacy Policy. You also voluntarily agree and give your consent to the collection, use, storage, and processing of your personal data in accordance with the terms stated herein, in line with the applicable laws.",
    },
    {
      id: "controller",
      title: "11. Controller",
      body: [
        "The identity of the respective controller of 5BDF Corporation, which processes your personal information, is provided below:",
        [
          "::: center",
          "**New York Buffalo Brad’s Hot Wings**",
          "Brand",
          "",
          "{{npc-seal}}",
          "",
          "**5BDF Corporation**",
          "Controller",
          ":::",
        ].join("\n"),
      ].join("\n\n"),
    },
    {
      id: "dpo",
      title: "12. Contact Us",
      body: [
        "If you have questions or concerns regarding this Privacy Policy or our data processing practices or if you wish to exercise your rights as a data provider or unsubscribe to any of our promotional communications, you may submit your request or contact our Data Protection Officer. We may ask you to verify your identity and provide additional documents necessary to process your request.",
        [
          "**Data Protection Officer**",
          "**5BDF Corporation**",
          "**968 Marconi Street, Lahug, Cebu City**",
          "**Email: [headoffice@5bdf.ph](mailto:headoffice@5bdf.ph)**",
          "Phone: (032) 520-4930 to 34",
          "Business Hours: 08:00AM-05:00PM, Monday-Friday",
        ].join("\n"),
      ].join("\n\n"),
    },
  ],
};

export const DEFAULT_TERMS: LegalContent = {
  title: "Terms of Service",
  dateLabel: "effective",
  date: "",
  intro:
    "These terms apply when you use this website to order New York Buffalo Brad’s Hot Wings for pickup. The website and the branches are operated by [[pending: registered business name]], of [[pending: registered business address]] (“we”, “us”). By placing an order you agree to these terms and to our [Privacy Policy](/privacy).",
  sections: [
    {
      id: "ordering",
      title: "Ordering for pickup",
      body: [
        "Orders placed on this website are for pickup only, at the branch and in the pickup window you choose at checkout. Delivery is not offered here; delivery orders placed through Tablevibe are covered by Tablevibe’s own terms.",
        "You can order as a guest or signed in. Please give a name and a mobile number that are really yours, so the branch can call out your order and reach you if something changes. A guest’s only way back to an order is the tracking link shown after checkout, so keep it.",
        "Kitchen notes are passed to the branch with your order. If an allergy is serious, call the branch before ordering to confirm what they can do.",
      ].join("\n\n"),
    },
    {
      id: "prices",
      title: "Prices and payment",
      body: [
        "Prices are in Philippine pesos and are the ones shown at checkout, worked out by our system from the current menu. Any promo discount is shown before you pay.",
        "Every order is paid online before the kitchen receives it. Payment is by QR Ph, processed by PayMongo, and we never see your bank or e-wallet login. Your order is sent to the branch only once PayMongo confirms the payment. If payment is not completed in time or fails, the order is cancelled automatically and its pickup slot is released.",
      ].join("\n\n"),
    },
    {
      id: "pickup",
      title: "Collecting your order",
      body: [
        "You will get a pickup code and a tracking page that shows when your order is being made and when it is ready. Show the code at the counter to collect it.",
        "**If you cannot collect your order:** [[pending: how long a ready order is held, and what happens to it and to the payment if it is not collected]]",
      ].join("\n\n"),
    },
    {
      id: "cancellations",
      title: "Cancellations",
      body: [
        "A branch may decline an order it cannot fulfil, for example when an item has sold out, the kitchen is too busy, or the branch is closing. If you have already paid, the order is refunded under the refund policy below.",
        "There is no cancel button on the site. To ask to cancel, call the branch you ordered from; their numbers are on the [branches page](/contact). [[pending: whether a customer can cancel a paid order, until when, and what is refunded]]",
      ].join("\n\n"),
    },
    {
      id: "refunds",
      title: "Refunds",
      body: [
        "[[pending: when an order is refunded in full or in part, how to ask for one, and how long it takes]]",
        "Refunds go back through PayMongo to the account you paid from. Your tracking page shows when a payment has been refunded.",
      ].join("\n\n"),
    },
    {
      id: "promos",
      title: "Promo codes",
      body: "Promo codes have their own conditions, such as a minimum order, an end date, a limit on uses per customer, or particular branches, and those are checked when the code is applied. A code has no cash value and cannot be combined with another code on the same order. If an order that used a code is cancelled, the use is returned to you.",
    },
    {
      id: "accounts",
      title: "Accounts",
      body: "Signing in uses a one-time code sent to your email. Keep access to that email secure, since anyone who can read it can sign in as you.",
    },
    {
      id: "liability",
      title: "Our responsibility",
      body: "We work to keep the site available and its menu, prices and opening hours correct, but the site may sometimes be unavailable or show something out of date. Nothing in these terms limits rights you have under Philippine consumer law, including the Consumer Act of the Philippines (Republic Act No. 7394).",
    },
    {
      id: "law",
      title: "Governing law and contact",
      body: [
        "These terms are governed by the laws of the Philippines. If something goes wrong with an order, call the branch first, since they can usually fix it fastest. For anything else, write to us at [[pending: registered business address]].",
        "We may update these terms. The version in effect when you place an order is the one that applies to it.",
      ].join("\n\n"),
    },
  ],
};

export const CONTENT_DEFAULTS: { [P in ContentPage]: ContentFor[P] } = {
  home: DEFAULT_HOME,
  about: DEFAULT_ABOUT,
  privacy: DEFAULT_PRIVACY,
  terms: DEFAULT_TERMS,
};
