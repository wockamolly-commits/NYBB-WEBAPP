import Image from "next/image";
import { HeatScale, type HeatLevel } from "@/components/site/HeatScale";
import { HeroVideo } from "@/components/site/HeroVideo";
import { FlavourGrid } from "@/components/menu/FlavourGrid";
import { ProductTile } from "@/components/menu/ProductTile";
import { ActionLink, TextLink } from "@/components/ui/ActionLink";
import { branches, catalogImage } from "@/lib/catalog";
import { optionPriceCents } from "@/lib/catalog/pricing";
import {
  featuredItems,
  findItem,
  findOptionGroup,
  getStorefrontMenu,
  WINGS_ITEM_SLUG,
  WING_FLAVOUR_GROUP_SLUG,
  WING_HEAT_GROUP_SLUG,
} from "@/lib/menu";
import { formatPesoCompact } from "@/lib/format";
import { telHref } from "@/lib/phone";

/**
 * The landing page.
 *
 * THESIS. Heat is the thing nobody else here sells. Every wing shop in Cebu
 * has flavours; this one prices heat as a product on a five stop scale, so
 * that scale is the page's one memorable object and everything else is
 * arranged to make it land. What the page refuses is the arrangement it had:
 * seven sections in one grammar, each a heading over a grid of dark cards,
 * none of them claiming to matter more than any other.
 *
 * STRUCTURE. Dark bands alternating with the amber ground, rather than
 * eighteen dark cards sitting on top of it:
 *
 *   dark    hero
 *   amber   nine flavours, the food this place is for
 *   dark    the heat scale, the signature
 *   amber   how pickup works, then the rest of the menu
 *   dark    branches, the close, with numbers you can actually call
 *   amber   franchise, one quiet line
 *
 * HIERARCHY. Three heading tiers, not one. The hero, then the two sections
 * that sell (flavours, heat) and the one that converts (branches), then the
 * two that reassure (pickup, the rest of the menu) at a visibly smaller size.
 * The size gap is the hierarchy.
 *
 * COLOUR. Orange only on dark. On the amber ground the brand orange measures
 * about 1.8:1 and vanished; every link, step number and CTA that used to be
 * orange on amber is now ink. See components/ui/ActionLink.tsx, which is where
 * that rule is enforced rather than remembered.
 *
 * MOTION. One authored moment, in one place: the five heat stops drawing
 * themselves in sequence as that section arrives. Nothing else on the page
 * animates except hover colour.
 *
 * WHAT IS TRUE TODAY. Online ordering is Phase 1 and is not built. The page
 * says so once, in the hero, under the buttons where it is read, and then
 * gives the visitor the working alternative at the end: nine branches and nine
 * phone numbers. It does not describe a checkout that does not exist.
 */

const steps = [
  {
    n: "01",
    title: "Order from your phone",
    body: "The whole menu, with every flavour and every level of heat priced as you build it.",
  },
  {
    n: "02",
    title: "Pick a collection time",
    body: "Fifteen minute windows. Full ones close, so the kitchen is never promised more than it can cook.",
  },
  {
    n: "03",
    title: "We cook to your slot",
    body: "Your phone buzzes the moment the food is up, even on a locked screen.",
  },
  {
    n: "04",
    title: "Quote your code",
    body: "Tap to say you have arrived, give the counter your four digit code, and go.",
  },
];

