import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { HeatMeter } from "@/components/menu/HeatMeter";
import { branches, catalogImage } from "@/lib/catalog";
import {
  findItem,
  findOptionGroup,
  getStorefrontMenu,
  WINGS_ITEM_SLUG,
  WING_FLAVOUR_GROUP_SLUG,
  WING_HEAT_GROUP_SLUG,
} from "@/lib/menu";

export const metadata: Metadata = {
  title: "About",
  description:
    "New York Buffalo Brad's Hot Wings: nine flavours, five levels of heat, and counters across Cebu.",
};

export default async function AboutPage() {
  const hero = catalogImage("scene-alfresco-dusk");
  const counter = catalogImage("scene-counter");

  // Counted from the live menu, not hardcoded. A page that says "nine
  // flavours" while the menu sells ten is the kind of thing nobody notices
  // until a customer does.
  //
  // No branch slug, deliberately. This page sells nothing, so it has no
  // availability to get wrong, and asking which counter the customer chose
  // would buy a second round trip to print a number that is the same at all of
  // them. The buying surfaces pass the slug; this one has no reason to.
  const { categories } = await getStorefrontMenu();
  const wings = findItem(categories, WINGS_ITEM_SLUG);
  const flavours = findOptionGroup(wings, WING_FLAVOUR_GROUP_SLUG)?.options ?? [];
  const heat = findOptionGroup(wings, WING_HEAT_GROUP_SLUG)?.options ?? [];
  const insane = heat.find((option) => option.slug === "insane");

  const facts = [
    { label: "Flavours", value: String(flavours.length) },
    {
      label: "Levels of heat",
      value: String(heat.filter((option) => (option.heatPercent ?? 0) > 0).length),
    },
    { label: "Counters in Cebu", value: String(branches.length) },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      {/* One colour. "Cebu built" used to be text-nybb-orange, which on the
          amber ground measures about 1.8:1 and fails even the 3:1 that large
          text is allowed. There is no accent in this palette that survives on
          amber: orange, yellow and the heat ramp are all light values on a
          light ground, and red is spoken for (destructive actions and the top
          of the heat scale). So the emphasis comes from the line break and the
          scale instead, and solid ink reads at 7.7:1. */}
      {/* heading-page, not heading-hero. The hero tier belongs to the landing
          page's one billboard line; using it here as well meant "Branches"
          and "A wing house" were set two steps larger than "The menu" and
          "Your cart", which is a hierarchy claim neither page is making. */}
      {/* The space before the break is load bearing and is not a typo. Without
          it `h1.textContent` is "A wing house,Cebu built", and assistive tech
          that flattens an element to its text content runs the comma straight
          into the next word. The landing hero carries the same note for the
          same reason. */}
      <h1 className="font-display heading-page">
        A wing house, <br />
        Cebu built
      </h1>

      {hero ? (
        <Image
          src={hero.src}
          alt="An NYBB Hot Wings branch at dusk, lit with string lights"
          width={hero.width}
          height={hero.height}
          sizes="(min-width: 1024px) 72rem, 100vw"
          placeholder="blur"
          blurDataURL={hero.blurDataURL}
          className="mt-9 aspect-[3/2] w-full rounded-md object-cover sm:aspect-[21/9]"
          priority
        />
      ) : null}

      <div className="mt-12 grid gap-10 md:grid-cols-[1.4fr_1fr]">
        {/* max-w. The 1.4fr column runs about 650px inside a 1152px content
            width, which at 16px Inter is roughly 80 characters: past the point
            where the eye reliably finds the start of the next line. 68ch holds
            the column at a readable measure on a desktop and never binds at
            the breakpoints below it. */}
        <div className="max-w-[68ch] space-y-5 text-base leading-relaxed">
          <p className="text-nybb-ink/75">
            New York Buffalo Brad&rsquo;s Hot Wings serves American style
            chicken wings across Cebu, from a street front on Mango Avenue to
            food hall counters, a medical mall, a resort and four petrol station
            forecourts. The brand is operated and franchised by Five Brad Dragons
            Food Franchise Corporation, based in Cebu Business Park.
          </p>
          <p className="text-nybb-ink/75">
            Wings come by the half order of six or the full order of ten, sauced
            in one of nine flavours. Alongside them sit burgers numbered BB1 to
            BB5, hotdogs numbered H1 to H5, ribs, pasta, waffles and an iced
            coffee line.
          </p>
          <p className="text-nybb-ink/75">
            The thing that makes the menu ours is the heat. Every flavour takes a
            level, from Lite at twenty percent up to Insane at a hundred, priced
            against the size you ordered rather than sold as a separate dish.
          </p>
        </div>

        <div className="bg-nybb-charcoal text-nybb-bone h-fit rounded-md p-6">
          <dl className="space-y-5">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="type-caps text-nybb-bone/50">{fact.label}</dt>
                <dd className="font-mono-tabular text-nybb-orange mt-1 text-3xl">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>

          {insane ? (
            <div className="border-nybb-bone/15 mt-6 border-t pt-5">
              <p className="type-caps text-nybb-bone/50">Top of the scale</p>
              <HeatMeter
                percent={insane.heatPercent ?? 100}
                label={insane.name}
                className="mt-3"
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* THE CLAIM, THEN THE FOOD. WHAT WAS HERE WAS NEITHER.
          ================================================================
          This slot used to hold one section called "Why we are building this",
          and it was three paragraphs about aggregator commission, order data
          ownership and a pickup platform under construction. All of it true,
          none of it about a restaurant: it read as the internal business case
          for the website, printed on the website, on the page a hungry person
          opens to find out whether these wings are any good.

          It becomes two short sections instead, and the order is the argument.
          First the store's own tagline treated as a claim that has to be paid
          for, because a slogan nobody has to earn is decoration. Then how a
          basket actually arrives, which is the paying.

          The platform has not been deleted, it has been demoted to the last
          two sentences of the second section, which is the size the honest
          answer is: it does not exist yet, the menu does, and the phones
          work. */}
      <section className="border-nybb-ink/20 mt-16 border-t pt-12">
        <h2 className="font-display heading-minor">
          All time favorite is a claim
        </h2>
        <div className="mt-6 grid gap-10 md:grid-cols-[1.4fr_1fr]">
          {/* max-w. The 1.4fr column runs about 650px inside a 1152px content
            width, which at 16px Inter is roughly 80 characters: past the point
            where the eye reliably finds the start of the next line. 68ch holds
            the column at a readable measure on a desktop and never binds at
            the breakpoints below it. */}
          <div className="max-w-[68ch] space-y-5 text-base leading-relaxed">
            <p className="text-nybb-ink/75">
              It is a large thing to write on a wing shop, and it is not a claim
              about a website. It is a claim about one basket, handed across one
              counter, to somebody who is hungry now. That is the only place it
              can be won or lost, so that is where the argument gets settled.
            </p>
            <p className="text-nybb-ink/75">
              Which is why picking a sauce never costs more than picking a
              different one, why the heat is a number you choose rather than a
              dare somebody sets for you, and why a half order is six wings and
              a full order is ten with nothing else to work out. Fewer decisions,
              and none of them are traps.
            </p>

            {/* The tagline as the section's signature rather than its heading.
                It is the line the section has just spent two paragraphs
                justifying, so it lands underneath them, in the store's own
                script, the way it is drawn on the store's own artwork.

                Ink, not orange. Buffalo Orange measures 1.8:1 on the amber
                ground and fails even the 3:1 that large text is allowed; solid
                ink measures 7.7:1. A brush script has thin joins and is the
                last thing in this system that should be spending a marginal
                ratio.

                A <p>, not a heading, and the same size as the footer instance.
                This is lettering that belongs to the lockup: it outranks
                nothing, and it stays one recognisable object by staying one
                size wherever it appears. */}
            <p className="font-script text-nybb-ink pt-1 text-2xl sm:text-[1.75rem]">
              #Your All Time Favorite Chicken Wings
            </p>
          </div>

          {counter ? (
            <Image
              src={counter.src}
              alt="Staff behind an NYBB Hot Wings food hall counter"
              width={counter.width}
              height={counter.height}
              sizes="(min-width: 768px) 24rem, 100vw"
              placeholder="blur"
              blurDataURL={counter.blurDataURL}
              className="h-fit aspect-[3/2] w-full rounded-md object-cover"
            />
          ) : null}
        </div>
      </section>

      {/* No photograph on purpose. The section above carries the image, and
          this one is the quiet close: a single column of text, which is the
          right shape for the passage that ends on an admission rather than on
          a sell.

          It keeps the grid anyway, with the second cell empty. 68ch is a cap
          that never binds on this page, because every other body column is
          held narrower by the 1.4fr track first: about 648px against 68ch's
          690. Dropped out of the grid, this section would have been the one
          place on the page where 68ch actually bound, so the same body role
          would have run at two different measures three inches apart. An empty
          grid cell costs nothing and says "the same column as the one above"
          in a way a hand-computed width cannot. */}
      <section className="border-nybb-ink/20 mt-16 border-t pt-12">
        <h2 className="font-display heading-minor">Fried to order</h2>
        <div className="mt-6 grid gap-10 md:grid-cols-[1.4fr_1fr]">
          <div className="max-w-[68ch] space-y-5 text-base leading-relaxed">
            <p className="text-nybb-ink/75">
              Wings go into the fryer when the order does. That is the reason
              there is a wait, and it is the reason the wait is worth sitting
              through. What comes out is hot, in the basket, sauced to the level
              you asked for and not to the level somebody assumed you wanted.
            </p>
            <p className="text-nybb-ink/75">
              Then you collect it. There is no delivery here and there is not
              going to be, which is a decision rather than a gap: fried chicken
              has a short window where the skin is still the point, and the
              shortest trip between the fryer and you is the counter.
            </p>
            <p className="text-nybb-ink/75">
              Ordering ahead from your phone is being built, branch by branch.
              Until it lands the{" "}
              <Link
                href="/menu"
                className="text-nybb-ink decoration-nybb-ink/40 hover:decoration-nybb-ink underline underline-offset-4 transition-colors"
              >
                menu
              </Link>{" "}
              is here and every{" "}
              <Link
                href="/contact"
                className="text-nybb-ink decoration-nybb-ink/40 hover:decoration-nybb-ink underline underline-offset-4 transition-colors"
              >
                branch number
              </Link>{" "}
              takes an order.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
