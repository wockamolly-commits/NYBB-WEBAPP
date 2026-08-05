import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { HeatMeter } from "@/components/menu/HeatMeter";
import { branches, catalogImage } from "@/lib/catalog";
import { wingFlavours, wingHeat } from "@/lib/catalog/menu";

export const metadata: Metadata = {
  title: "About",
  description:
    "New York Buffalo Brad's Hot Wings: nine flavours, five levels of heat, and counters across Cebu.",
};

const facts = [
  { label: "Flavours", value: String(wingFlavours.options.length) },
  {
    label: "Levels of heat",
    value: String(wingHeat.options.filter((option) => (option.heatPercent ?? 0) > 0).length),
  },
  { label: "Counters in Cebu", value: String(branches.length) },
];

export default function AboutPage() {
  const hero = catalogImage("scene-alfresco-dusk");
  const counter = catalogImage("scene-counter");
  const insane = wingHeat.options.find((option) => option.slug === "insane");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      {/* One colour. "Cebu built" used to be text-nybb-orange, which on the
          amber ground measures about 1.8:1 and fails even the 3:1 that large
          text is allowed. There is no accent in this palette that survives on
          amber: orange, yellow and the heat ramp are all light values on a
          light ground, and red is spoken for (destructive actions and the top
          of the heat scale). So the emphasis comes from the line break and the
          scale instead, and solid ink reads at 7.7:1. */}
      <h1 className="font-display heading-hero">
        A wing house,
        <br />
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
        <div className="space-y-5 text-base leading-relaxed">
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
                <dt className="text-nybb-bone/50 text-xs tracking-[0.14em] uppercase">
                  {fact.label}
                </dt>
                <dd className="font-mono-tabular text-nybb-orange mt-1 text-3xl">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>

          {insane ? (
            <div className="border-nybb-bone/15 mt-6 border-t pt-5">
              <p className="text-nybb-bone/50 text-xs tracking-[0.14em] uppercase">
                Top of the scale
              </p>
              <HeatMeter
                percent={insane.heatPercent ?? 100}
                label={insane.name}
                className="mt-3"
              />
            </div>
          ) : null}
        </div>
      </div>

      <section className="border-nybb-ink/20 mt-16 border-t pt-12">
        <h2 className="font-display heading-minor">
          Why we are building this
        </h2>
        <div className="mt-6 grid gap-10 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5 text-base leading-relaxed">
            <p className="text-nybb-ink/75">
              Ordering ahead currently means an aggregator app. That works, but
              it means the queue, the customer and the order data all belong to
              somebody else, and a commission comes off every ticket.
            </p>
            <p className="text-nybb-ink/75">
              So we are building pickup ourselves: order from your phone, choose
              a collection window the kitchen has actually got room for, get a
              notification the moment the food is up, and quote a four digit code
              at the counter. No delivery, no aggregator, no queue.
            </p>
            <p className="text-nybb-ink/75">
              It is being built branch by branch. In the meantime the{" "}
              <Link href="/menu" className="text-nybb-ink decoration-nybb-ink/40 hover:decoration-nybb-ink underline underline-offset-4 transition-colors">
                menu
              </Link>{" "}
              is here and every{" "}
              <Link href="/contact" className="text-nybb-ink decoration-nybb-ink/40 hover:decoration-nybb-ink underline underline-offset-4 transition-colors">
                branch number
              </Link>{" "}
              takes orders by phone.
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
    </div>
  );
}
