import type { Metadata } from "next";
import Image from "next/image";
import { BranchDirectory, type BranchEntry } from "@/components/branches/BranchDirectory";
import { BranchesLiveRefresh } from "@/components/branches/BranchesLiveRefresh";
import { ButtonLink } from "@/components/ui/Button";
import { summarizeWeek, weekdayIn, weekFor, type StoreHoursRow } from "@/lib/branches/hours";
import { getStoreHours } from "@/lib/branches/hours-reader";
import { directionsUrl, mapEmbedUrl } from "@/lib/branches/map";
import { listStores } from "@/lib/branches/reader";
import type { Store } from "@/lib/branches/types";
import { branchFormatLabel, branches, catalogImage } from "@/lib/catalog";
import { telHref } from "@/lib/phone";

export const metadata: Metadata = {
  title: "Branches",
  description:
    "Every NYBB Hot Wings counter in Cebu, with addresses, phone numbers, opening hours and a map.",
};

/**
 * The directory is published fact first and live data second.
 *
 * The nine counters, their streets, their numbers and their pins come from the
 * catalog and need no database. Whether a counter is open this minute and what
 * its week looks like come from Postgres. If that read fails, the page still
 * lists every counter with a map and a number to call, and says the hours
 * could not be loaded: a directory that returns a 500 because an opening time
 * could not be fetched has lost the one job it had.
 *
 * `hours` is null when the read failed, never an empty list, so a failed read
 * is not rendered as a counter with no schedule. See `getStoreHours`.
 */
async function readLive(): Promise<{ stores: Store[]; hours: StoreHoursRow[] | null }> {
  const [stores, hours] = await Promise.allSettled([listStores(), getStoreHours()]);

  if (stores.status === "rejected") console.error("[contact] stores read failed", stores.reason);
  if (hours.status === "rejected") console.error("[contact] hours read failed", hours.reason);

  return {
    stores: stores.status === "fulfilled" ? stores.value : [],
    hours: hours.status === "fulfilled" ? hours.value : null,
  };
}

export default async function ContactPage() {
  const hero = catalogImage("branch-mango-avenue");
  const { stores, hours } = await readLive();
  const bySlug = new Map(stores.map((store) => [store.slug, store]));

  const entries: BranchEntry[] = branches.map((branch) => {
    const live = bySlug.get(branch.slug)?.branch ?? null;
    const week = hours ? weekFor(hours, branch.slug) : null;

    return {
      slug: branch.slug,
      // The workspace can rename a live branch without a deploy, so the
      // database's name wins wherever it has one. The address and the pin
      // stay the catalog's, because the map has to agree with the street.
      shortName: live?.shortName ?? branch.shortName,
      formatLabel: branchFormatLabel[branch.format],
      addressLine: branch.addressLine,
      city: branch.city,
      phones: live?.phones.length ? live.phones : branch.phones,
      mapUrl: mapEmbedUrl(branch),
      directionsUrl: directionsUrl(branch),
      pinned: Boolean(branch.pin),
      week,
      hoursUnavailable: hours === null,
      summary: summarizeWeek(week),
      openNow: live ? live.isOpenNow : null,
      today: weekdayIn(live?.timezone ?? "Asia/Manila"),
    };
  });

  const hoursUnavailable = hours === null;
  const allPublished = entries.every((entry) => entry.week);
  const nonePublished = entries.every((entry) => !entry.week);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display heading-page">Branches</h1>
      <p className="text-nybb-ink/75 mt-4 max-w-lg text-base leading-relaxed">
        {branches.length} counters across Cebu, from street fronts to food halls
        to petrol stations. Open any of them for a map, its hours and directions,
        or pick one on the ordering page and the kitchen will hold a window for
        you.
      </p>

      {/* A directory and a decision are different jobs, so they are different
          pages, but somebody who came here looking for a shop to order from
          should not have to find the other one by guessing. Ghost weight: this
          page's own content is the nine cards below, and this is a door out of
          it rather than its purpose. */}
      <div className="mt-6">
        <ButtonLink href="/stores" tone="light" variant="secondary">
          Choose a counter to order from
        </ButtonLink>
      </div>

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

      <BranchDirectory branches={entries} />
      <BranchesLiveRefresh />

      {/* Hours come from the owner's schedule in the workspace, and only for
          counters this platform is live on. Guessing the rest is exactly how
          the reference project shipped a placeholder schedule that silently
          gated ordering, so the page says what is true, and says it in
          whichever of three shapes the data is actually in. */}
      {!allPublished ? (
        <p className="border-nybb-ink/40 text-nybb-ink/75 mt-8 rounded-md border border-dashed p-4 text-sm">
          {hoursUnavailable
            ? "Opening hours could not be loaded just now. Call ahead if you are travelling for a specific counter."
            : nonePublished
            ? "Opening hours vary by branch and are not published here yet. Call ahead if you are travelling for a specific counter."
            : "Opening hours are published for the counters taking online orders. For the others, call ahead if you are travelling for a specific counter."}
        </p>
      ) : null}

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
        <h2 className="font-display heading-minor">Franchise enquiries</h2>
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
