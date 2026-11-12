import Link from "next/link";
import { legalDetails, pendingDetails, type LegalDetails } from "@/lib/legal/details";

/**
 * The pieces the Privacy Policy and the Terms of Service share.
 *
 * Both are long reading on the amber ground, so this is plain ink type at a
 * comfortable measure and nothing else: no cards, no reveal on scroll. A legal
 * page that animates in is a legal page somebody cannot print or skim.
 */

/**
 * A fact only the owner can supply, shown as exactly that.
 *
 * Visible on purpose, on the live page as much as in a preview. A placeholder
 * hidden from customers would be a policy quietly missing its controller or
 * its refund rule, which is the thing the page exists to state.
 */
export function Pending({ children }: { children: React.ReactNode }) {
  return (
    <mark className="border-nybb-ink/60 bg-nybb-cream text-nybb-ink rounded border border-dashed px-1.5 py-0.5 font-mono text-[0.85em] not-italic">
      [To be supplied by the owner: {children}]
    </mark>
  );
}

/** One owner-supplied value, or its placeholder when it is still null. */
export function Detail({ field, label }: { field: keyof LegalDetails; label: string }) {
  const value = legalDetails[field];
  return value ? <>{value}</> : <Pending>{label}</Pending>;
}

function formatEffectiveDate(value: string): string {
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-PH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Manila",
  });
}

export function LegalPage({
  title,
  intro,
  sibling,
  lastUpdated,
  children,
}: {
  title: string;
  intro: React.ReactNode;
  /** The other legal page, linked under the title. */
  sibling: { href: string; label: string };
  /**
   * For a page whose text the owner supplied as a finished document, the
   * "Last Updated" date printed on that document, as YYYY-MM-DD. It replaces
   * the shared effective date, and the page carries no draft notice, because
   * nothing on it is waiting on `legalDetails`.
   */
  lastUpdated?: string;
  children: React.ReactNode;
}) {
  const pending = lastUpdated ? [] : pendingDetails(legalDetails);
  const effective = legalDetails.effectiveDate;
  const dateLine = lastUpdated ? (
    <>Last updated {formatEffectiveDate(lastUpdated)}.</>
  ) : (
    <>Effective {effective ? formatEffectiveDate(effective) : <Pending>effective date</Pending>}.</>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display heading-page">{title}</h1>
      <p className="text-nybb-ink/70 mt-4 text-sm">
        {dateLine}
        {" "}See also the{" "}
        <Link href={sibling.href} className="text-nybb-ink underline decoration-nybb-ink/40 underline-offset-4 hover:decoration-nybb-ink">
          {sibling.label}
        </Link>
        .
      </p>

      {pending.length > 0 ? (
        // Says plainly that the text is not final, so nobody mistakes a
        // bracketed gap for the business's answer.
        <p
          role="note"
          className="border-nybb-ink text-nybb-ink mt-6 border-l-2 pl-3 text-sm leading-relaxed"
        >
          This page is a draft. Details marked &ldquo;To be supplied by the owner&rdquo; are still
          being confirmed by the business and will be filled in before this text takes effect.
        </p>
      ) : null}

      {intro ? (
        <div className="text-nybb-ink/85 mt-8 space-y-4 text-base leading-relaxed">{intro}</div>
      ) : null}

      <div className="mt-4">{children}</div>
    </div>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="mt-12 scroll-mt-28">
      <h2 id={`${id}-heading`} className="font-display heading-minor">
        {title}
      </h2>
      <div className="text-nybb-ink/85 mt-4 space-y-4 text-base leading-relaxed [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/** A numbered subsection inside a LegalSection, such as "2.1 Personal Data". */
export function LegalSubsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-2">
      <h3 className="text-nybb-ink text-lg font-semibold">{title}</h3>
      <div className="mt-2 space-y-4">{children}</div>
    </div>
  );
}
