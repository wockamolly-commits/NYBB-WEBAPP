/**
 * Writes app/themes.css and public/themes/*.svg from readable SVG source.
 *
 *   npm run themes:css
 *
 * Edit this file, never the output. Every palette comes from
 * lib/themes/palettes.ts; every pattern, garland and topper is drawn below as
 * plain SVG and turned into a CSS data URI here, so the art stays reviewable
 * and the stylesheet stays generated.
 *
 * All artwork is original and drawn for this file. Nothing is traced from clip
 * art or from anybody's character.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PALETTES, type Palette } from "../lib/themes/palettes";
import { SEASONAL_THEME_IDS, type SeasonalThemeId } from "../lib/themes/presets";

const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// SVG to CSS
// ---------------------------------------------------------------------------

function clean(svg: string): string {
  return svg.replace(/\s+/g, " ").replace(/> </g, "><").trim();
}

/** A CSS url() holding the SVG: single quotes inside, # escaped, spaces collapsed. */
function uri(svg: string): string {
  const body = clean(svg).replace(/"/g, "'").replace(/%/g, "%25").replace(/#/g, "%23");
  return `url("data:image/svg+xml;utf8,${body}")`;
}

function doc(w: number, h: number, inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${inner}</svg>`;
}

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

const heart = (x: number, y: number, s: number) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 3C0-1 5-2 6 1.6 7-2 12-1 12 3c0 4-6 7.5-6 7.5S0 7 0 3z"/>`;

const star5 = (x: number, y: number, r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}"/>`;
};

const sunburst = (x: number, y: number, r: number, rays = 8) => {
  let s = `<circle cx="${x}" cy="${y}" r="${(r * 0.45).toFixed(1)}"/>`;
  for (let i = 0; i < rays; i++) {
    const a = ((Math.PI * 2) / rays) * i;
    const x1 = x + Math.cos(a) * r * 0.6;
    const y1 = y + Math.sin(a) * r * 0.6;
    const x2 = x + Math.cos(a) * r;
    const y2 = y + Math.sin(a) * r;
    s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="${(r * 0.16).toFixed(1)}" stroke-linecap="round"/>`;
  }
  return s;
};

const snowflake = (x: number, y: number, r: number) => {
  let s = "";
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const ex = x + Math.cos(a) * r;
    const ey = y + Math.sin(a) * r;
    const mx = x + Math.cos(a) * r * 0.55;
    const my = y + Math.sin(a) * r * 0.55;
    const b1 = a + 0.6;
    const b2 = a - 0.6;
    s += `<line x1="${x}" y1="${y}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}"/>`;
    s += `<line x1="${mx.toFixed(1)}" y1="${my.toFixed(1)}" x2="${(mx + Math.cos(b1) * r * 0.32).toFixed(1)}" y2="${(my + Math.sin(b1) * r * 0.32).toFixed(1)}"/>`;
    s += `<line x1="${mx.toFixed(1)}" y1="${my.toFixed(1)}" x2="${(mx + Math.cos(b2) * r * 0.32).toFixed(1)}" y2="${(my + Math.sin(b2) * r * 0.32).toFixed(1)}"/>`;
  }
  return `<g stroke-width="${(r * 0.14).toFixed(1)}" stroke-linecap="round">${s}</g>`;
};

// ---------------------------------------------------------------------------
// Patterns: PATTERNS[id](color, opacity) => [tile size, svg]
// ---------------------------------------------------------------------------

type Pattern = (color: string, opacity: number) => [size: number, svg: string];

const PATTERNS: Record<SeasonalThemeId, Pattern> = {
  "new-year": (c, o) => [
    120,
    doc(
      120,
      120,
      `<g fill="${c}" stroke="${c}" opacity="${o}">${star5(22, 24, 9)}${star5(86, 78, 6)}${sunburst(84, 22, 12, 12)}${sunburst(28, 88, 9, 10)}
      <rect x="54" y="48" width="8" height="3" transform="rotate(30 58 50)"/><rect x="100" y="104" width="8" height="3" transform="rotate(-25 104 105)"/>
      <circle cx="60" cy="102" r="2.5"/><circle cx="108" cy="52" r="2"/><circle cx="8" cy="60" r="2"/></g>`,
    ),
  ],
  sinulog: (c, o) => [
    64,
    doc(
      64,
      64,
      `<g fill="none" stroke="${c}" stroke-width="3" opacity="${o}">
      <path d="M0 8h16M32 8h16M16 24h16M48 24h16M0 40h16M32 40h16M16 56h16M48 56h16"/>
      <path d="M8 0v16M40 0v16M24 16v16M56 16v16M8 32v16M40 32v16M24 48v16M56 48v16" stroke-dasharray="0"/></g>`,
    ),
  ],
  "chinese-new-year": (c, o) => [
    128,
    doc(
      128,
      128,
      `<g fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" opacity="${o}">
      <path d="M10 40c0-10 14-12 18-4 4-10 20-8 18 4 8 0 10 10 2 12H14c-8-2-8-12-4-12z"/>
      <circle cx="94" cy="30" r="12"/><rect x="89" y="25" width="10" height="10"/>
      <path d="M70 98c0-10 14-12 18-4 4-10 20-8 18 4 8 0 10 10 2 12H74c-8-2-8-12-4-12z"/>
      <circle cx="30" cy="100" r="9"/><rect x="26" y="96" width="8" height="8"/></g>
      <g fill="${c}" opacity="${o}"><circle cx="60" cy="66" r="3"/><circle cx="66" cy="60" r="3"/><circle cx="54" cy="60" r="3"/><circle cx="57" cy="54" r="3"/><circle cx="63" cy="54" r="3"/></g>`,
    ),
  ],
  valentines: (c, o) => [
    96,
    doc(
      96,
      96,
      `<g fill="${c}" opacity="${o}">${heart(10, 12, 1.4)}${heart(60, 30, 1)}${heart(30, 62, 1.1)}${heart(74, 74, 1.5)}${heart(4, 84, 0.7)}${heart(80, 4, 0.7)}</g>`,
    ),
  ],
  summer: (c, o) => [
    120,
    doc(
      120,
      120,
      `<g fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round" opacity="${o}">
      <path d="M0 40q15-12 30 0t30 0 30 0 30 0"/><path d="M0 100q15-12 30 0t30 0 30 0 30 0"/></g>
      <g fill="${c}" stroke="${c}" opacity="${o}">${sunburst(90, 70, 13, 10)}${sunburst(24, 72, 7, 8)}</g>`,
    ),
  ],
  "independence-day": (c, o) => [
    120,
    doc(
      120,
      120,
      `<g fill="${c}" stroke="${c}" opacity="${o}">${sunburst(30, 34, 16, 8)}${star5(90, 24, 7)}${star5(84, 92, 7)}${star5(24, 96, 5)}${star5(64, 64, 4)}</g>`,
    ),
  ],
  "back-to-school": (c, o) => [
    140,
    doc(
      140,
      140,
      `<g fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="${o}">
      <path d="M14 30l8-16 8 16M17 24h10"/><path d="M60 14v18M60 14h8a4.5 4.5 0 010 9h-8M60 23h9a4.5 4.5 0 010 9h-9"/>
      <path d="M104 18a9 9 0 100 14"/><path d="M20 70h24M32 58v24"/><path d="M84 64l20 20M104 64l-20 20"/>
      <path d="M14 112l30-12 6 6-30 12z"/><path d="M14 112l6 6"/><path d="M84 116q10-16 20 0t20 0"/><circle cx="66" cy="96" r="7"/></g>`,
    ),
  ],
  halloween: (c, o) => [
    140,
    doc(
      140,
      140,
      `<g fill="none" stroke="${c}" stroke-width="2" opacity="${o}">
      <path d="M0 0l40 40M0 0l46 14M0 0l14 46M12 4q4 8 0 12M24 8q6 10 0 18M4 12q8 4 12 0M8 24q10 6 18 0"/></g>
      <g fill="${c}" opacity="${o}">
      <path d="M84 30c6-8 12-8 14-2 2-6 8-6 14 2-6-1-8 2-10 6-2-3-6-3-8 0-2-4-4-7-10-6z"/>
      <path d="M36 104a16 16 0 1 0 14-24 12 12 0 1 1-14 24z"/>
      <path d="M108 100c4-5 8-5 9-1 1-4 5-4 9 1-4-1-5 1-6 4-1-2-4-2-5 0-1-3-3-5-7-4z"/></g>`,
    ),
  ],
  christmas: (c, o) => [
    120,
    doc(
      120,
      120,
      `<g fill="none" stroke="${c}" opacity="${o}">${snowflake(28, 30, 14)}${snowflake(88, 84, 11)}${snowflake(92, 22, 6)}${snowflake(24, 96, 6)}</g>
      <g fill="${c}" opacity="${o}"><circle cx="60" cy="58" r="2.5"/><circle cx="110" cy="56" r="2"/><circle cx="56" cy="110" r="2"/></g>`,
    ),
  ],
};

// ---------------------------------------------------------------------------
// Garlands: one tile that repeats along the bottom of the header.
// ---------------------------------------------------------------------------

type Garland = { w: number; h: number; svg: (p: Palette) => string; twinkle?: boolean };

const cord = (w: number, sag: number, color: string) =>
  `<path d="M0 2Q${w / 2} ${sag} ${w} 2" fill="none" stroke="${color}" stroke-width="1.5"/>`;

const GARLANDS: Record<SeasonalThemeId, Garland> = {
  "new-year": {
    w: 96,
    h: 18,
    svg: (p) =>
      doc(96, 18, `<path d="M0 3l12 10 12-10 12 10 12-10 12 10 12-10 12 10 12-10" fill="none" stroke="${p.accent}" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M0 3l12 10 12-10 12 10 12-10 12 10 12-10 12 10 12-10" fill="none" stroke="${p.charcoal}" stroke-width="1" stroke-linejoin="round" opacity=".5"/>`),
  },
  sinulog: {
    w: 120,
    h: 26,
    svg: () =>
      doc(120, 26, `${cord(120, 8, "#5e1f0a")}
      <path d="M4 3h20l-10 18z" fill="#ffd60a"/><path d="M28 5h20l-10 18z" fill="#e63946"/><path d="M52 6h20l-10 18z" fill="#2a9d8f"/>
      <path d="M76 5h20l-10 18z" fill="#f4a261"/><path d="M100 3h20l-10 18z" fill="#7b2cbf"/>`),
  },
  "chinese-new-year": {
    w: 150,
    h: 34,
    svg: (p) =>
      doc(150, 34, `${cord(150, 6, p.accent)}
      <g><line x1="30" y1="5" x2="30" y2="9" stroke="${p.accent}" stroke-width="1.5"/><rect x="25" y="8" width="10" height="3" fill="${p.accent}"/>
      <ellipse cx="30" cy="19" rx="11" ry="9" fill="#d7141e"/><path d="M30 10v18M24 11q-4 8 0 16M36 11q4 8 0 16" stroke="${p.accent}" stroke-width="1" fill="none"/>
      <rect x="25" y="27" width="10" height="3" fill="${p.accent}"/><path d="M28 30v4M30 30v4M32 30v4" stroke="${p.accent}" stroke-width="1"/></g>
      <g transform="translate(70 4)"><line x1="5" y1="0" x2="5" y2="4" stroke="${p.accent}" stroke-width="1.5"/>
      <rect x="1" y="4" width="8" height="12" rx="1.5" fill="#d7141e"/><rect x="1" y="8" width="8" height="2" fill="${p.accent}"/>
      <rect x="1" y="17" width="8" height="12" rx="1.5" fill="#d7141e"/><rect x="1" y="21" width="8" height="2" fill="${p.accent}"/></g>
      <g transform="translate(110 4)"><line x1="10" y1="0" x2="10" y2="3" stroke="${p.accent}" stroke-width="1.5"/>
      <ellipse cx="10" cy="13" rx="9" ry="8" fill="#d7141e"/><rect x="6" y="20" width="8" height="2.5" fill="${p.accent}"/></g>`),
  },
  valentines: {
    w: 72,
    h: 22,
    svg: (p) =>
      doc(72, 22, `${cord(72, 7, p.charcoal)}<g fill="#e0315b">${heart(10, 6, 1.1)}</g><g fill="${p.accent}">${heart(46, 7, 0.9)}</g>`),
  },
  summer: {
    w: 48,
    h: 14,
    svg: (p) =>
      doc(48, 14, `<path d="M0 0h48v6q-6 8-12 0t-12 0-12 0-12 0z" fill="${p.charcoal}"/><path d="M0 5q6 8 12 0t12 0 12 0 12 0" fill="none" stroke="${p.accent}" stroke-width="1.5"/>`),
  },
  "independence-day": {
    w: 96,
    h: 26,
    svg: () =>
      doc(96, 26, `${cord(96, 8, "#0b2a6b")}
      <path d="M4 3h22l-11 19z" fill="#0038a8"/><path d="M36 6h22l-11 19z" fill="#f8f8f8"/><path d="M68 3h22l-11 19z" fill="#ce1126"/>
      <g fill="#fcd116" stroke="#fcd116">${sunburst(47, 11, 4.5, 8)}</g>`),
  },
  "back-to-school": {
    w: 60,
    h: 12,
    svg: () =>
      doc(60, 12, `<rect width="60" height="10" fill="#ffc72c"/><rect y="9" width="60" height="1.5" fill="#b8860b"/>
      <path d="M0 0v7M6 0v3.5M12 0v3.5M18 0v3.5M24 0v3.5M30 0v7M36 0v3.5M42 0v3.5M48 0v3.5M54 0v3.5" stroke="#0c1a2e" stroke-width="1.2"/>`),
  },
  halloween: {
    w: 96,
    h: 26,
    svg: (p) =>
      doc(96, 26, `${cord(96, 8, "#120818")}<path d="M4 3h22l-11 19z" fill="${p.accent}"/><path d="M36 6h22l-11 19z" fill="${p.charcoal}"/><path d="M68 3h22l-11 19z" fill="${p.accent}"/>
      <path d="M40 12c2-2 4-2 4 0 0-2 2-2 4 0-2 0-2 1-3 2l-1-1-1 1c-1-1-1-2-3-2z" fill="${p.accent}"/>`),
  },
  christmas: {
    w: 88,
    h: 26,
    twinkle: true,
    svg: () =>
      doc(88, 26, `<path d="M0 3Q22 11 44 3T88 3" fill="none" stroke="#1d3b2a" stroke-width="1.5"/>
      <g><rect x="9" y="6" width="5" height="4" fill="#1d3b2a"/><ellipse cx="11.5" cy="15" rx="4.5" ry="6.5" fill="#ff4d4d"/></g>
      <g><rect x="31" y="8" width="5" height="4" fill="#1d3b2a"/><ellipse cx="33.5" cy="17" rx="4.5" ry="6.5" fill="#ffd34d"/></g>
      <g><rect x="53" y="8" width="5" height="4" fill="#1d3b2a"/><ellipse cx="55.5" cy="17" rx="4.5" ry="6.5" fill="#4dd28a"/></g>
      <g><rect x="75" y="6" width="5" height="4" fill="#1d3b2a"/><ellipse cx="77.5" cy="15" rx="4.5" ry="6.5" fill="#5ab8ff"/></g>`),
  },
};

// ---------------------------------------------------------------------------
// Logo toppers, placed by measurement rather than by eye.
//
// The wordmark (public/img/wordmark.*.webp) is 900 x 519 and rectangular, so
// there is no rim. Measured once from the artwork, as fractions of its box:
//   - The "O" of BUFFALO is the mark's one round head: its crown sits at
//     about (0.94, 0.155), just below the K in YORK, which ends
//     at x 0.93 and y 0.10. A hat is worn on its right shoulder, clear of
//     the K, and tilted away from it so NEW YORK stays whole.
//   - The clear corner beside the mark: right of the S in BRAD'S (which ends
//     at x 0.865) and between the O (bottom y 0.42) and the registered mark
//     (top y 0.78). It may run a little past the box into the header's gap.
// ---------------------------------------------------------------------------

const LOGO = { w: 900, h: 519 };
const HAT_CROWN = { x: 0.975, y: 0.175 };
const HAT_WIDTH = 0.165; // of the logo's width
const HAT_TILT = 24;
const BESIDE = { x0: 0.885, y0: 0.4, x1: 1.065, y1: 0.8 };

type Topper = {
  kind: "hat" | "beside";
  /** Art viewBox width and height; the art fills it tightly. */
  box: [number, number];
  /** The pivot, as fractions of the box: the brim's middle for a hat, the cord's top for a hanger. */
  anchor: [number, number];
  motion: "theme-tip" | "theme-float" | "theme-swing" | "none";
  svg: string;
};

const TOPPERS: Record<SeasonalThemeId, Topper> = {
  "new-year": {
    kind: "hat",
    box: [40, 46],
    anchor: [0.5, 0.92],
    motion: "theme-tip",
    svg: `<path d="M20 2L3 42h34z" fill="#18275a"/><path d="M20 2l-6 14h12zM11 23h18l3 7H8zM6 36h28l2 6H4z" fill="#f5d06f"/>
      <circle cx="20" cy="4" r="4" fill="#f5d06f"/><path d="M1 40q19 8 38 0v5H1z" fill="#f5d06f"/>`,
  },
  sinulog: {
    kind: "beside",
    box: [36, 44],
    anchor: [0.5, 0.5],
    motion: "none",
    svg: `<path d="M18 2l4 9 9-3-3 9 9 4-9 4 3 9-9-3-4 9-4-9-9 3 3-9-9-4 9-4-3-9 9 3z" fill="#ffd60a"/>
      <circle cx="18" cy="21" r="8" fill="#e63946"/><circle cx="18" cy="21" r="4" fill="#ffd60a"/>
      <path d="M12 30l-4 13 6-3 2 4 2-13zM24 30l4 13-6-3-2 4-2-13z" fill="#2a9d8f"/>`,
  },
  "chinese-new-year": {
    kind: "beside",
    box: [30, 52],
    anchor: [0.5, 0],
    motion: "theme-swing",
    svg: `<line x1="15" y1="0" x2="15" y2="8" stroke="#ffcf3f" stroke-width="2"/><rect x="8" y="7" width="14" height="4" rx="1" fill="#ffcf3f"/>
      <ellipse cx="15" cy="24" rx="14" ry="13" fill="#d7141e"/>
      <path d="M15 11v26M7 13q-5 11 0 22M23 13q5 11 0 22" stroke="#ffcf3f" stroke-width="1.4" fill="none"/>
      <rect x="8" y="36" width="14" height="4" rx="1" fill="#ffcf3f"/><path d="M11 40v11M15 40v12M19 40v11" stroke="#ffcf3f" stroke-width="1.6"/>`,
  },
  valentines: {
    kind: "beside",
    box: [40, 36],
    anchor: [0.5, 0.5],
    motion: "theme-float",
    svg: `<path d="M20 34S2 23 2 11C2 3 13-1 20 8c7-9 18-5 18 3 0 12-18 23-18 23z" fill="#e0315b"/>
      <path d="M9 9q3-4 7-1" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".7"/>`,
  },
  summer: {
    kind: "beside",
    box: [44, 44],
    anchor: [0.5, 0.5],
    motion: "theme-float",
    svg: `<g stroke="#ff9f1c" stroke-width="3.4" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315]
      .map((a) => {
        const r = (a * Math.PI) / 180;
        return `<line x1="${(22 + Math.cos(r) * 14).toFixed(1)}" y1="${(22 + Math.sin(r) * 14).toFixed(1)}" x2="${(22 + Math.cos(r) * 20).toFixed(1)}" y2="${(22 + Math.sin(r) * 20).toFixed(1)}"/>`;
      })
      .join("")}</g><circle cx="22" cy="22" r="11" fill="#ffd23f"/>
      <path d="M14 20h6l1 2h2l1-2h6v3q-1 3-4 3t-4-3h-2q-1 3-4 3t-2-3z" fill="#0b3a4f"/>`,
  },
  "independence-day": {
    kind: "beside",
    box: [44, 44],
    anchor: [0.5, 0.5],
    motion: "theme-float",
    svg: `<g stroke="#fcd116" stroke-width="3.4" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315]
      .map((a) => {
        const r = (a * Math.PI) / 180;
        return `<line x1="${(22 + Math.cos(r) * 13).toFixed(1)}" y1="${(22 + Math.sin(r) * 13).toFixed(1)}" x2="${(22 + Math.cos(r) * 20.5).toFixed(1)}" y2="${(22 + Math.sin(r) * 20.5).toFixed(1)}"/>`;
      })
      .join("")}</g><circle cx="22" cy="22" r="10" fill="#fcd116"/>`,
  },
  "back-to-school": {
    kind: "beside",
    box: [36, 42],
    anchor: [0.5, 0.5],
    motion: "theme-float",
    svg: `<path d="M18 12c-4-3-16-3-16 11 0 11 8 18 12 18 2 0 3-1 4-1s2 1 4 1c4 0 12-7 12-18 0-14-12-14-16-11z" fill="#d62828"/>
      <path d="M18 12q-1-6 2-10" stroke="#5a3a1a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M20 8q6-7 13-3-6 7-13 3z" fill="#4caf50"/><path d="M9 18q2-3 5-3" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".6"/>`,
  },
  halloween: {
    kind: "hat",
    box: [48, 40],
    anchor: [0.5, 0.86],
    motion: "theme-tip",
    svg: `<path d="M22 2q8 6 9 14l3 16H12l5-14q1-10 5-16z" fill="#2a1440"/><path d="M13 27h22l1 5H12z" fill="#ff8c1a"/>
      <ellipse cx="24" cy="35" rx="23" ry="4.5" fill="#2a1440"/><rect x="21" y="26" width="7" height="7" fill="none" stroke="#ffd36b" stroke-width="1.6"/>`,
  },
  christmas: {
    kind: "hat",
    box: [46, 44],
    anchor: [0.4, 0.86],
    motion: "theme-tip",
    // A slouched cap: a red cone whose tip flops over to the right and hangs
    // its pompom down beside the brim.
    svg: `<path d="M5 33C9 18 15 6 27 4c8-1 14 5 14 15h-5c0-5-3-8-6-7-4 2 0 13 4 21z" fill="#c8102e"/>
      <path d="M13 30q3-14 11-21" stroke="#8c0b20" stroke-width="2" fill="none" opacity=".45"/>
      <circle cx="38.5" cy="21" r="5.5" fill="#fbf6ec"/>
      <rect x="2" y="31" width="36" height="11" rx="5.5" fill="#fbf6ec"/>`,
  },
};

function topperVars(t: Topper): string[] {
  const [bw, bh] = t.box;
  const ratio = `${bw} / ${bh}`;
  const aspectLogo = LOGO.w / LOGO.h;
  let xPct: number;
  let yPct: number;
  let wPct: number;
  let rot = 0;
  if (t.kind === "hat") {
    // The anchor goes on the crown; the width is fixed so every hat is the
    // same size on the mark.
    wPct = HAT_WIDTH * 100;
    xPct = HAT_CROWN.x * 100;
    yPct = HAT_CROWN.y * 100;
    rot = HAT_TILT;
  } else {
    // Fit the art's box into the clear corner, preserving its aspect, and
    // centre it there. Widths are in logo widths; heights in logo heights.
    const zoneW = BESIDE.x1 - BESIDE.x0; // logo widths
    const zoneH = (BESIDE.y1 - BESIDE.y0) / aspectLogo; // logo widths
    const artAspect = bw / bh;
    const w = Math.min(zoneW, zoneH * artAspect);
    const h = w / artAspect;
    const left = BESIDE.x0 + (zoneW - w) / 2;
    const top = (BESIDE.y0 + (BESIDE.y1 - BESIDE.y0) / 2) / aspectLogo - h / 2; // logo widths
    wPct = w * 100;
    xPct = (left + w * t.anchor[0]) * 100;
    yPct = ((top + h * t.anchor[1]) * aspectLogo) * 100;
  }
  return [
    `--theme-topper: ${uri(doc(bw, bh, t.svg))};`,
    `--topper-x: ${xPct.toFixed(2)}%;`,
    `--topper-y: ${yPct.toFixed(2)}%;`,
    `--topper-w: ${wPct.toFixed(2)}%;`,
    `--topper-ratio: ${ratio};`,
    `--topper-ax: ${(t.anchor[0] * 100).toFixed(0)}%;`,
    `--topper-ay: ${(t.anchor[1] * 100).toFixed(0)}%;`,
    `--topper-rot: ${rot}deg;`,
    `--topper-motion: ${t.motion};`,
  ];
}

// ---------------------------------------------------------------------------
// The Christmas footer elf, a standalone SVG with its own wave animation.
// ---------------------------------------------------------------------------

const ELF = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 110" width="80" height="110">
<style>
.body{animation:bob 2.4s ease-in-out infinite;transform-origin:40px 108px}
.arm{animation:wave 6s ease-in-out infinite;transform-origin:56px 62px}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
@keyframes wave{0%,62%,100%{transform:rotate(0)}68%{transform:rotate(-38deg)}74%{transform:rotate(-12deg)}80%{transform:rotate(-38deg)}86%{transform:rotate(0)}}
@media (prefers-reduced-motion:reduce){.body,.arm{animation:none}}
</style>
<g class="body">
<path d="M28 106l2-18h8l-1 18zM42 106l1-18h8l2 18z" fill="#1d3b2a"/>
<path d="M24 108q0-5 8-5h6v5zM42 103h6q8 0 8 5H42z" fill="#5a3a1a"/>
<path d="M24 90q-2-26 16-30 18 4 16 30z" fill="#2f8a4e"/>
<rect x="24" y="80" width="32" height="5" fill="#5a3a1a"/><rect x="37" y="79" width="6" height="7" fill="none" stroke="#f4c542" stroke-width="1.6"/>
<path d="M24 90l4 6 4-6 4 6 4-6 4 6 4-6 4 6 4-6" fill="none" stroke="#c8102e" stroke-width="2"/>
<path d="M26 66q-8 6-6 16" stroke="#2f8a4e" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="20" cy="83" r="3.6" fill="#f2c9a5"/>
<circle cx="40" cy="44" r="15" fill="#f2c9a5"/>
<path d="M25 44q-7-2-9-10 7 1 10 6zM55 44q7-2 9-10-7 1-10 6z" fill="#f2c9a5"/>
<circle cx="35" cy="45" r="2" fill="#0e1a13"/><circle cx="45" cy="45" r="2" fill="#0e1a13"/>
<path d="M35 52q5 4 10 0" stroke="#8a3a2a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
<circle cx="31" cy="50" r="2.4" fill="#e88" opacity=".6"/><circle cx="49" cy="50" r="2.4" fill="#e88" opacity=".6"/>
<path d="M24 36Q28 10 52 4q-6 12-2 32z" fill="#c8102e"/><circle cx="52" cy="4" r="4" fill="#fbf6ec"/>
<rect x="23" y="32" width="34" height="7" rx="3.5" fill="#fbf6ec"/>
</g>
<g class="arm"><path d="M54 66q10-4 12-14" stroke="#2f8a4e" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="66" cy="50" r="3.8" fill="#f2c9a5"/></g>
</svg>`;

// ---------------------------------------------------------------------------
// Write the stylesheet.
// ---------------------------------------------------------------------------

function tokens(p: Palette): string[] {
  return [
    `--color-nybb-ink: ${p.ink};`,
    `--color-nybb-charcoal: ${p.charcoal};`,
    `--color-nybb-graphite: ${p.graphite};`,
    `--color-nybb-orange: ${p.accent};`,
    `--color-nybb-orange-lit: ${p.accentLit};`,
    `--color-nybb-yellow: ${p.signal};`,
    `--color-nybb-cream: ${p.cream};`,
    `--color-nybb-parchment: ${p.parchment};`,
    `--color-nybb-parchment-deep: ${p.parchmentDeep};`,
    `--nybb-ground-1: ${p.ground[0]};`,
    `--nybb-ground-2: ${p.ground[1]};`,
    `--nybb-ground-3: ${p.ground[2]};`,
    `--nybb-ground-4: ${p.ground[3]};`,
    `--nybb-chrome-shadow: ${p.shadow};`,
    `--background: ${p.ground[1]};`,
    `--foreground: ${p.ink};`,
    `--card: ${p.charcoal};`,
    `--popover: ${p.charcoal};`,
    `--muted: ${p.charcoal};`,
    `--secondary: ${p.graphite};`,
    `--accent: ${p.graphite};`,
    `--input: ${p.graphite};`,
    `--primary: ${p.accent};`,
    `--primary-foreground: ${p.ink};`,
    `--ring: ${p.accent};`,
  ];
}

function themeBlock(id: SeasonalThemeId): string {
  const p = PALETTES[id];
  const [dSize, dark] = PATTERNS[id]("#f5f1ea", 0.075);
  const [lSize, light] = PATTERNS[id](p.ink, 0.1);
  const g = GARLANDS[id];
  const decl = [
    ...tokens(p),
    `--theme-pattern: ${uri(dark)};`,
    `--theme-pattern-size: ${dSize}px ${dSize}px;`,
    `--theme-pattern-light: ${uri(light)};`,
    `--theme-pattern-light-size: ${lSize}px ${lSize}px;`,
    `--theme-garland: ${uri(g.svg(p))};`,
    `--theme-garland-size: ${g.w}px ${g.h}px;`,
    `--theme-garland-h: ${g.h}px;`,
    `--theme-garland-motion: ${g.twinkle ? "theme-twinkle" : "theme-sway"};`,
    ...topperVars(TOPPERS[id]),
  ];
  const body = decl.map((d) => `  ${d}`).join("\n");
  // The document level block carries the colours only. The artwork is drawn
  // inside the wrapper and nowhere else, so it is written once, below.
  const colours = tokens(p).map((d) => `  ${d}`).join("\n");
  // Two selectors, written out twice rather than joined, because an engine
  // that does not know :has() would throw the whole joined list away.
  //   - :root:has(...) puts the theme on the document, so the body ground,
  //     overscroll, and popups portalled outside the wrapper all wear it from
  //     the first paint, with no script.
  //   - [data-theme] alone scopes it to an element: the wrapper itself, and
  //     the Workspace's gallery cards and live sample.
  return `:root:has(.theme-root[data-theme="${id}"]) {\n${colours}\n}\n[data-theme="${id}"] {\n${body}\n}\n`;
}

const SHARED = `
/* ---- Shared rules. Everything is scoped to a seasonal theme; the everyday
   look renders none of it. ---- */

.theme-root {
  display: contents;
}

/* .theme-sample is the Workspace's miniature storefront. It wears every
   decoration below, but it is not a .theme-root, so the :root:has() blocks
   above never fire for it and the Workspace keeps its own colours. */

/* Header and footer: the light print over the chrome's own wash. */
:is(.theme-root, .theme-sample):not([data-theme="default"]) .surface-chrome {
  background-image:
    var(--theme-pattern-light),
    linear-gradient(180deg in oklab, var(--color-nybb-cream) 0%, var(--color-nybb-parchment) 100%);
  background-size: var(--theme-pattern-light-size), 100% 100%;
}

/* The dark bands: the light-on-dark print. */
:is(.theme-root, .theme-sample):not([data-theme="default"]) .band-ink {
  background-image: var(--theme-pattern);
  background-size: var(--theme-pattern-size);
}

/* The garland hangs from the header's bottom edge. Absolutely placed, so it
   never moves anything; pointer-events none, so nothing under it is lost. */
:is(.theme-root, .theme-sample):not([data-theme="default"]) .site-header::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  height: var(--theme-garland-h);
  background: var(--theme-garland) repeat-x 0 0 / var(--theme-garland-size);
  pointer-events: none;
  transform-origin: 50% 0;
}