export default async function Home() {
  const { categories } = await getStorefrontMenu();
  const featured = featuredItems(categories);
  const counter = catalogImage("scene-counter");

  const wings = findItem(categories, WINGS_ITEM_SLUG);
  const half = wings?.variations.find((variation) => variation.slug === "half");
  const full = wings?.variations.find((variation) => variation.slug === "full");

  // Both the scale and its two prices come from the menu the page rendered
  // from, so the landing page cannot advertise a heat price the menu no longer
  // charges.
  const heatLevels: HeatLevel[] = (
    findOptionGroup(wings, WING_HEAT_GROUP_SLUG)?.options ?? []
  )
    .filter((option) => (option.heatPercent ?? 0) > 0)
    .map((option) => ({
      slug: option.slug,
      name: option.name,
      percent: option.heatPercent ?? 0,
      half: formatPesoCompact(optionPriceCents(option, "half")),
      full: formatPesoCompact(optionPriceCents(option, "full")),
    }));

  return (
    <>
      {/* ============================================================
          Hero. Dark band, hard bottom edge onto the amber ground.
          ============================================================ */}
      <section className="bg-nybb-ink relative flex min-h-[86svh] items-end overflow-hidden">
        <HeroVideo />

        <div className="relative mx-auto w-full max-w-6xl px-5 pt-32 pb-16 sm:px-8 sm:pb-24">
          <p className="font-mono-tabular text-nybb-orange text-xs tracking-[0.28em]">
            PICKUP ONLY / CEBU
          </p>

          {/* Explicitly bone. The heading inherited --foreground, which the
              move to a light page ground turned into ink, so the first line
              of the hero was near black type on a near black wash. */}
          <h1 className="font-display heading-hero text-nybb-bone mt-5">
            Skip the queue.
            <br />
            <span className="text-nybb-orange">Not the wings.</span>
          </h1>

          <p className="text-nybb-bone/75 mt-6 max-w-[44ch] text-base leading-relaxed sm:text-lg">
            Nine flavours, five levels of heat, fried to order and waiting when
            you walk in.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ActionLink href="/menu" tone="dark">
              See the menu
            </ActionLink>
            <ActionLink href="#branches" tone="dark" variant="secondary">
              Find a branch
            </ActionLink>
          </div>

          {/* The honest status line. It used to be a full width band below the
              hero at bg-nybb-orange/10, which on the amber ground is invisible:
              the most important fact on the page, styled as the least
              important. It belongs next to the buttons it qualifies. */}
          <p className="text-nybb-bone/60 mt-7 flex items-center gap-2.5 text-sm">
            <span
              aria-hidden
              className="bg-nybb-orange size-1.5 shrink-0 rounded-full"
            />
            Online ordering opens soon. Call your branch to order today.
          </p>
        </div>
      </section>

      {/* ============================================================
          Nine flavours. The best photography the brand has, so it gets
          the most room: a true three by three at desktop instead of a
          ragged five and four with ten pixel gutters.
          ============================================================ */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <div>
            <h2 className="font-display heading-major">Nine flavours</h2>
            <p className="text-nybb-ink/75 mt-5 max-w-[46ch] leading-relaxed">
              One shoot, one basket, nine sauces. Every one of them takes a
              level of heat on top, at no change to the flavour you picked.
            </p>
            {half && full ? (
              <p className="font-mono-tabular text-nybb-ink/75 mt-4 text-xs tracking-[0.1em] uppercase">
                Half 6 pcs {formatPesoCompact(half.priceCents)}
                <span aria-hidden className="px-2">
                  /
                </span>
                Full 10 pcs {formatPesoCompact(full.priceCents)}
              </p>
            ) : null}
          </div>
          <TextLink href="/menu/chicken-wings" tone="light">
            See the wings
          </TextLink>
        </header>

        <FlavourGrid
          flavours={findOptionGroup(wings, WING_FLAVOUR_GROUP_SLUG)?.options ?? []}
          className="mt-10 sm:mt-12 lg:grid-cols-3 lg:gap-5"
          withDescriptions={false}
          imageSizes="(min-width: 1024px) 32vw, (min-width: 640px) 31vw, 45vw"
        />
      </section>

      {/* ============================================================
          The heat scale. Full bleed dark, and the one thing on this
          page a visitor should still be able to describe an hour later.
          ============================================================ */}
      <section className="bg-nybb-ink text-nybb-bone">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <header className="max-w-[50ch]">
            <h2 className="font-display heading-major">Heat is on the menu</h2>
            <p className="text-nybb-bone/65 mt-5 leading-relaxed">
              Five stops, from a warm edge to something you will remember. Pick
              a level and pay for the level, not for a different dish.
            </p>
          </header>

          <HeatScale levels={heatLevels} className="mt-14 sm:mt-16" />

          <p className="text-nybb-bone/55 mt-10 text-xs">
            Prices are the upcharge on top of any flavour, per order.
          </p>
        </div>
      </section>

      {/* ============================================================
          Reassurance. Deliberately the quietest passage on the page:
          smaller headings, no photography, no dark cards.
          ============================================================ */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <h2 className="font-display heading-minor">How pickup works</h2>
        <ol className="mt-10 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <li key={step.n} className="border-nybb-ink/20 border-t pt-5">
              <p className="font-mono-tabular text-nybb-ink/70 text-sm">
                {step.n}
              </p>
              <h3 className="font-display mt-3 text-xl leading-tight">
                {step.title}
              </h3>
              <p className="text-nybb-ink/75 mt-2.5 text-sm leading-relaxed">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8 sm:pb-28">
        <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <div>
            <h2 className="font-display heading-minor">Not just wings</h2>
            <p className="text-nybb-ink/75 mt-4 max-w-[44ch] text-sm leading-relaxed">
              Burgers, dogs, ribs and rice meals come off the same counter, so
              nobody in the group has to compromise.
            </p>
          </div>
          <TextLink href="/menu" tone="light">
            Full menu
          </TextLink>
        </header>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {featured.map((item) => (
            <ProductTile key={item.slug} item={item} />
          ))}
        </div>
      </section>

      {/* ============================================================
          The close. Dark band, and the only section on the page that
          converts today: nine counters, nine numbers, all dialable.
          What was here before was three photographs with empty alt
          text and no branch names at all.
          ============================================================ */}
      <section
        id="branches"
        className="bg-nybb-ink text-nybb-bone scroll-mt-18 sm:scroll-mt-22"
      >
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start lg:gap-16">
            <div>
              <h2 className="font-display heading-major">
                {branches.length} counters
                <br />
                across Cebu
              </h2>
              <p className="text-nybb-bone/65 mt-5 max-w-[42ch] leading-relaxed">
                Mall food halls, petrol forecourts, a medical mall and a resort.
                Online ordering opens soon. Until it does, the counter nearest
                you will take it on the phone.
              </p>

              {counter ? (
                <Image
                  src={counter.src}
                  alt="Buffalo Brad's staff behind the counter at a Cebu branch, under the lit Hot Wings sign and the menu boards."
                  width={counter.width}
                  height={counter.height}
                  sizes="(min-width: 1024px) 45vw, 92vw"
                  placeholder="blur"
                  blurDataURL={counter.blurDataURL}
                  className="mt-9 aspect-[3/2] w-full rounded-md object-cover"
                />
              ) : null}
            </div>

            <div>
              <ul className="grid gap-x-10 sm:grid-cols-2">
                {branches.map((branch) => (
                  <li
                    key={branch.slug}
                    className="border-nybb-bone/15 border-t py-4"
                  >
                    <p className="font-display text-base leading-none">
                      {branch.shortName}
                    </p>
                    <p className="text-nybb-bone/50 mt-2 text-xs leading-snug">
                      {branch.addressLine}, {branch.city}
                    </p>
                    <a
                      href={telHref(branch.phones[0])}
                      className="font-mono-tabular text-nybb-orange hover:text-nybb-orange-lit inline-flex min-h-11 items-center text-sm transition-colors"
                    >
                      {branch.phones[0]}
                    </a>
                  </li>
                ))}
              </ul>

              <TextLink href="/contact" tone="dark" className="mt-6">
                All addresses and numbers
              </TextLink>
            </div>
          </div>
        </div>
      </section>

      {/* Franchise. A business to business ask on a page for people who want
          dinner, so it gets one quiet line rather than the filled orange panel
          that used to outrank every customer action here. */}
      <section className="mx-auto max-w-6xl px-5 pt-14 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2">
          <p className="text-nybb-ink/75 text-sm leading-relaxed">
            Open for franchise. Five Brad Dragons Food Franchise Corporation,
            Cebu Business Park.
          </p>
          <TextLink href="mailto:franchise@5bdf.ph" tone="light">
            franchise@5bdf.ph
          </TextLink>
        </div>
      </section>
    </>
  );
}
