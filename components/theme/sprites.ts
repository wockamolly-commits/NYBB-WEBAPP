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

/**
 * The dragon's head, facing right, drawn after the classic dance dragon: a
 * long red snout with a round nose, an open jaw, a big eye under a gold brow,
 * curling horns, a layered teal and blue mane, and gold whiskers. The body is
 * not part of this drawing; the engine paints it as one tapered, scaled curve
 * so it can ripple smoothly (see dragon() in engine.ts). The neck joins at the
 * left edge, around (14, 50).
 */
export const DRAGON_HEAD = svg(
  132,
  96,
  `<path d="M40 14 26 2 31 22 10 12 22 32 2 30 20 44 4 54 24 58 10 72 32 66 24 84 42 70Z" fill="#0f8a6c"/>
  <path d="M44 22 33 12 37 30 20 26 33 40 16 48 34 54 24 68 44 60Z" fill="#2b62d1"/>
  <path d="M46 30 38 24 40 36 30 38 40 46 32 54 46 52Z" fill="#ffcf3f"/>
  <path d="M56 22Q46 2 60 0q-6 8 4 18zM70 20Q70 2 84 4q-10 6-6 16z" fill="#ffb300" stroke="#c46a00" stroke-width="1.2"/>
  <path d="M40 36Q44 18 70 18q22 0 34 12h12q12 0 12 10t-10 10H104Q92 58 74 60L56 66Q42 66 38 52z" fill="#e3262d"/>
  <path d="M54 66Q76 60 104 62q6 6-2 10-26 8-46 4z" fill="#c4141d"/>
  <path d="M58 64Q80 58 102 62 84 68 60 68z" fill="#f58aa0"/>
  <path d="M74 60l3 5 3-5 3 5 3-5 3 5 3-5 3 5" stroke="#fff" stroke-width="1.6" fill="none" stroke-linejoin="round"/>
  <circle cx="120" cy="40" r="8" fill="#ff5a3a"/><circle cx="123" cy="37" r="2.2" fill="#ffd2c4"/>
  <path d="M60 30q12-12 26 0" stroke="#ffcf3f" stroke-width="5" fill="none" stroke-linecap="round"/>
  <ellipse cx="74" cy="38" rx="9" ry="8" fill="#fff"/><circle cx="77" cy="38" r="5" fill="#1d8a4a"/><circle cx="78" cy="37" r="2.4" fill="#0b1a10"/><circle cx="79.5" cy="35.5" r="1" fill="#fff"/>
  <path d="M90 44q6 4 12 0M94 50q5 3 10 0" stroke="#ffcf3f" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M112 50q10 10 2 20t4 18M106 52q4 12-6 18t-2 14" stroke="#ffb300" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <path d="M112 30q8-16 18-14" stroke="#ffb300" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M42 50q4 8 0 14 8-2 10 6 3-8 10-6-5-6-2-14z" fill="#ffcf3f"/>`,
);

/**
 * The lion dance, side on and facing right, after the southern lion: a red
 * and gold cloth body edged with white fur, a tufted tail, and the two
 * dancers' legs in striped trousers and yellow shoes. Two frames of gait. The
 * head is a separate drawing (LION_HEAD) so it can nod and rear on its own.
 */
function lionBody(step: boolean): string {
  const legs = step
    ? `<g stroke="#2a1208" stroke-width="1.6">
        <path d="M24 52l-4 14h9l3-14zM40 52l3 14h9l-3-14zM70 52l-3 14h9l2-14zM86 52l4 14h9l-4-14z" fill="#f57c1f"/>
        <path d="M19 65h10v5H17zM42 65h10l2 5H42zM66 65h10v5H64zM89 65h10l2 5H89z" fill="#ffcf3f"/></g>`
    : `<g stroke="#2a1208" stroke-width="1.6">
        <path d="M27 52l1 14h9l-1-14zM40 52l-1 14h9l1-14zM70 52l1 14h9l-1-14zM84 52l-1 14h9l1-14z" fill="#f57c1f"/>
        <path d="M26 65h10v5H25zM37 65h10v5H36zM69 65h10v5H68zM81 65h10v5H80z" fill="#ffcf3f"/></g>`;
  return svg(
    112,
    72,
    `${legs}
    <path d="M10 30q-10-4-8-14 6 4 10 2 0 6 6 8z" fill="#ffb300" stroke="#2a1208" stroke-width="1.4"/>
    <path d="M12 26Q16 12 40 12h50q16 0 18 16v18q0 8-10 8H20Q10 54 10 42z" fill="#e3262d" stroke="#2a1208" stroke-width="1.8"/>
    <path d="M14 30q30-10 92-6v8q-60-4-92 6z" fill="#f57c1f"/>
    <path d="M12 44q6-5 12 0t12 0 12 0 12 0 12 0 12 0 12 0 12 0" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <path d="M16 22q6-5 12 0t12 0 12 0 12 0 12 0 12 0 12 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  );
}

export const LION_BODY_A = lionBody(true);
export const LION_BODY_B = lionBody(false);

/** The lion's head, side on, facing right: horn, mirror, big eye, white fur brow and beard. */
export const LION_HEAD = svg(
  72,
  72,
  `<path d="M30 6l6-6 4 8z" fill="#ffcf3f" stroke="#2a1208" stroke-width="1.4"/>
  <path d="M10 30Q10 6 38 6q30 0 30 26 0 14-10 22l-8 10H22Q10 56 10 30z" fill="#e3262d" stroke="#2a1208" stroke-width="2"/>
  <path d="M30 10q8-4 16 2" stroke="#ffcf3f" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="26" cy="20" r="4" fill="#ffcf3f" stroke="#2a1208" stroke-width="1.2"/>
  <path d="M36 22q10-10 24-2-2 8-8 8-6 0-16-6z" fill="#fff" stroke="#2a1208" stroke-width="1.4"/>
  <circle cx="50" cy="32" r="9" fill="#fff" stroke="#2a1208" stroke-width="1.6"/><circle cx="52" cy="32" r="5.5" fill="#ffb300"/><circle cx="53" cy="32" r="2.6" fill="#2a1208"/>
  <path d="M40 46q8 10 30 2" stroke="#2a1208" stroke-width="1.4" fill="#fff"/>
  <path d="M30 50q4 4 8 0t8 0 8 0 8 0 8-2" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M30 50q4 4 8 0t8 0 8 0 8 0 8-2" stroke="#2a1208" stroke-width="1" fill="none" opacity=".5"/>
  <circle cx="66" cy="36" r="3" fill="#ffcf3f" stroke="#2a1208" stroke-width="1"/>`,
);

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
