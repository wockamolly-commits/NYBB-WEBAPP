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
      <h1 className="font-display heading-hero">
        Branches
      </h1>
      <p className="text-nybb-ink/75 mt-4 max-w-lg text-base leading-relaxed">
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
          className="mt-9 aspect-[3/2] w-full rounded-md object-cover sm:aspect-[21/9]"
          priority
        />
      ) : null}

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {branches.map((branch) => (
          <li
            key={branch.slug}
            className="bg-nybb-charcoal text-nybb-bone flex flex-col rounded-md p-5"
          >
            <p className="font-mono-tabular text-nybb-bone/60 text-[11px] tracking-[0.14em] uppercase">
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
            <ul className="mt-3">
              {branch.phones.map((phone) => (
                <li key={phone}>
                  <a
                    href={telHref(phone)}
                    className="font-mono-tabular text-nybb-orange hover:text-nybb-orange-lit inline-flex min-h-11 items-center text-sm transition-colors"
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
      <p className="border-nybb-ink/40 text-nybb-ink/75 mt-8 rounded-md border border-dashed p-4 text-sm">
        Opening hours vary by branch and are not published here yet. Call ahead
        if you are travelling for a specific counter.
      </p>

      {/* A dark panel, not an orange tint.

          This was border-nybb-orange/30 over bg-nybb-orange/5. Against the
          amber page ground that border measures about 1.4:1 and the fill is
          indistinguishable from the gradient, so the panel had no edges: it
          read as loose text under the branch grid rather than as a block. The
          two orange contact links inside it were failing at 1.8:1 for the same
          reason.

          Charcoal fixes both at once. It is the surface every other card on
          this page already uses, it separates from amber by value rather than
          by a hairline, and orange on charcoal measures 5.4:1, so the email
          and the landline become legible without changing colour. */}
      <section className="bg-nybb-charcoal text-nybb-bone mt-12 rounded-md p-6 sm:p-8">
        <h2 className="font-display text-2xl leading-none sm:text-3xl">
          Franchise enquiries
        </h2>
        <p className="text-nybb-bone/65 mt-3 max-w-lg text-sm leading-relaxed">
          Five Brad Dragons Food Franchise Corporation, Unit D, 20th Floor,
          Latitude Corporate Center, Mindanao Avenue, Cebu Business Park, Cebu
          City.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 text-sm">
          <a
            href="mailto:franchise@5bdf.ph"
            className="font-mono-tabular text-nybb-orange hover:text-nybb-orange-lit inline-flex min-h-11 items-center transition-colors"
          >
            franchise@5bdf.ph
          </a>
          <a
            href={telHref("(032) 520-4930")}
            className="font-mono-tabular text-nybb-orange hover:text-nybb-orange-lit inline-flex min-h-11 items-center transition-colors"
          >
            (032) 520-4930
          </a>
        </div>
      </section>
    </div>
  );
}
