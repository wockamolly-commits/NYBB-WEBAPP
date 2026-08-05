import Image from "next/image";
import Link from "next/link";
import { FlavourGrid } from "@/components/menu/FlavourGrid";
import { HeatMeter } from "@/components/menu/HeatMeter";
import { ProductTile } from "@/components/menu/ProductTile";
import { HeroVideo } from "@/components/site/HeroVideo";
import { branches, catalogImage, featuredItems, optionPriceCents } from "@/lib/catalog";
import { wingHeat } from "@/lib/catalog/menu";
import { formatPesoCompact } from "@/lib/format";

const heatLevels = wingHeat.options.filter((option) => (option.heatPercent ?? 0) > 0);

const steps = [
  {
    n: "01",
    title: "Order from your phone",
    body: "The whole menu, with every flavour and every level of heat priced as you build it.",
  },
  {
    n: "02",
    title: "Pick a collection time",
    body: "Choose a fifteen minute window. Full windows are closed off, so the kitchen is never promised more than it can cook.",
  },
  {
    n: "03",
    title: "We cook to your slot",
    body: "Your phone buzzes the moment the food is up, even on a locked screen.",
  },
  {
    n: "04",
    title: "Walk in and quote your code",
    body: "Tap to say you have arrived, give the counter your four digit pickup code, and go.",
  },
];

export default function Home() {
  const featured = featuredItems();
  const scenes = ["scene-food-hall", "branch-sm-city", "scene-kiosk"]
    .map((key) => ({ key, image: catalogImage(key) }))
    .filter((entry) => entry.image !== null);

  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[82svh] items-end overflow-hidden">
        <HeroVideo />

        <div className="relative mx-auto w-full max-w-6xl px-4 pt-28 pb-14 sm:px-6 sm:pb-20">
          <p className="font-mono-tabular text-nybb-orange text-xs tracking-[0.28em]">
            PICKUP / CEBU
          </p>
          <h1 className="font-display mt-4 text-[clamp(2.75rem,11vw,6.5rem)] leading-[0.86]">
            Skip the queue.
            <br />
            <span className="text-nybb-orange">Not the wings.</span>
          </h1>
          <p className="text-nybb-bone/80 mt-5 max-w-md text-base leading-relaxed sm:text-lg">
            Order ahead, pick a collection time, and walk straight to the
            counter. Nine flavours, five levels of heat.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/menu"
              className="bg-nybb-orange text-nybb-ink font-display hover:bg-nybb-orange-lit rounded px-6 py-3.5 text-sm tracking-[0.06em] transition-colors"
            >
              See the menu
            </Link>
            <Link
              href="/contact"
              className="border-border font-display hover:border-nybb-bone/40 rounded border px-6 py-3.5 text-sm tracking-[0.06em] transition-colors"
            >
              Find a branch
            </Link>
          </div>
        </div>
      </section>

      {/* Honest status line. Ordering lands in the next phase; the phone numbers
          work today, so the page says so rather than promising a button that is
          not built. */}
      <div className="border-nybb-orange/25 bg-nybb-orange/10 border-y">
        <p className="text-nybb-bone/80 mx-auto max-w-6xl px-4 py-3 text-sm sm:px-6">
          Online ordering opens soon. Browse the menu here, then call your branch
          to order today.
        </p>
      </div>

      {/* Heat */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="font-display text-[clamp(2rem,6vw,3.5rem)] leading-[0.9]">
          Heat is on
          <br />
          the menu
        </h2>
        <p className="text-nybb-bone/70 mt-4 max-w-lg text-base leading-relaxed">
          Every flavour takes a level. Pick how hard you want it to hit, then pay
          for the level, not for a different dish.
        </p>

        <ul className="mt-9 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {heatLevels.map((level) => (
            <li
              key={level.slug}
              className="border-border bg-nybb-charcoal flex flex-col gap-4 rounded-md border p-4"
            >
              <HeatMeter percent={level.heatPercent ?? 0} size="sm" />
              <p className="font-display text-2xl leading-none">{level.name}</p>
              <dl className="mt-auto space-y-1 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-nybb-bone/55">Half, 6 pcs</dt>
                  <dd className="font-mono-tabular text-nybb-orange">
                    +{formatPesoCompact(optionPriceCents(level, "half"))}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-nybb-bone/55">Full, 10 pcs</dt>
                  <dd className="font-mono-tabular text-nybb-orange">
                    +{formatPesoCompact(optionPriceCents(level, "full"))}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      {/* Flavours */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-[clamp(2rem,6vw,3.5rem)] leading-[0.9]">
            Nine flavours
          </h2>
          <Link
            href="/menu/chicken-wings"
            className="font-display text-nybb-orange hover:text-nybb-orange-lit text-sm tracking-[0.06em] transition-colors"
          >
            Half 329 / Full 529
          </Link>
        </div>
        <FlavourGrid className="mt-8" />
      </section>

      {/* How pickup works */}
      <section className="border-border border-y">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <h2 className="font-display text-[clamp(2rem,6vw,3.5rem)] leading-[0.9]">
            How pickup works
          </h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <li key={step.n}>
                <p className="font-mono-tabular text-nybb-orange text-sm">{step.n}</p>
                <h3 className="font-display mt-3 text-xl leading-tight">{step.title}</h3>
                <p className="text-nybb-bone/65 mt-2 text-sm leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Bestsellers */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-[clamp(2rem,6vw,3.5rem)] leading-[0.9]">
            Start here
          </h2>
          <Link
            href="/menu"
            className="font-display text-nybb-orange hover:text-nybb-orange-lit text-sm tracking-[0.06em] transition-colors"
          >
            Full menu
          </Link>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {featured.map((item) => (
            <ProductTile key={item.slug} item={item} />
          ))}
        </div>
      </section>

      {/* Branches */}
      <section className="border-border border-t">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-[clamp(2rem,6vw,3.5rem)] leading-[0.9]">
              {branches.length} counters
              <br />
              across Cebu
            </h2>
            <Link
              href="/contact"
              className="font-display text-nybb-orange hover:text-nybb-orange-lit text-sm tracking-[0.06em] transition-colors"
            >
              Addresses and numbers
            </Link>
          </div>

          <ul className="mt-8 grid gap-2.5 sm:grid-cols-3">
            {scenes.map(({ key, image }) => (
              <li key={key} className="border-border overflow-hidden rounded-md border">
                <Image
                  src={image!.src}
                  alt=""
                  width={image!.width}
                  height={image!.height}
                  sizes="(min-width: 640px) 31vw, 92vw"
                  placeholder="blur"
                  blurDataURL={image!.blurDataURL}
                  className="aspect-[3/2] w-full object-cover"
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Franchise */}
      <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="border-nybb-orange/30 bg-nybb-orange/5 flex flex-wrap items-center justify-between gap-6 rounded-md border p-6 sm:p-8">
          <div>
            <h2 className="font-display text-2xl leading-none sm:text-3xl">
              Open for franchise
            </h2>
            <p className="text-nybb-bone/65 mt-2 text-sm">
              Five Brad Dragons Food Franchise Corporation, Cebu Business Park.
            </p>
          </div>
          <a
            href="mailto:franchise@5bdf.ph"
            className="bg-nybb-orange text-nybb-ink font-display hover:bg-nybb-orange-lit rounded px-5 py-3 text-sm tracking-[0.06em] transition-colors"
          >
            franchise@5bdf.ph
          </a>
        </div>
      </section>
    </>
  );
}
