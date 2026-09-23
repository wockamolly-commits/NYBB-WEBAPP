"use client";

import { domAnimation, LazyMotion, useReducedMotion, useSpring, useTransform } from "motion/react";
import * as m from "motion/react-m";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  clampScore,
  flameBudget,
  heatParticles,
  heatTier,
  hotnessLabel,
  particleBudget,
  tongueTierMin,
  type HotnessMeterSize,
  type HeatTier,
} from "@/lib/menu/hotness-meter";
import { flameTongues, heatSwatch, type HeatStop } from "@/lib/menu/heat-slider";
import { cn } from "@/lib/utils";
import styles from "./HotnessMeter.module.css";

/**
 * The hotness meter: a lit glass tube with a fire standing on it.
 *
 * This is the picture only. It takes a score and draws it, and it owns no
 * choice. `HeatSlider` lays the real `<input type="range">` over it through
 * `children` and keeps every rule about what a position means; see
 * lib/menu/heat-slider.ts for why "nothing chosen" and "No heat" are two facts.
 *
 * Three things carry the depth. The tube is a recessed channel with the five
 * fixed swatches inside it and a glass highlight over them, so the bar reads as
 * an object with light inside rather than as a flat ramp. The fire is two
 * layers of tongues, each a soft masked silhouette with its own hot core, each
 * on its own timing. And the light is gradients rather than blur or stacked
 * shadows, which is what keeps it cheap enough to idle on a phone.
 *
 * Every tier is a different fire, not the same fire brighter. See the
 * `data-tier` blocks in HotnessMeter.module.css.
 */

export type HotnessMeterEnergy = "idle" | "hover" | "drag";

/** The five levels the menu sells, for a meter that is not given its own. */
const DEFAULT_STOPS: readonly HeatStop[] = [
  { slug: "lite", name: "Lite", percent: 20 },
  { slug: "moderate", name: "Moderate", percent: 40 },
  { slug: "hot", name: "Hot", percent: 60 },
  { slug: "wild", name: "Wild", percent: 80 },
  { slug: "insane", name: "Insane", percent: 100 },
];

/**
 * A spring with a little give. Damping ratio around 0.65, which overshoots the
 * target by a few percent and settles, so the pointer glides onto a level
 * instead of stepping to it.
 */
const GLIDE = { stiffness: 210, damping: 19, mass: 1 } as const;

export type HotnessMeterProps = {
  /** 0 to 100. Decides the tier, and the fill when `fill` is not given. */
  score: number;
  /** Idle flicker, travelling licks and the spring. Off draws a still fire. */
  animated?: boolean;
  /** Embers from Hot upward, sparks at Insane. */
  showParticles?: boolean;
  /** `small` for cards, `medium` for panels, `large` for a full width band. */
  size?: HotnessMeterSize;
  /** The labelled segments under the fire. Defaults to the five levels. */
  stops?: readonly HeatStop[];
  /**
   * How far along the tube is lit, 0 to 1. Defaults to `score / 100`. The
   * slider passes whole segments, so "No heat" still shows its own band.
   */
  fill?: number;
  /** Which label is lit. Defaults to the stop in the score's tier. */
  activeStop?: number | null;
  /** How hard the fire burns right now: at rest, under a hover, being dragged. */
  energy?: HotnessMeterEnergy;
  /** Nothing chosen yet. Draws a cold tube and a hollow pointer. */
  unset?: boolean;
  /**
   * Leave the accessible name to something else. The slider sets this, since
   * its input already announces "Wild, 80 percent heat".
   */
  decorative?: boolean;
  className?: string;
  /** Laid over the tube, full width. This is where the slider's input goes. */
  children?: ReactNode;
};

export function HotnessMeter({
  score,
  animated = true,
  showParticles = true,
  size = "medium",
  stops = DEFAULT_STOPS,
  fill,
  activeStop,
  energy = "idle",
  unset = false,
  decorative = false,
  className,
  children,
}: HotnessMeterProps) {
  const clamped = clampScore(score);
  const tier: HeatTier = unset ? 0 : heatTier(clamped);
  const target = unset ? 0 : Math.min(Math.max(fill ?? clamped / 100, 0), 1);
  const active =
    activeStop !== undefined
      ? activeStop
      : stops.findIndex((stop) => heatTier(stop.percent) === tier);

  const reduced = useReducedMotion();
  const glide = animated && !reduced;

  // One animated number drives the lit run, the fire's mask, the particles and
  // the pointer, all through the `--fill` custom property, so none of them can
  // drift out of step with the others the way separate transitions would.
  const spring = useSpring(target, GLIDE);
  useEffect(() => {
    if (glide) spring.set(target);
    else spring.jump(target);
  }, [glide, spring, target]);
  const fillPercent = useTransform(spring, (value) => `${(value * 100).toFixed(3)}%`);

  // Pause every loop while the meter is scrolled out of view. Starts true so
  // the first paint on screen is already moving.
  const root = useRef<HTMLDivElement>(null);
  const [onscreen, setOnscreen] = useState(true);
  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOnscreen(entry.isIntersecting), {
      rootMargin: "80px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        ref={root}
        className={cn(styles.meter, className)}
        data-size={size}
        data-tier={tier}
        data-energy={energy}
        data-unset={unset}
        data-running={animated && onscreen}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : hotnessLabel(clamped)}
        style={
          {
            "--fill": fillPercent,
            "--tier": tier,
            "--stops": stops.length,
          } as unknown as React.CSSProperties
        }
      >
        <div className={styles.stage}>
          <div className={styles.rail}>
            <Fire size={size} />
            {showParticles && tier >= 3 ? <Particles tier={tier} size={size} /> : null}
            <Tube stops={stops} />
            <div className={styles.pointerRail} aria-hidden>
              <div className={styles.pointer}>
                <span className={styles.bloom} />
                <span className={styles.needle} data-meter-needle />
              </div>
            </div>
            {children ? <div className={styles.overlay}>{children}</div> : null}
          </div>
        </div>

        <ol className={styles.labels} aria-hidden>
          {stops.map((stop, at) => (
            <li
              key={stop.slug}
              data-on={!unset && at === active}
              style={{ "--swatch": heatSwatch(stop.percent) } as React.CSSProperties}
            >
              {stop.name}
            </li>
          ))}
        </ol>
      </m.div>
    </LazyMotion>
  );
}

