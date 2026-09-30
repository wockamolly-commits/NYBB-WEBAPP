"use client";

import {
  domAnimation,
  LazyMotion,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import * as m from "motion/react-m";
import { memo, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  FLAME_BOX,
  FLAME_TEMPER,
  clampScore,
  flameFrames,
  flameSplines,
  heatParticles,
  chiliCount,
  heatTier,
  hotnessLabel,
  particleBudget,
  rampGradient,
  type FlameLayer,
  type HotnessMeterSize,
  type HeatTier,
} from "@/lib/menu/hotness-meter";
import { heatSwatch, type HeatStop } from "@/lib/menu/heat-slider";
import { cn } from "@/lib/utils";
import styles from "./HotnessMeter.module.css";

/**
 * The hotness meter: a heat ramp with a torch riding along it.
 *
 * This is the picture only. It takes a score and draws it, and it owns no
 * choice. `HeatSlider` lays the real `<input type="range">` over it through
 * `children` and keeps every rule about what a position means; see
 * lib/menu/heat-slider.ts for why "nothing chosen" and "No heat" are two facts.
 *
 * Three things make the picture. The track is a capsule painted with the
 * stops' own swatches, each pinned under its label and blended between (see
 * `rampGradient`), so the whole scale is always on show. The pointer is a
 * white hot ember sitting on the track in a pool of its own light. And one
 * flame pours up out of the ember and travels with it: three nested
 * silhouettes (envelope, body, white hot core) each morphing on its own clock,
 * that trails back as the pointer glides and grows with the level. Light is
 * gradients rather than blur filters on the page or stacked shadows, which is
 * what keeps it cheap enough to idle on a phone.
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
   * Where the pointer sits along the bar, 0 to 1. Defaults to `score / 100`.
   * The slider passes the centre of the chosen stop, over its label.
   */
  fill?: number;
  /** Which label is lit. Defaults to the stop in the score's tier. */
  activeStop?: number | null;
  /** How hard the fire burns right now: at rest, under a hover, being dragged. */
  energy?: HotnessMeterEnergy;
  /** Nothing chosen yet. Draws a cold track and a hollow, unlit pointer. */
  unset?: boolean;
  /**
   * Leave the accessible name to something else. The slider sets this, since
   * its input already announces "Wild, 80 percent heat".
   */
  decorative?: boolean;
  className?: string;
  /** Laid over the track, full width. This is where the slider's input goes. */
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

  // One animated number carries the pointer, and the torch and embers with it,
  // through the `--fill` custom property, so none of them can drift out of step
  // with the others the way separate transitions would.
  const spring = useSpring(target, GLIDE);
  useEffect(() => {
    if (glide) spring.set(target);
    else spring.jump(target);
  }, [glide, spring, target]);
  const fillPercent = useTransform(spring, (value) => `${(value * 100).toFixed(3)}%`);

  // The flame trails the way a carried torch does: it leans back against the
  // direction of travel, harder the faster the pointer moves, and straightens
  // as the spring settles. Read off the spring's own velocity, so a jump
  // (reduced motion, or `animated` off) never leans it at all.
  const velocity = useVelocity(spring);
  const trail = useTransform(velocity, (speed) => {
    const lean = Math.min(Math.max(speed * 14, -22), 22);
    return `${lean.toFixed(2)}deg`;
  });
  const ramp = useMemo(() => rampGradient(stops), [stops]);

  // A flare goes off from the ember every time the level changes, so the
  // change itself is an event you see and not only a new resting state. Keyed
  // on a counter, so each change mounts a fresh flare and replays it. Tracked
  // during render rather than in an effect: nothing flares on first paint,
  // only on a change.
  const [seenTier, setSeenTier] = useState(tier);
  const [flares, setFlares] = useState(0);
  if (seenTier !== tier) {
    setSeenTier(tier);
    if (tier > 0) setFlares((count) => count + 1);
  }

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
            "--trail": trail,
            "--ramp": ramp,
            "--tier": tier,
            "--stops": stops.length,
          } as unknown as React.CSSProperties
        }
      >
        <div className={styles.stage}>
          <div className={styles.rail}>
            <Tube />
            <div className={styles.pointerRail} aria-hidden>
              <div className={styles.pointer}>
                <span className={styles.bloom} />
                {flares > 0 && glide ? <span key={flares} className={styles.flare} /> : null}
                <div className={styles.torch}>
                  <Fire tier={tier} running={animated && onscreen && !reduced} />
                  {showParticles && tier >= 3 ? <Particles tier={tier} size={size} /> : null}
                </div>
                <span className={styles.orb} data-meter-needle>
                  <span className={styles.orbCore} />
                </span>
              </div>
            </div>
            {children ? <div className={styles.overlay}>{children}</div> : null}
          </div>
        </div>

        <ol className={styles.labels} aria-hidden>
          {stops.map((stop, at) => {
            const chilies = chiliCount(stop.percent);
            return (
              <li
                key={stop.slug}
                data-on={!unset && at === active}
                style={{ "--swatch": heatSwatch(stop.percent) } as React.CSSProperties}
              >
                <span className={styles.labelName}>{stop.name}</span>
                <span className={styles.pepper} data-none={chilies === 0}>
                  <Chili />
                  <span className={styles.pepperCount}>×{chilies}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </m.div>
    </LazyMotion>
  );
}

/** Seconds each layer takes to move through all its poses at Hot. Unrelated,
 * so the inside of the flame always moves against the outside. Each level
 * scales these by its `FLAME_TEMPER` speed. */
const FLAME_CLOCK: Record<FlameLayer, number> = { outer: 2.3, body: 1.7, core: 1.3 };

/**
 * The flame on the pointer: one SVG, three nested silhouettes.
 *
 * The envelope is the tall ragged outline in the tier's edge colour, the body
 * the amber mass inside it, and the core the white hot heart sitting down on
 * the ember. Each morphs through its own poses (see `flameFrames`) with SMIL,
 * which every browser runs, Safari included, and which moves a path's shape
 * rather than just stretching a box. Colours come from the tier's `--f-*`
 * tokens, so a level change recolours the flame without re-rendering it.
 *
 * The level sets how fast and how wildly it moves (`FLAME_TEMPER`): a slow
 * steady candle at Lite, a thrashing blaze at Insane.
 *
 * Memoised on the level and `running`. SMIL ignores CSS, so the clocks are paused here
 * when the meter is off screen, `animated` is off or motion is reduced, and
 * reset to their first pose for the last two, which is a complete still flame.
 */
const Fire = memo(function Fire({ tier, running }: { tier: HeatTier; running: boolean }) {
  // useId returns characters a url(#...) reference cannot carry.
  const id = `flame${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const node = svg.current;
    if (!node || typeof node.pauseAnimations !== "function") return;
    if (running) node.unpauseAnimations();
    else node.pauseAnimations();
  }, [running]);

  const temper = FLAME_TEMPER[tier];
  const layers = useMemo(
    () =>
      (["outer", "body", "core"] as const).map((layer) => ({
        layer,
        frames: flameFrames(layer, temper.wildness),
        splines: flameSplines(layer),
        dur: `${(FLAME_CLOCK[layer] * temper.speed).toFixed(2)}s`,
      })),
    [temper],
  );

  const { baseX, baseY } = FLAME_BOX;

  return (
    <div className={styles.fire} aria-hidden>
      <div className={styles.pool} />
      <div className={styles.flames}>
        <svg
          ref={svg}
          className={styles.flame}
          viewBox={`0 0 ${FLAME_BOX.width} ${FLAME_BOX.height}`}
          preserveAspectRatio="xMidYMax meet"
          focusable="false"
        >
          <defs>
            {/* Envelope: the tier's body colour at the root, its edge colour
                up the flanks, gone by the tip. */}
            <linearGradient id={`${id}-outer`} gradientUnits="userSpaceOnUse" x1="0" y1={baseY} x2="0" y2="6">
              <stop offset="0" style={{ stopColor: "var(--f-mid)" }} />
              <stop offset="0.62" style={{ stopColor: "var(--f-edge)" }} />
              <stop offset="1" style={{ stopColor: "var(--f-edge)", stopOpacity: 0.15 }} />
            </linearGradient>
            <linearGradient id={`${id}-body`} gradientUnits="userSpaceOnUse" x1="0" y1={baseY} x2="0" y2="36">
              <stop offset="0" style={{ stopColor: "var(--f-core)" }} />
              <stop offset="0.6" style={{ stopColor: "var(--f-mid)" }} />
              <stop offset="1" style={{ stopColor: "var(--f-mid)", stopOpacity: 0.1 }} />
            </linearGradient>
            {/* Core: white hot where it meets the ember, cooling outward. */}
            <radialGradient id={`${id}-core`} gradientUnits="userSpaceOnUse" cx={baseX} cy={baseY} r="60">
              <stop offset="0" style={{ stopColor: "var(--f-base)" }} />
              <stop offset="0.5" style={{ stopColor: "var(--f-base)", stopOpacity: 0.9 }} />
              <stop offset="1" style={{ stopColor: "var(--f-core)", stopOpacity: 0 }} />
            </radialGradient>
            {/* Soft edges. The flame is small, so blurring it each frame is a
                few thousand pixels, not the page. */}
            <filter id={`${id}-soft`} x="-40%" y="-20%" width="180%" height="140%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
            <filter id={`${id}-softer`} x="-40%" y="-20%" width="180%" height="140%">
              <feGaussianBlur stdDeviation="1.6" />
            </filter>
          </defs>

          {layers.map(({ layer, frames, splines, dur }) => (
            <path
              key={layer}
              d={frames[0]}
              fill={`url(#${id}-${layer})`}
              filter={`url(#${id}-${layer === "outer" ? "soft" : "softer"})`}
            >
              <animate
                attributeName="d"
                dur={dur}
                repeatCount="indefinite"
                calcMode="spline"
                values={frames.join(";")}
                keySplines={splines}
              />
            </path>
          ))}
        </svg>
      </div>
      <div className={styles.haze} />
    </div>
  );
});

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
 * The chili under each label: a glossy red pepper lying on a slant, green
 * stem up and to the right. Flat fills with a shade and a highlight rather
 * than gradients, so it needs no ids and stays crisp at label size. Colours
 * come from the `--chili-*` tokens, which is how a stop with no heat draws it
 * hollow.
 */