/* The topper, placed in percentages of the logo link so it scales with the
   mark at every breakpoint. A paper cut outline keeps dark art legible on
   the light chrome and light art legible on itself. */
:is(.theme-root, .theme-sample) .site-header__logo {
  position: relative;
}

:is(.theme-root, .theme-sample):not([data-theme="default"]) .site-header__logo::after {
  content: "";
  position: absolute;
  left: var(--topper-x);
  top: var(--topper-y);
  width: var(--topper-w);
  aspect-ratio: var(--topper-ratio);
  background: var(--theme-topper) center / contain no-repeat;
  transform-origin: var(--topper-ax) var(--topper-ay);
  transform: translate(calc(-1 * var(--topper-ax)), calc(-1 * var(--topper-ay))) rotate(var(--topper-rot));
  filter:
    drop-shadow(1.5px 0 0 #fff) drop-shadow(-1.5px 0 0 #fff) drop-shadow(0 1.5px 0 #fff) drop-shadow(0 -1.5px 0 #fff)
    drop-shadow(1px 2px 1.5px rgb(var(--nybb-chrome-shadow) / 0.35));
  pointer-events: none;
}

/* The Christmas elf, standing on the footer's top edge, lined up with the
   content column's left edge and well clear of the floating buttons, which
   sit bottom right and bottom left at the viewport, not on the footer. */
:is(.theme-root, .theme-sample)[data-theme="christmas"] .site-footer {
  position: relative;
}

:is(.theme-root, .theme-sample)[data-theme="christmas"] .site-footer::before {
  content: "";
  position: absolute;
  bottom: 100%;
  left: max(1rem, calc(50% - 36rem + 1.5rem));
  width: clamp(44px, 6vw, 64px);
  aspect-ratio: 80 / 110;
  margin-bottom: -2px;
  background: url("/themes/elf.svg") center bottom / contain no-repeat;
  pointer-events: none;
}

/* The banner. The light-on-dark print over the card colour, bone type (AA on
   every theme's card, see tests/unit/theme-contrast.test.ts) and an accent
   rule under it. It is the one theme element that takes up height, which is
   expected and why it can be closed. */
.theme-banner {
  position: relative;
  z-index: 51;
  background-color: var(--color-nybb-charcoal);
  background-image: var(--theme-pattern);
  background-size: var(--theme-pattern-size);
  border-bottom: 3px solid var(--color-nybb-orange);
  color: var(--color-nybb-bone);
  --theme-emblem-cut: var(--color-nybb-charcoal);
}

.theme-banner__inner {
  margin-inline: auto;
  display: flex;
  max-width: 72rem;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.5rem 0.5rem 0.5rem 1rem;
}

.theme-banner__emblem {
  color: var(--color-nybb-orange);
}

.theme-banner__text {
  flex: 1 1 auto;
  max-width: 48rem;
  text-align: center;
  text-wrap: balance;
  font-weight: 700;
  font-size: 1rem;
  line-height: 1.35;
}

.theme-banner__close {
  display: inline-flex;
  flex: none;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: var(--color-nybb-bone);
  transition: background-color 150ms ease-out;
}

.theme-banner__close:hover {
  background-color: color-mix(in srgb, var(--color-nybb-bone) 14%, transparent);
}

.theme-banner__close:focus-visible {
  outline: 2px solid var(--color-nybb-orange);
  outline-offset: 2px;
}

@media (max-width: 639px) {
  .theme-banner__emblem--end {
    display: none;
  }

  .theme-banner__text {
    text-align: left;
    font-size: 0.875rem;
  }
}

/* Overscroll and the gutter behind a scroll lock match the theme. */
:root:has(.theme-root:not([data-theme="default"])) body {
  background-color: var(--nybb-ground-2);
}

/* The canvas layer: over the page art, under the header (z 50), the floating
   cards (z 30 to 40) and the skip link (z 60). */
.theme-fx {
  pointer-events: none;
}

.theme-fx--page {
  position: fixed;
  inset: 0;
  z-index: 20;
  width: 100%;
  height: 100%;
}

.theme-fx--box {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

@media (prefers-reduced-motion: no-preference) {
  :is(.theme-root, .theme-sample):not([data-theme="default"]) .site-header::after {
    animation: var(--theme-garland-motion) 6s ease-in-out infinite alternate;
  }

  :is(.theme-root, .theme-sample)[data-theme="christmas"] .site-header::after {
    animation: theme-twinkle 1.6s steps(2, jump-none) infinite;
  }

  :is(.theme-root, .theme-sample):not([data-theme="default"]) .site-header__logo::after {
    animation: var(--topper-motion) 5s ease-in-out infinite;
  }

  .theme-banner {
    animation: theme-banner-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .theme-banner__emblem {
    animation: theme-bob 3.2s ease-in-out infinite;
  }

  .theme-banner__emblem--end {
    animation-delay: -1.6s;
  }
}

@keyframes theme-banner-in {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: none; opacity: 1; }
}

@keyframes theme-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

@keyframes theme-sway {
  from { transform: skewX(-1.2deg); }
  to { transform: skewX(1.2deg); }
}

@keyframes theme-twinkle {
  from { filter: brightness(1) saturate(1); }
  to { filter: brightness(1.35) saturate(1.3) drop-shadow(0 0 3px rgb(255 230 140 / 0.7)); }
}

@keyframes theme-tip {
  0%, 100% { transform: translate(calc(-1 * var(--topper-ax)), calc(-1 * var(--topper-ay))) rotate(var(--topper-rot)); }
  50% { transform: translate(calc(-1 * var(--topper-ax)), calc(-1 * var(--topper-ay))) rotate(calc(var(--topper-rot) - 7deg)); }
}

@keyframes theme-float {
  0%, 100% { transform: translate(calc(-1 * var(--topper-ax)), calc(-1 * var(--topper-ay))); }
  50% { transform: translate(calc(-1 * var(--topper-ax)), calc(-1 * var(--topper-ay) - 6%)); }
}

@keyframes theme-swing {
  0%, 100% { transform: translate(calc(-1 * var(--topper-ax)), calc(-1 * var(--topper-ay))) rotate(-7deg); }
  50% { transform: translate(calc(-1 * var(--topper-ax)), calc(-1 * var(--topper-ay))) rotate(7deg); }
}

@media print {
  .theme-root .site-header::after,
  .theme-root .site-header__logo::after,
  .theme-root .site-footer::before,
  .theme-banner,
  .theme-fx {
    display: none !important;
  }
}
`;

function main() {
  const header = `/* GENERATED by scripts/build-themes-css.ts. Edit the script, not this file,
   then run \`npm run themes:css\`. Palettes live in lib/themes/palettes.ts. */\n`;
  const css = header + SEASONAL_THEME_IDS.map(themeBlock).join("\n") + SHARED;
  writeFileSync(path.join(ROOT, "app", "themes.css"), css);

  const out = path.join(ROOT, "public", "themes");
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "elf.svg"), clean(ELF) + "\n");
  for (const id of SEASONAL_THEME_IDS) {
    const t = TOPPERS[id];
    writeFileSync(path.join(out, `${id}-topper.svg`), clean(doc(t.box[0], t.box[1], t.svg)) + "\n");
  }
  console.log(`themes.css: ${css.length} bytes, ${SEASONAL_THEME_IDS.length} themes`);
}

main();
