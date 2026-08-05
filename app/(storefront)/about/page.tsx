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
      <h1 className="font-display text-[clamp(2.5rem,9vw,5rem)] leading-[0.88]">
        A wing house,
        <br />
        <span className="text-nybb-orange">Cebu built</span>
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
          className="border-border mt-9 aspect-[3/2] w-full rounded-md border object-cover sm:aspect-[21/9]"
          priority
        />
      ) : null}

      <div className="mt-12 grid gap-10 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5 text-base leading-relaxed">
          <p className="text-nybb-bone/85">
            New York Buffalo Brad&rsquo;s Hot Wings serves American style
            chicken wings across Cebu, from a street front on Mango Avenue to
            food hall counters, a medical mall, a resort and four petrol station
            forecourts. The brand is operated and franchised by Five Brad Dragons
            Food Franchise Corporation, based in Cebu Business Park.
          </p>
          <p className="text-nybb-bone/70">
            Wings come by the half order of six or the full order of ten, sauced
            in one of nine flavours. Alongside them sit burgers numbered BB1 to
            BB5, hotdogs numbered H1 to H5, ribs, pasta, waffles and an iced
            coffee line.
          </p>
          <p className="text-nybb-bone/70">
            The thing that makes the menu ours is the heat. Every flavour takes a
            level, from Lite at twenty percent up to Insane at a hundred, priced
            against the size you ordered rather than sold as a separate dish.
          </p>
        </div>

        <div className="border-border bg-nybb-charcoal h-fit rounded-md border p-6">
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
            <div className="border-border mt-6 border-t pt-5">
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

      <section className="border-border mt-16 border-t pt-12">
        <h2 className="font-display text-[clamp(1.75rem,5vw,2.75rem)] leading-none">
          Why we are building this
        </h2>
        <div className="mt-6 grid gap-10 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5 text-base leading-relaxed">
            <p className="text-nybb-bone/70">
              Ordering ahead currently means an aggregator app. That works, but
              it means the queue, the customer and the order data all belong to
              somebody else, and a commission comes off every ticket.
            </p>
            <p className="text-nybb-bone/70">
              So we are building pickup ourselves: order from your phone, choose
              a collection window the kitchen has actually got room for, get a
              notification the moment the food is up, and quote a four digit code
              at the counter. No delivery, no aggregator, no queue.
            </p>
            <p className="text-nybb-bone/70">
              It is being built branch by branch. In the meantime the{" "}
              <Link href="/menu" className="text-nybb-orange hover:text-nybb-orange-lit underline underline-offset-4 transition-colors">
                menu
              </Link>{" "}
              is here and every{" "}
              <Link href="/contact" className="text-nybb-orange hover:text-nybb-orange-lit underline underline-offset-4 transition-colors">
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
              className="border-border h-fit aspect-[3/2] w-full rounded-md border object-cover"
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
