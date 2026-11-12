/**
 * The large animated figures, as SVG source. Original drawings, made for this
 * site; nothing here is traced from clip art or anybody's character.
 *
 * Every one faces RIGHT. The engine mirrors them for a crossing the other way.
 * They are rasterised once each, at the size they will be drawn, into an
 * offscreen canvas (see loadSprite in engine.ts), and only transformed per
 * frame after that.
 */

const svg = (w: number, h: number, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${inner}</svg>`;

/** Two gallop frames: legs reaching, legs gathered. */
function reindeer(reach: boolean): string {
  const legs = reach
    ? `<path d="M18 30l-8 12M22 31l-3 13M40 31l6 12M44 30l11 9" stroke="#5a3a1a" stroke-width="3.2" stroke-linecap="round"/>`
    : `<path d="M18 31l-2 12M22 31l3 12M40 31l-2 12M44 30l3 12" stroke="#5a3a1a" stroke-width="3.2" stroke-linecap="round"/>`;
  return svg(
    64,
    48,
    `${legs}
    <ellipse cx="31" cy="27" rx="17" ry="8" fill="#8a5a2b"/>
    <path d="M44 24q4-10 9-13l4 4q-4 4-6 12z" fill="#8a5a2b"/>
    <ellipse cx="56" cy="13" rx="6.5" ry="4.5" fill="#8a5a2b"/>
    <circle cx="62" cy="14" r="2.6" fill="#e53935"/>
    <circle cx="55" cy="11" r="1.2" fill="#1a1008"/>
    <path d="M52 9l-3-7M50 5l-4-1M55 9l2-8M56 4l4-2" stroke="#d8c09a" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M14 25q-5-3-6 1" stroke="#8a5a2b" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M36 20q6 1 12 5" stroke="#c8102e" stroke-width="2.4" fill="none"/>`,
  );
}

export const REINDEER_A = reindeer(true);
export const REINDEER_B = reindeer(false);

export const SLEIGH = svg(
  80,
  56,
  `<path d="M6 48q-6 0-4-6M2 48h62q10 0 12-8" stroke="#f4c542" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M14 46l2-6M50 46l-2-6" stroke="#f4c542" stroke-width="2.4"/>
  <path d="M6 22h48q10 0 12 8l2 10H12q-8 0-8-8z" fill="#c8102e"/>
  <path d="M8 26h46q8 0 10 6" stroke="#f4c542" stroke-width="1.8" fill="none"/>
  <path d="M6 22q-2-8 4-10" stroke="#c8102e" stroke-width="4" fill="none" stroke-linecap="round"/>
  <ellipse cx="18" cy="16" rx="11" ry="9" fill="#7b4a1e"/><path d="M14 8q4-3 8 0" stroke="#5a3a1a" stroke-width="2" fill="none"/>
  <path d="M30 24q0-14 12-14t12 14z" fill="#c8102e"/>
  <rect x="30" y="20" width="24" height="4" fill="#fbf6ec"/>
  <circle cx="44" cy="6" r="6" fill="#f2c9a5"/>
  <path d="M38 7q6 10 12 0q-1 6-6 7-5-1-6-7z" fill="#fbf6ec"/>
  <path d="M37 4q4-9 13-4l4 6-3 1q-2-5-6-3z" fill="#c8102e"/><circle cx="55" cy="8" r="2.4" fill="#fbf6ec"/>
  <rect x="37" y="2" width="14" height="3" rx="1.5" fill="#fbf6ec"/>
  <path d="M52 16q8-2 14 4" stroke="#5a3a1a" stroke-width="1.4" fill="none"/>`,
);

export const DRAGON_HEAD = svg(
  64,
  44,
  `<path d="M2 22q6-14 26-14 12 0 20 6l12 2-4 6 6 4-14 2q-6 8-20 8Q8 36 2 22z" fill="#d7141e"/>
  <path d="M10 26q14 6 34 0l10 2q-12 6-22 6Q16 34 10 26z" fill="#ffcf3f"/>
  <path d="M20 8q-2-8 6-8M30 8q2-8 10-6" stroke="#ffcf3f" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="38" cy="15" r="4" fill="#fff"/><circle cx="39" cy="15" r="2" fill="#1a0606"/>
  <path d="M56 20q8 8 6 20M52 22q2 10-4 18" stroke="#ffcf3f" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M6 16q-6-6-4-14M10 14q0-8 6-12" stroke="#ffcf3f" stroke-width="2" fill="none" stroke-linecap="round"/>`,
);

function lion(step: boolean): string {
  const legs = step
    ? `<path d="M10 40l-4 12M18 40l4 12M42 40l-2 12M50 40l5 12" stroke="#ffcf3f" stroke-width="5" stroke-linecap="round"/>`
    : `<path d="M10 40l2 12M18 40l-2 12M42 40l3 12M50 40l-3 12" stroke="#ffcf3f" stroke-width="5" stroke-linecap="round"/>`;
  return svg(
    88,
    58,
    `${legs}
    <path d="M4 30q0-14 20-14h36v24H8q-4 0-4-10z" fill="#d7141e"/>
    <path d="M6 34q10 4 16 0t16 0 16 0" stroke="#ffcf3f" stroke-width="2.6" fill="none"/>
    <path d="M2 26q-2-6 4-8" stroke="#ffcf3f" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="68" cy="24" r="19" fill="#ffcf3f"/>
    <circle cx="68" cy="24" r="14" fill="#d7141e"/>
    <path d="M58 8q10-8 20 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="64" cy="20" r="4" fill="#fff"/><circle cx="76" cy="20" r="4" fill="#fff"/>
    <circle cx="65" cy="20" r="2" fill="#1a0606"/><circle cx="77" cy="20" r="2" fill="#1a0606"/>
    <path d="M60 30q10 8 20 0v4q-10 6-20 0z" fill="#fff"/>
    <circle cx="70" cy="6" r="3" fill="#2f8a4e"/>`,
  );
}

export const LION_A = lion(true);
export const LION_B = lion(false);

export const PAPER_PLANE = svg(
  56,
  30,
  `<path d="M2 14L54 2 24 28z" fill="#fbfaf5"/><path d="M54 2L24 28l-4-10z" fill="#dce4ee"/>
  <path d="M2 14l18 4 34-16" stroke="#9fb3c8" stroke-width="1.2" fill="none"/>`,
);

function bat(up: boolean): string {
  const wings = up
    ? `<path d="M20 14Q12 0 2 4q6 4 4 10 6-2 8 2 2-4 6-2zM24 14q8-14 18-10-6 4-4 10-6-2-8 2-2-4-6-2z"/>`
    : `<path d="M20 14Q12 20 2 26q8 0 8-6 4 4 8 0 2 0 2-6zM24 14q8 6 18 12-8 0-8-6-4 4-8 0-2 0-2-6z"/>`;
  return svg(
    44,
    30,
    `<g fill="#120818">${wings}<ellipse cx="22" cy="15" rx="4" ry="5"/><path d="M19 11l1-4 2 3 2-3 1 4z"/></g>
    <circle cx="21" cy="14" r=".9" fill="#ffd36b"/><circle cx="23.5" cy="14" r=".9" fill="#ffd36b"/>`,
  );
}

export const BAT_A = bat(true);
export const BAT_B = bat(false);
