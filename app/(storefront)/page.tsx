import Image from "next/image";
import { HeatScale, type HeatLevel } from "@/components/site/HeatScale";
import { HeroHeat } from "@/components/site/HeroHeat";
import { HeroVideo } from "@/components/site/HeroVideo";
import { FlavourGrid } from "@/components/menu/FlavourGrid";
import { ProductTile } from "@/components/menu/ProductTile";
import { ButtonLink } from "@/components/ui/Button";
import { TextLink } from "@/components/ui/TextLink";
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
 * orange on amber is now ink. See components/ui/Button.tsx, which is where
 * that rule is enforced rather than remembered.
 *
 * MOTION. One authored moment, in one place: the five heat stops drawing
 * themselves in sequence as that section arrives. Nothing else on the page
 * animates except hover colour.
 *
 * WHAT IS TRUE TODAY. Online ordering is Phase 1 and is not built. The page
 * says so once, in the hero, under the buttons where it is read, and it hands
 * the visitor the working alternative in the same breath rather than at the
 * end: the hero's second button is "Call a branch", and it lands on the nine
 * counters and nine dialable numbers that close the page. Saying a capability
 * is missing is only honest if the remedy is reachable from where the sentence
 * is read. It does not describe a checkout that does not exist.
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
      {/* min-h is 78svh, not 86. The header is `sticky top-0` and therefore
          still in flow, so the first screen is the hero PLUS the bar above it:
          at 86svh that totalled about 96% of a 900px viewport and the next band
          showed as a 38px sliver, too thin to read as "there is more" and thin
          enough to look like a rendering seam. 78 leaves roughly an eighth of
          the viewport to the flavour grid, which is the section the page most
          wants you to reach.

          max-[500px]:min-h-0 is for the landscape phone. With items-end, a
          minimum height only matters while the container is taller than its
          content; at 844x390 the content forces 604px and the minimum does
          nothing but guarantee the CTAs start below the fold. */}
      <section
        aria-labelledby="hero-title"
        // text-nybb-bone on the container, not on each leaf. Without it the
        // hero's contents inherit --foreground, which the move to a light page
        // ground turned into ink, so anything here that does not name its own
        // colour renders near black on a near black wash. The h1 already
        // carried a note about this and the heat scale's level names walked
        // straight into it anyway: they were invisible while their percentages,
        // which do name a colour, rendered fine.
        className="bg-nybb-ink text-nybb-bone relative flex min-h-[78svh] items-end overflow-hidden max-[500px]:min-h-0"
      >
        <HeroVideo />

        {/* pt-16 on a phone, not pt-32. With items-end the top padding is a
            no-op on any viewport tall enough for bottom alignment to matter,
            and actively harmful once the content is taller than the container:
            on a landscape phone those 128px were pushing the primary CTA 113px
            below the fold, so the visitor met a kicker, a headline clipped
            mid-glyph, and nothing to press.

            THE SHORT VIEWPORT KEYS ON HEIGHT, NOT WIDTH.
            ================================================================
            A width breakpoint cannot see this case at all. A landscape phone at
            844x390 is 844 wide, which is past `sm`, so every width-keyed rule
            here hands it the desktop padding and the full size headline while
            it has 299px of room under the header. The staff workspace already
            learned this and the spec records it: rules for short screens key on
            viewport height, because orientation is not a thing CSS can ask
            about and width answers the wrong question.

            Under 500px of height the hero gives back its padding and drops the
            headline to 2.5rem, which is what buys the CTAs their place above
            the fold. The status line goes under it, and that is the right thing
            to lose: it is a disclosure, and the button it used to send people
            looking for is now the thing sitting above it. */}
        <div className="relative mx-auto w-full max-w-6xl px-5 pt-16 pb-16 sm:px-8 sm:pt-32 sm:pb-24 [@media(max-height:500px)]:pt-8 [@media(max-height:500px)]:pb-8">
          {/* THE SCALE GOES BESIDE THE COPY, NOT UNDER IT.
              ================================================================
              Under it, the scale cost 154px of hero height and pushed the whole
              first screen back to 96% of the viewport, which is the exact
              problem the 78svh above was set to solve. Beside it, it costs
              nothing vertically and lands in the part of this hero that was
              genuinely empty: at 1440 the copy column ends around 545px and the
              remaining 600 held nothing at all.

              One element, two placements, no duplicate markup. Below lg it
              flows in its natural order, between the subhead it replaced a
              clause of and the buttons. At lg it moves to a second column and
              the actions drop under the copy, both bottom aligned, so the
              headline and the scale sit on the same baseline. */}
          <div className="grid gap-y-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-end lg:gap-x-16 lg:gap-y-10 [@media(max-height:500px)]:gap-y-5">
            <div className="lg:col-start-1 lg:row-start-1">
              {/* The one kicker on the site, and it keeps its own wide tracking
              rather than the shared label value: this is the hero, where a
              display treatment is allowed to be a display treatment. The face
              is Anton and not the mono, because there is not a digit in it and
              mono here was only ever dressing the line up as technical.

              Bone rather than orange. This line sits at the very top of the
              type block, which is the one place the scrim is thinnest, and 12px
              of brand orange measured 2.2:1 there over the old video and would
              not clear 4.5:1 over the photograph either. Orange is not what
              identifies this line; the face and the tracking are, and both are
              kept. The colour is spent on the headline below, where the text is
              large enough to be held at 3:1 and low enough to sit on ink. */}
              <p className="font-display text-nybb-bone/85 text-xs tracking-[0.28em]">
                Pickup only / Cebu
              </p>

              {/* Explicitly bone. The heading inherited --foreground, which the
              move to a light page ground turned into ink, so the first line
              of the hero was near black type on a near black wash. */}
              {/* The space before the break is load bearing and is not a typo.
              Without it `h1.textContent` is "Skip the queue.Not the wings.",
              and assistive tech that flattens an element to its text content
              runs the two sentences together into one word. The break still
              does the visual work; the space only exists in the string. */}
              <h1
                id="hero-title"
                className="font-display heading-hero text-nybb-bone mt-5 [@media(max-height:500px)]:mt-3 [@media(max-height:500px)]:text-[2.5rem]"
              >
                Skip the queue. <br />
                <span className="text-nybb-orange">Not the wings.</span>
              </h1>

              {/* "Five levels of heat" came out of this sentence when the scale
              below it went in. The claim did not leave the hero, it stopped
              being a number the reader has to take on trust and became the
              object they can see, named and measured. Prose that describes
              something standing next to it is the flattest kind of copy. */}
              <p className="text-nybb-bone/75 mt-6 max-w-[44ch] text-base leading-relaxed sm:text-lg [@media(max-height:500px)]:mt-3 [@media(max-height:500px)]:text-base">
                Nine flavours, fried to order and waiting when you walk in.
              </p>
            </div>

            {/* Hidden on a landscape phone, and only there. That viewport has
              under 300px below the header, the CTAs have to clear it, and this
              is the one element in the hero whose job the band further down
              does again in full. */}
            <HeroHeat
              levels={heatLevels}
              className="lg:col-start-2 lg:row-span-2 lg:row-start-1 [@media(max-height:500px)]:hidden"
            />

            <div className="lg:col-start-1 lg:row-start-2">
              {/* THE SECOND BUTTON IS THE REMEDY, NOT A SECOND WAY TO BROWSE.
              ================================================================
              This row used to be "See the menu" and "Find a branch", and the
              disclosure underneath it said "Call your branch to order today"
              with nothing to call: no number, no tel:, no anchor, and the
              nearest dialable digit about 4,200px down the page. The headline
              sold skipping the queue, the line below withdrew it, and the
              remedy it named could not be executed. That is the deflation
              landing at the exact moment a motivated visitor is most likely to
              leave.

              So the remedy is promoted into the row. "Call a branch" is what
              this business can actually do today, and it also retires a real
              ambiguity: the header's "Branches" goes to /contact while this
              button goes to the section on this page, and two controls sharing
              one noun and pointing at two destinations is a collision. Only one
              of them says "branch" now.

              Stacked below 380px. At 320 the two buttons measure 139 and 146
              against 280px of content width, so a wrapping row put one CTA on
              its own ragged second line. Full width and stacked is the honest
              shape at that size. */}
              <div className="flex flex-col gap-3 min-[380px]:flex-row min-[380px]:flex-wrap min-[380px]:items-center">
                <ButtonLink href="/menu" tone="dark" size="lg">
                  See the menu
                </ButtonLink>
                <ButtonLink
                  href="#branches"
                  tone="dark"
                  variant="secondary"
                  size="lg"
                >
                  Call a branch
                </ButtonLink>
              </div>

              {/* The honest status line, and it no longer carries an instruction it
              cannot support: the button above is the instruction now. The orange
              dot that used to prefix this is gone too. A small filled dot before
              a status sentence reads by universal convention as "live", and this
              is the one sentence on the page saying the service is not. */}
              <p className="text-nybb-bone/60 mt-7 max-w-[46ch] text-sm leading-relaxed">
                Online ordering opens soon. Until it does, the counter nearest
                you takes the order on the phone.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          Nine flavours. The best photography the brand has, so it gets
          the most room: a true three by three at desktop instead of a
          ragged five and four with ten pixel gutters.
          ============================================================ */}
      <section
        aria-labelledby="flavours-title"
        className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28"
      >
        <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <div>
            <h2 id="flavours-title" className="font-display heading-major">
              Nine flavours
            </h2>
            <p className="text-nybb-ink/75 mt-5 max-w-[46ch] leading-relaxed">
              One shoot, one basket, nine sauces. Every one of them takes a
              level of heat on top, at no change to the flavour you picked.
            </p>
            {half && full ? (
              <p className="font-mono-tabular type-caps text-nybb-ink/75 mt-4">
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
          flavours={
            findOptionGroup(wings, WING_FLAVOUR_GROUP_SLUG)?.options ?? []
          }
          hrefFor={(flavour) =>
            `/menu/${WINGS_ITEM_SLUG}/${WINGS_ITEM_SLUG}?flavour=${flavour.slug}`
          }
          className="mt-10 sm:mt-12 lg:grid-cols-3 lg:gap-5"
          withDescriptions={false}
          imageSizes="(min-width: 1024px) 32vw, (min-width: 640px) 31vw, 45vw"
        />
      </section>

      {/* ============================================================
          The heat scale. Full bleed dark, and the one thing on this
          page a visitor should still be able to describe an hour later.
          ============================================================ */}
      <section
        aria-labelledby="heat-title"
        className="bg-nybb-ink text-nybb-bone"
      >
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <header className="max-w-[50ch]">
            <h2 id="heat-title" className="font-display heading-major">
              Heat is on the menu
            </h2>
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
      <section
        aria-labelledby="pickup-title"
        className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24"
      >
        <h2 id="pickup-title" className="font-display heading-minor">
          How pickup works
        </h2>
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

      <section
        aria-labelledby="more-title"
        className="mx-auto max-w-6xl px-5 pb-20 sm:px-8 sm:pb-28"
      >
        <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <div>
            <h2 id="more-title" className="font-display heading-minor">
              Not just wings
            </h2>
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
        aria-labelledby="branches-title"
        className="bg-nybb-ink text-nybb-bone scroll-mt-18 sm:scroll-mt-22"
      >
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start lg:gap-16">
            <div>
              <h2 id="branches-title" className="font-display heading-major">
                {branches.length} counters <br />
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
      <section
        aria-label="Franchise enquiries"
        className="mx-auto max-w-6xl px-5 pt-14 sm:px-8"
      >
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
