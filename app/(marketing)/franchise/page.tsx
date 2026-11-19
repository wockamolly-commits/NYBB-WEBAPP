import type { Metadata } from "next";
import Image from "next/image";
import { ButtonLink } from "@/components/ui/Button";
import { telHref } from "@/lib/phone";

export const metadata: Metadata = {
  title: "Franchise",
  description:
    "Open a New York Buffalo Brad's Hot Wings franchise. Read the franchise brochures and talk to Five Brad Dragons Food Franchise Corporation in Cebu.",
};

/**
 * Where a franchise inquiry goes.
 *
 * The inquiry used to be a form on this page that wrote to
 * `franchise_inquiries` and mailed an alert. The business replaced it with a
 * Google Form it runs itself, so every "Let's talk" here leaves the site. The
 * table and the workspace's Franchise leads screen stay, because the leads
 * already in it are still somebody's call to return.
 */
const LETS_TALK_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSf3OstRZBpY1q2XYX76Px_8XlsF1_YAX72Fh7-F86tmHawYmQ/viewform?usp=send_form";

/**
 * The two brochures, exactly as the franchisor printed them.
 *
 * They are images of text, so each carries a written summary as its alt. A
 * screen reader gets the substance of the page rather than "brochure".
 *
 * THE CAPITAL FIGURE IS NOW ON THIS PAGE, AND THAT IS DELIBERATE.
 * ================================================================
 * The old page kept PHP 9,000,000 out of its own copy because a number that
 * large, read cold with nothing beside it, did all the arguing. The second
 * brochure prints it inside the case for it: what the capital covers, the
 * support listed on the first brochure, and the menu a franchisee sells. That
 * is the context the old note asked for, and the business supplied it.
 */
const brochures = [
  {
    src: "/franchise/brochure-franchise-with-us.webp",
    width: 1159,
    height: 1500,
    title: "Franchise with us",
    caption: "What a franchisee receives, and the branches you can visit today.",
    alt: "Franchise with us brochure. New York Buffalo Brad's Hot Wings branches at IT Park, CTS Mactan and Mango Square, with photos of three stores. A franchisee receives site approval and survey, use of the trademark, opening assistance, an operations manual, marketing support, training for the franchisee and staff, research and development, and a procurement program. Contact nybuffalofranchise@5bdf.ph, 09177037372, or nybuffalobrads on Facebook.",
  },
  {
    src: "/franchise/brochure-investment-and-menu.webp",
    width: 1159,
    height: 1500,
    title: "Investment and menu",
    caption: "What the capital covers, and the menu you would be serving.",
    alt: "Investment and menu brochure. Estimated capital starts at PHP 9,000,000, inclusive of store construction (fit out) of at least 150 square metres, equipment and facilities, furniture and fixtures, signage, pre-opening expenses (training fee, initial stocks, grand opening), an initial franchise term of 5 years, and the franchise fee. The menu covers wings in ten flavours, burgers and sandwiches, hotdogs, pasta, ribs, NY fries and value meals.",
  },
];

export default function FranchisePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
        <div>
          <h1 className="font-display heading-page">Open for franchise</h1>
          <p className="text-nybb-ink/75 mt-4 max-w-xl text-base leading-relaxed">
            New York Buffalo Brad&rsquo;s is operated and franchised by Five Brad Dragons Food
            Franchise Corporation, based in Cebu Business Park. Read the brochures below, then
            tell us where you are looking to open.
          </p>
        </div>
        <ButtonLink
          href={LETS_TALK_URL}
          target="_blank"
          rel="noopener noreferrer"
          tone="light"
          size="lg"
          className="self-start sm:self-auto"
          aria-label="Let's talk (opens the franchise inquiry form in a new tab)"
        >
          Let&rsquo;s talk
          <ExternalIcon />
        </ButtonLink>
      </div>

      {/* Charcoal behind the brochures, not the amber page. Both are printed
          on orange, and orange on amber is a smear; on charcoal they read as
          two sheets laid on a table. */}
      <section
        aria-labelledby="brochures-heading"
        className="bg-nybb-charcoal text-nybb-bone mt-10 rounded-md p-4 sm:p-8"
      >
        <h2 id="brochures-heading" className="font-display heading-minor px-1 sm:px-0">
          Franchise brochures
        </h2>
        <p className="text-nybb-bone/65 mt-2 px-1 text-sm leading-relaxed sm:px-0">
          Tap a brochure to open it at full size.
        </p>

        <ul className="mt-6 grid gap-6 md:grid-cols-2 md:gap-8">
          {brochures.map((brochure) => (
            <li key={brochure.src}>
              <figure>
                <a
                  href={brochure.src}
                  target="_blank"
                  rel="noopener"
                  aria-label={`${brochure.title} brochure, open at full size in a new tab`}
                  className="group block overflow-hidden rounded-sm shadow-lg ring-1 ring-black/20 transition-transform duration-200 ease-out hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-nybb-orange motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <Image
                    src={brochure.src}
                    width={brochure.width}
                    height={brochure.height}
                    alt={brochure.alt}
                    sizes="(min-width: 1152px) 520px, (min-width: 768px) 45vw, 100vw"
                    className="h-auto w-full"
                  />
                </a>
                <figcaption className="mt-3 flex items-baseline justify-between gap-4 px-1 sm:px-0">
                  <span>
                    <span className="font-display block text-lg tracking-[0.04em]">
                      {brochure.title}
                    </span>
                    <span className="text-nybb-bone/65 text-sm">{brochure.caption}</span>
                  </span>
                  <a
                    href={brochure.src}
                    target="_blank"
                    rel="noopener"
                    className="text-nybb-bone/80 hover:text-nybb-bone shrink-0 text-sm underline underline-offset-4"
                  >
                    Full size
                  </a>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-[3fr_2fr] lg:gap-12">
        <section
          aria-labelledby="lets-talk-heading"
          className="border-nybb-ink/20 rounded-md border p-6 sm:p-8"
        >
          <h2 id="lets-talk-heading" className="font-display heading-minor">
            Ready to open your own counter?
          </h2>
          <p className="text-nybb-ink/75 mt-3 max-w-lg text-sm leading-relaxed">
            Tell us who you are and where you are looking to open. The form takes a couple of
            minutes, and the franchise team will get back to you with the terms that apply to
            your location.
          </p>
          <ButtonLink
            href={LETS_TALK_URL}
            target="_blank"
            rel="noopener noreferrer"
            tone="light"
            size="lg"
            className="mt-6"
            aria-label="Let's talk (opens the franchise inquiry form in a new tab)"
          >
            Let&rsquo;s talk
            <ExternalIcon />
          </ButtonLink>
        </section>

        <aside className="text-nybb-ink/75 text-sm leading-relaxed">
          <section>
            <h2 className="type-caps text-nybb-ink/70">Talk to a person</h2>
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

/** The usual "leaves this site" arrow, so a new tab is never a surprise. */
function ExternalIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <path d="M6 3H3.5A.5.5 0 0 0 3 3.5v9a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V10" />
      <path d="M9 3h4v4" />
      <path d="M13 3 7.5 8.5" />
    </svg>
  );
}
