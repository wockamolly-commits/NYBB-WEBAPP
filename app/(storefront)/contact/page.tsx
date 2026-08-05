import type { Metadata } from "next";
import Image from "next/image";
import { branchFormatLabel, branches, catalogImage } from "@/lib/catalog";
import { telHref } from "@/lib/phone";

export const metadata: Metadata = {
  title: "Branches",
  description:
    "Every NYBB Hot Wings counter in Cebu, with addresses and phone numbers.",
};

export default function ContactPage() {
  const hero = catalogImage("branch-mango-avenue");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display text-[clamp(2.5rem,9vw,5rem)] leading-[0.88]">
        Branches
      </h1>
      <p className="text-nybb-bone/70 mt-4 max-w-lg text-base leading-relaxed">
        {branches.length} counters across Cebu, from street fronts to food halls
        to petrol stations. Call the one you want to collect from.
      </p>

      {hero ? (
        <Image
          src={hero.src}
          alt="The NYBB Hot Wings branch on Mango Avenue"
          width={hero.width}
          height={hero.height}
          sizes="(min-width: 1024px) 72rem, 100vw"
          placeholder="blur"
          blurDataURL={hero.blurDataURL}
          className="border-border mt-9 aspect-[3/2] w-full rounded-md border object-cover sm:aspect-[21/9]"
          priority
        />
      ) : null}

      <ul className="mt-10 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {branches.map((branch) => (
          <li
            key={branch.slug}
            className="border-border bg-nybb-charcoal flex flex-col rounded-md border p-5"
          >
            <p className="font-mono-tabular text-nybb-bone/45 text-[11px] tracking-[0.14em] uppercase">
              {branchFormatLabel[branch.format]}
            </p>
            <h2 className="font-display mt-2 text-xl leading-tight">
              {branch.shortName}
            </h2>
            <p className="text-nybb-bone/65 mt-2 text-sm leading-relaxed">
              {branch.addressLine}
              <br />
              {branch.city}
            </p>
            <ul className="mt-4 space-y-1">
              {branch.phones.map((phone) => (
                <li key={phone}>
                  <a
                    href={telHref(phone)}
                    className="font-mono-tabular text-nybb-orange hover:text-nybb-orange-lit text-sm transition-colors"
                  >
                    {phone}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {/* Weekday hours are not published anywhere the site can read, and
          guessing them is exactly how the reference project shipped a
          placeholder schedule that silently gated ordering. So the page says
          what is true. */}
      <p className="border-border text-nybb-bone/55 mt-8 rounded-md border border-dashed p-4 text-sm">
        Opening hours vary by branch and are not published here yet. Call ahead
        if you are travelling for a specific counter.
      </p>

      <section className="border-nybb-orange/30 bg-nybb-orange/5 mt-12 rounded-md border p-6 sm:p-8">
        <h2 className="font-display text-2xl leading-none sm:text-3xl">
          Franchise enquiries
        </h2>
        <p className="text-nybb-bone/70 mt-3 max-w-lg text-sm leading-relaxed">
          Five Brad Dragons Food Franchise Corporation, Unit D, 20th Floor,
          Latitude Corporate Center, Mindanao Avenue, Cebu Business Park, Cebu
          City.
        </p>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a
            href="mailto:franchise@5bdf.ph"
            className="font-mono-tabular text-nybb-orange hover:text-nybb-orange-lit transition-colors"
          >
            franchise@5bdf.ph
          </a>
          <a
            href={telHref("(032) 520-4930")}
            className="font-mono-tabular text-nybb-orange hover:text-nybb-orange-lit transition-colors"
          >
            (032) 520-4930
          </a>
        </div>
      </section>
    </div>
  );
}