const Chili = memo(function Chili() {
  return (
    <svg className={styles.chili} viewBox="0 0 24 24" focusable="false" aria-hidden>
      <path
        className={styles.chiliBody}
        d="M17.6 7.2C19.6 8.6 19.7 11.4 17.3 14.3C14.4 17.8 9.4 20.7 3.6 21.6C2.9 21.7 2.7 21.1 3.2 20.8C7.6 18 10.6 14.6 12.6 10.6C13.9 8.1 15.6 6.3 17.6 7.2Z"
      />
      <path
        className={styles.chiliShade}
        d="M19 10.4C18.4 13.8 13.6 18.2 5.4 21C11 19.6 16 16.2 19 10.4Z"
      />
      <path className={styles.chiliShine} d="M15.4 9.4C13.9 11.8 11.9 14.6 8.8 17.1" />
      <path
        className={styles.chiliCalyx}
        d="M13.9 9C14.6 6.9 16.9 5.8 19.3 6.9C18.6 8.2 16.6 8.1 15.2 9.6C14.8 10 14 9.6 13.9 9Z"
      />
      <path className={styles.chiliStem} d="M17.3 6.6C17.4 4.8 18.5 3.3 20.5 2.6" />
    </svg>
  );
});

/**
 * The track: a capsule painted with the ramp, a sheet of glass over it, and a
 * shade that cools the whole thing while nothing is chosen. It depends on
 * nothing that moves, so it paints once.
 */
const Tube = memo(function Tube() {
  return (
    <div className={styles.tube} aria-hidden>
      <div className={styles.channel}>
        <div className={styles.ramp} />
        <div className={styles.glass} />
        <div className={styles.shade} />
      </div>
    </div>
  );
});
