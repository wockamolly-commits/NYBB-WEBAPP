"use client";

import { useId, useState } from "react";
import {
  flameIntensity,
  flamePath,
  flameTongues,
  heatSliderState,
  heatSwatch,
  stopAt,
  type HeatStop,
} from "@/lib/menu/heat-slider";
import { cn } from "@/lib/utils";

/**
 * The Level of Hotness, as one bar you slide.
 *
 * NYBB sells heat as a priced product and the scale is the brand's best visual
 * hook. It used to be drawn as a static ramp saying all five stops at once,
 * which is a price list of a thing rather than the thing. This is the same
 * five swatches, but you move along them and the bar burns to where you are.
 *
 * The control is a real `<input type="range">` lying invisible over the
 * artwork. Everything painted below it is `aria-hidden` decoration. That is
 * deliberate: drag, tap, arrow keys, Home and End, and a screen reader
 * announcing "Wild, 80 percent" all come from the platform rather than from a
 * hand-rolled `role="slider"` that would get two of those wrong.
 *
 * The ramp stays five fixed swatches and never becomes a gradient, for the
 * reason globals.css gives: a level is the same colour on a product page, a
 * receipt and a kitchen ticket. The track is hard bands, like the heat rule.
 */

export type HeatSliderVariant = "band" | "inline";

/**
 * The fire's own coordinate box.
 *
 * One viewBox for both variants, stretched to whatever width the bar is
 * (`preserveAspectRatio="none"`). Roughly ten to one, which is the shape a wide
 * burning line actually is, so the horizontal stretch the two variants apply on
 * top of it stays small enough not to fatten the tongues.
 *
 * Tongues are drawn to at most 78% of the height. The rest is headroom for the
 * displacement filter, which pushes tips past wherever the path put them; drawn
 * to the full height, the tallest tongues hit the ceiling and came out with
 * flat tops, which is the one thing a flame never has.
 */
const FIRE_W = 1000;
const FIRE_H = 100;
const TIP_HEADROOM = 0.78;

/**
 * Tongue counts per layer. The band is wider and carries the page's one big
 * moment, so it gets a denser fire than the compact one in a menu panel.
 */
const TONGUES = {
  band: { body: 14, licks: 24 },
  inline: { body: 9, licks: 15 },
} as const;