/**
 * The fire. Drawn at every tier's full count and lit by tier in CSS, so moving
 * between levels fades tongues in and out instead of mounting new ones mid
 * flicker. Memoised on size alone: a level change never re-renders it.
 */
const Fire = memo(function Fire({ size }: { size: HotnessMeterSize }) {
  const layers = useMemo(() => {
    const budget = flameBudget(size);
    return {
      body: flameTongues(budget.body, 2).map((tongue, at) => ({
        ...tongue,
        min: tongueTierMin("body", at, budget.body),
      })),
      lick: flameTongues(budget.lick, 3).map((tongue, at) => ({
        ...tongue,
        min: tongueTierMin("lick", at, budget.lick),
      })),
      surge: flameTongues(budget.surge, 4),
    };
  }, [size]);

  return (
    <div className={styles.fire} aria-hidden>
      <div className={styles.pool} />
      <div className={styles.flames}>
        <div className={styles.bed} />
        <Layer name="body" tongues={layers.body} />
        <Layer name="lick" tongues={layers.lick} />
        <Layer name="surge" tongues={layers.surge.map((tongue) => ({ ...tongue, min: 3 }))} />
      </div>
      <div className={styles.haze} />
    </div>
  );
});

type PlacedTongue = ReturnType<typeof flameTongues>[number] & { min: number };

function Layer({ name, tongues }: { name: "body" | "lick" | "surge"; tongues: PlacedTongue[] }) {
  return (
    <div className={styles.layer} data-layer={name}>
      {tongues.map((tongue, at) => (
        <i
          key={at}
          className={styles.tongue}
          // Three silhouettes, picked by the hash and mirrored by the lean,
          // so neighbouring tongues are never visibly the same drawing.
          data-shape={name === "body" ? (at % 2 ? "round" : "tall") : at % 3 === 0 ? "fork" : "tall"}
          style={
            {
              "--x": tongue.x.toFixed(4),
              "--w": tongue.width.toFixed(4),
              "--h": tongue.height.toFixed(4),
              "--lean": tongue.lean.toFixed(4),
              "--flip": tongue.lean < 0 ? -1 : 1,
              "--dur": `${(tongue.duration * (name === "body" ? 3.4 : name === "lick" ? 1.9 : 0.95)).toFixed(3)}s`,
              "--delay": `${(-tongue.delay * 1.7).toFixed(3)}s`,
              "--min": tongue.min,
            } as React.CSSProperties
          }
        >
          <b className={styles.flame} />
        </i>
      ))}
    </div>
  );
}

/** Embers from Hot, sparks at Insane. Capped by `particleBudget`. */
const Particles = memo(function Particles({ tier, size }: { tier: HeatTier; size: HotnessMeterSize }) {
  const particles = useMemo(() => heatParticles(particleBudget(tier, size), tier), [tier, size]);
  return (
    <div className={styles.particles} aria-hidden>
      {particles.map((particle, at) => (
        <i
          key={at}
          className={styles.particle}
          data-kind={particle.kind}
          style={
            {
              "--px": particle.x.toFixed(4),
              "--drift": particle.drift.toFixed(3),
              "--rise": particle.rise.toFixed(3),
              "--s": particle.scale.toFixed(3),
              "--dur": `${particle.duration.toFixed(3)}s`,
              "--delay": `${(-particle.delay).toFixed(3)}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
});

/**
 * The tube: a recessed channel, the stops' own fixed swatches dimmed as
 * unpowered filament, the same swatches lit up to `--fill`, a hot core line
 * through the lit run, and a sheet of glass over the lot.
 */
const Tube = memo(function Tube({ stops }: { stops: readonly HeatStop[] }) {
  const segments = stops.map((stop) => (
    <span
      key={stop.slug}
      style={{ "--swatch": heatSwatch(stop.percent) } as React.CSSProperties}
    />
  ));
  return (
    <div className={styles.tube} aria-hidden>
      <div className={styles.channel}>
        <div className={styles.segments} data-state="dim">
          {segments}
        </div>
        <div className={styles.segments} data-state="lit">
          {segments}
        </div>
        <div className={styles.core} />
        <div className={styles.glass} />
      </div>
    </div>
  );
});