export function HeatSlider({
  stops,
  variant = "inline",
  label,
  value,
  onChange,
  prices,
  className,
}: {
  stops: HeatStop[];
  /** `band` is the landing page's full bleed moment. `inline` is everywhere else. */
  variant?: HeatSliderVariant;
  /** The accessible name of the control. */
  label: string;
  /**
   * The chosen slug, or null for "nothing chosen yet".
   *
   * Passing this makes the control controlled, which is what the wings
   * configurator does. Leaving it undefined makes it a showcase that keeps its
   * own position and commits nothing.
   */
  value?: string | null;
  onChange?: (slug: string) => void;
  /**
   * Formatted upcharges keyed by stop slug, for the surfaces that show them.
   *
   * A map rather than a `(stop) => string` callback because the landing page
   * and the menu page are both server components, and a function cannot cross
   * that boundary. Pricing is formatted on the server either way.
   */
  prices?: Record<string, string | null>;
  className?: string;
}) {
  const inputId = useId();
  // Filter and gradient ids have to be unique per instance: two bars on one
  // page sharing an id would both render through whichever defs won.
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");

  /**
   * The showcase starts partway up the scale rather than at either end, so the
   * bar arrives already lit and the flame has something to do. A control that
   * opens empty reads as broken rather than as cold.
   */
  const [ownIndex, setOwnIndex] = useState(() => Math.floor((stops.length - 1) / 2));

  /**
   * Whether the flame is moving. It burns while somebody is working the
   * control and settles to a still silhouette the moment they let go.
   *
   * DESIGN.md gives the landing page exactly one authored animation, on the
   * grounds that motion belongs to the product's own mechanism where somebody
   * is choosing. An idle loop would be a second one, running whether or not
   * anybody is there. This one only exists in response to a hand.
   */
  const [live, setLive] = useState(false);

  const controlled = value !== undefined;
  const state = heatSliderState(stops, value);
  const index = controlled ? state.index : ownIndex;
  const stop = stopAt(stops, index);

  // Untouched is not "No heat". An uncontrolled showcase commits nothing, so
  // it is never in the untouched state; a controlled one starts there and
  // leaves it on the first real interaction. See lib/menu/heat-slider.ts.
  const chosen = controlled ? state.chosen : true;

  if (!stop || stops.length === 0) return null;

  const percent = stop.percent;
  const price = prices?.[stop.slug] ?? null;

  /**
   * The track, as one hard band per stop in that stop's own fixed swatch.
   *
   * Built here rather than in CSS because the number of stops is data: the
   * configurator carries "No heat" and the showcase surfaces do not, and the
   * owner can add a sixth level in the Workspace without anybody editing a
   * stylesheet. Hard stops, never a blend, keeping faith with the ramp being
   * five quoted swatches rather than a decoration derived from them.
   */
  const bands = `linear-gradient(90deg, ${stops
    .map((band, at) => {
      const from = (at / stops.length) * 100;
      const to = ((at + 1) / stops.length) * 100;
      return `${heatSwatch(band.percent)} ${from}% ${to}%`;
    })
    .join(", ")})`;

  /**
   * The fire, in two layers on two different seeds, each capped so the
   * displacement filter has somewhere to push the tips into.
   *
   * The body is shorter and broader and never goes out. The licks are taller
   * and narrower and spend part of every cycle invisible, which is what lets
   * them travel without the bar ever going dark behind them.
   */
  const shape = TONGUES[variant];
  const body = flameTongues(shape.body, 0).map((tongue) => ({
    ...tongue,
    // Low and broad. The body was half the bar's height and 1.5x as wide,
    // and fourteen of those overlapping composite to a solid slab with a
    // flat top: a red rectangle, not a fire. It is an undulating base now,
    // and every tall shape in the fire belongs to the licks.
    height: tongue.height * TIP_HEADROOM * 0.5,
    width: tongue.width * 1.3,
  }));
  const licks = flameTongues(shape.licks, 1).map((tongue) => ({
    ...tongue,
    // Lifted off the floor rather than scaled from it. The hash runs from
    // 0.38 up, which averages out around half the reserved height, and a
    // fire using half the room set aside for it reads as a glow hugging the
    // bar with a lot of empty dark above. Compressing the bottom of the
    // range keeps the variance that matters and spends the whole box.
    height: (0.42 + 0.58 * tongue.height) * TIP_HEADROOM,
    width: tongue.width * 0.76,
  }));

  function commit(next: number) {
    const target = stopAt(stops, next);
    if (!target) return;
    if (!controlled) setOwnIndex(Math.min(Math.max(next, 0), stops.length - 1));
    onChange?.(target.slug);
  }

  /**
   * Working an untouched control is itself a choice.
   *
   * Without this, the coldest stop is unreachable. An untouched slider parks
   * its thumb at index 0, so pressing Left or Home, or clicking the far end of
   * the track, leaves the input's value where it already was and fires no
   * change event at all. The customer who specifically wants "No heat" presses
   * the key, watches nothing happen, and is left on "Pick a level".
   *
   * So any deliberate interaction commits whatever the thumb is already on. A
   * press that does move the value still fires its own change afterwards and
   * wins, which is why this only ever commits the current index.
   */
  function commitIfUntouched() {
    if (!chosen) commit(index);
  }

  return (
    <div
      className={cn("heat-slider", className)}
      data-variant={variant}
      data-live={live}
      data-chosen={chosen}
      // Zero heat draws no flame and no fill at all, which is the honest
      // picture of "flavour only" and the reason the CSS branches on it.
      data-cold={percent === 0}
      style={
        {
          // The lit run covers whole segments, so the coldest stop still shows
          // a band rather than a hairline.
          "--heat-fill": `${((index + 1) / stops.length) * 100}%`,
          "--heat-flame": flameIntensity(percent),
          "--heat-colour": heatSwatch(percent),
          "--heat-stops": stops.length,
        } as React.CSSProperties
      }
    >
      <div className="heat-slider__stage">
        {/* Flames. Clipped to the lit run, so they only ever rise off the
            part of the bar that is burning. */}
        <div className="heat-slider__fire" aria-hidden>
          {/* The bed: the white hot line where the fire meets the bar. Every
              flame is brightest where it touches its fuel, whatever colour the
              rest of it is, and this is what ties the fire to the bar instead
              of leaving it hovering above one. */}
          <div className="heat-slider__bed" />

          <svg
            className="heat-slider__flames"
            viewBox={`0 0 ${FIRE_W} ${FIRE_H}`}
            preserveAspectRatio="none"
          >
            <defs>
              {/* Two colours only: the hot yellow every flame has at its base,
                  and the level's own swatch through the body. The tail falls
                  off fast, because twenty overlapping slow tails is what
                  turned the old fire into a maroon smear. */}
              <linearGradient id={`${gid}-body`} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="var(--color-nybb-heat-1)" stopOpacity="0.82" />
                <stop offset="0.46" stopColor="var(--heat-colour)" stopOpacity="0.26" />
                <stop offset="1" stopColor="var(--heat-colour)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id={`${gid}-lick`} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="#fff4cc" stopOpacity="0.95" />
                <stop offset="0.28" stopColor="var(--color-nybb-heat-1)" stopOpacity="0.8" />
                <stop offset="0.68" stopColor="var(--heat-colour)" stopOpacity="0.3" />
                <stop offset="1" stopColor="var(--heat-colour)" stopOpacity="0" />
              </linearGradient>

              {/* Two roughnesses, because one blur over everything is what made
                  the old fire read as fog. The body is soft and out of focus
                  behind; the licks are tighter and legible in front. That
                  difference is the depth. */}
              {(
                [
                  ["soft", 13, 2.5, "0.016 0.024"],
                  ["sharp", 8, 1.2, "0.028 0.04"],
                ] as const
              ).map(([name, displace, blur, frequency]) => (
                <filter
                  key={name}
                  id={`${gid}-${name}`}
                  x="-30%"
                  y="-30%"
                  width="160%"
                  height="170%"
                  colorInterpolationFilters="sRGB"
                >
                  <feTurbulence
                    type="fractalNoise"
                    baseFrequency={frequency}
                    numOctaves={3}
                    seed={name === "soft" ? 17 : 41}
                    result="noise"
                  />
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="noise"
                    scale={displace}
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result="rough"
                  />
                  <feGaussianBlur in="rough" stdDeviation={blur} />
                </filter>
              ))}
            </defs>

            {/* The body. Always lit, swaying slowly. This is the mass of the
                fire, and the reason the licks above can fade to nothing on
                their cycle without the bar ever going dark. */}
            <g filter={`url(#${gid}-soft)`}>
              <g className="heat-slider__layer">
                {body.map((tongue, at) => (
                  <path
                    key={at}
                    className="heat-slider__tongue heat-slider__tongue--body"
                    d={flamePath(tongue, FIRE_W, FIRE_H)}
                    fill={`url(#${gid}-body)`}
                    style={
                      {
                        "--dur": `${tongue.duration * 2.4}s`,
                        "--delay": `${tongue.delay}s`,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </g>
            </g>

            {/* The licks. Each one is born at the bar, rises, narrows and goes
                out, then starts again. This is the whole difference between
                fire and a row of shapes being scaled: flame travels. */}
            <g filter={`url(#${gid}-sharp)`}>
              <g className="heat-slider__layer">
                {licks.map((tongue, at) => (
                  <path
                    key={at}
                    className="heat-slider__tongue heat-slider__tongue--lick"
                    d={flamePath(tongue, FIRE_W, FIRE_H)}
                    fill={`url(#${gid}-lick)`}
                    style={
                      {
                        "--dur": `${tongue.duration * 1.5}s`,
                        "--delay": `${tongue.delay}s`,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </g>
            </g>
          </svg>
        </div>

        {/* The track: one hard band per stop, in the fixed ramp, with the
            unlit run shrouded rather than recoloured. */}
        <div className="heat-slider__track" aria-hidden>
          <div className="heat-slider__bands" style={{ backgroundImage: bands }} />
          {/* The light the fire throws back down onto its fuel. Without it
              the bar stays flat and graphic while the fire above it is lit,
              and the two read as separate drawings stacked. */}
          <div className="heat-slider__lit" />
          <div className="heat-slider__shroud" />
        </div>

        <div className="heat-slider__thumb" aria-hidden />

        <label className="sr-only" htmlFor={inputId}>
          {label}
        </label>
        <input
          id={inputId}
          className="heat-slider__input"
          type="range"
          min={0}
          max={stops.length - 1}
          step={1}
          value={index}
          // The percentage is the brand's own number and the name is what a
          // customer orders by, so the reader gets both rather than "3".
          aria-valuetext={`${stop.name}, ${percent} percent heat`}
          onChange={(event) => commit(Number(event.target.value))}
          onKeyDown={commitIfUntouched}
          onPointerDown={() => {
            setLive(true);
            commitIfUntouched();
          }}
          onPointerUp={() => setLive(false)}
          onPointerCancel={() => setLive(false)}
          onFocus={() => setLive(true)}
          onBlur={() => setLive(false)}
          onMouseEnter={() => setLive(true)}
          onMouseLeave={() => setLive(false)}
        />
      </div>

      {/* The stop names, sitting under their own bands. Nothing is
          highlighted until something is chosen, because an untouched thumb
          rests on the first stop without having picked it. */}
      <ol className="heat-slider__ticks" aria-hidden>
        {stops.map((tick, at) => (
          <li key={tick.slug} data-on={chosen && at === index}>
            {tick.name}
          </li>
        ))}
      </ol>

      <p className="heat-slider__readout" aria-hidden>
        <span className="heat-slider__name">{chosen ? stop.name : "Pick a level"}</span>
        {chosen ? <span className="heat-slider__percent">{percent}%</span> : null}
        {chosen && price ? <span className="heat-slider__price">{price}</span> : null}
      </p>
    </div>
  );
}
