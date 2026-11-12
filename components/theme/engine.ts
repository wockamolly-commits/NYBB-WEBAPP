import type { EffectKind } from "@/lib/themes/presets";
import {
  BAT_A,
  BAT_B,
  DRAGON_HEAD,
  LION_BODY_A,
  LION_BODY_B,
  LION_HEAD,
  PAPER_PLANE,
  REINDEER_A,
  REINDEER_B,
  SLEIGH,
} from "./sprites";

/**
 * The seasonal canvas: one canvas, one requestAnimationFrame loop, no
 * dependencies.
 *
 * THE DESIGN GOAL IS THAT IT STAYS IN THE BACKGROUND. Counts are low, alpha is
 * low and motion is slow, because this sits over a menu people are trying to
 * read and order from. Everything here is decoration: the canvas never takes
 * pointer events or focus, and the CSS decoration still carries the theme on
 * a device with no 2D context.
 *
 * Under reduced motion or Save-Data it draws one thinned, still frame and
 * starts nothing: no loop, no listeners.
 */

type Mode = "fall" | "rise" | "ballistic" | "fly" | "prance" | "rocket" | "still";

type Particle = {
  mode: Mode;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  alpha: number;
  color: string;
  phase: number;
  sway: number;
  /** Seconds left, for ballistic and rocket. */
  ttl: number;
  life: number;
  drag: number;
  gravity: number;
  draw: Draw;
  /** fly: the figure's length behind (or ahead of) its anchor, to keep it until wholly gone. */
  len: number;
  baseY: number;
  /** rocket: the height it bursts at. prance: whether it has danced yet. */
  target: number;
  danced: boolean;
  pause: number;
  /** Seconds since spawn, for gaits and emitters. */
  age: number;
  emit: number;
  colors: readonly string[];
};

type Draw = (ctx: CanvasRenderingContext2D, p: Particle, t: number) => void;

type Effect = {
  /** Ambient particles per million CSS px squared, clamped to [min, max]. */
  density: number;
  min: number;
  max: number;
  /** How hard ambient particles drift from the pointer, within ~110px. 0 is off. */
  repel: number;
  /** Fade the last frame instead of clearing it, for firework trails. */
  trails?: boolean;
  ambient(w: number, h: number, initial: boolean): Particle;
  burst(x: number, y: number, h: number): Particle[];
  every?: { min: number; max: number; solo?: boolean; spawn(w: number, h: number, ctx: Ctx): Particle[] };
};

type Ctx = {
  scope: "page" | "box";
  host: HTMLElement | null;
  turn: number;
  born: Particle[];
  mobile: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const TAU = Math.PI * 2;

function base(partial: Partial<Particle> & Pick<Particle, "mode" | "draw">): Particle {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 6,
    rot: 0,
    vr: 0,
    alpha: 1,
    color: "#fff",
    phase: Math.random() * TAU,
    sway: 0,
    ttl: 0,
    life: 1,
    drag: 0.9,
    gravity: 0,
    len: 0,
    baseY: 0,
    target: 0,
    danced: false,
    pause: 0,
    age: 0,
    emit: 0,
    colors: [],
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Shapes. Each draws centred on (0, 0) in a transformed context.
// ---------------------------------------------------------------------------

const dot: Draw = (c, p) => {
  c.fillStyle = p.color;
  c.beginPath();
  c.arc(0, 0, p.size / 2, 0, TAU);
  c.fill();
};

const flake: Draw = (c, p, t) => {
  if (p.size < 5) return dot(c, p, t);
  c.strokeStyle = p.color;
  c.lineWidth = Math.max(1, p.size / 8);
  c.lineCap = "round";
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (TAU / 6) * i;
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * p.size / 2, Math.sin(a) * p.size / 2);
  }
  c.stroke();
};

const heartShape: Draw = (c, p) => {
  const s = p.size / 12;
  c.fillStyle = p.color;
  c.beginPath();
  c.moveTo(0, 4 * s);
  c.bezierCurveTo(-7 * s, -1 * s, -4 * s, -7 * s, 0, -3 * s);
  c.bezierCurveTo(4 * s, -7 * s, 7 * s, -1 * s, 0, 4 * s);
  c.fill();
};

const rect: Draw = (c, p) => {
  c.fillStyle = p.color;
  c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
};

const ribbon: Draw = (c, p, t) => {
  c.strokeStyle = p.color;
  c.lineWidth = Math.max(1.5, p.size / 6);
  c.beginPath();
  for (let i = 0; i <= 8; i++) {
    const y = -p.size + (i / 8) * p.size * 2;
    const x = Math.sin(i * 0.9 + t * 4 + p.phase) * p.size * 0.25;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
};

const star: Draw = (c, p) => {
  const r = p.size / 2;
  c.fillStyle = p.color;
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
};

const sun: Draw = (c, p) => {
  const r = p.size / 2;
  c.fillStyle = p.color;
  c.strokeStyle = p.color;
  c.lineWidth = Math.max(1, r / 4);
  c.beginPath();
  c.arc(0, 0, r * 0.5, 0, TAU);
  c.fill();
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (TAU / 8) * i;
    c.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.stroke();
};

const leaf: Draw = (c, p) => {
  const s = p.size / 2;
  c.fillStyle = p.color;
  c.beginPath();
  c.moveTo(0, -s);
  c.quadraticCurveTo(s, 0, 0, s);
  c.quadraticCurveTo(-s, 0, 0, -s);
  c.fill();
};

const blossom: Draw = (c, p) => {
  const r = p.size / 2;
  c.fillStyle = p.color;
  for (let i = 0; i < 5; i++) {
    const a = (TAU / 5) * i;
    c.beginPath();
    c.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.45, 0, TAU);
    c.fill();
  }
  c.fillStyle = "#ffcf3f";
  c.beginPath();
  c.arc(0, 0, r * 0.25, 0, TAU);
  c.fill();
};

const coin: Draw = (c, p) => {
  const r = p.size / 2;
  c.fillStyle = "#ffcf3f";
  c.beginPath();
  c.ellipse(0, 0, r * Math.abs(Math.cos(p.rot * 2)) + 0.5, r, 0, 0, TAU);
  c.fill();
  c.fillStyle = "#b8860b";
  c.fillRect(-r * 0.2, -r * 0.2, r * 0.4, r * 0.4);
};

const lantern: Draw = (c, p) => {
  const r = p.size / 2;
  c.fillStyle = "#ffcf3f";
  c.fillRect(-r * 0.4, -r * 1.05, r * 0.8, r * 0.2);
  c.fillRect(-r * 0.4, r * 0.85, r * 0.8, r * 0.2);
  c.fillStyle = "#d7141e";
  c.beginPath();
  c.ellipse(0, 0, r, r * 0.9, 0, 0, TAU);
  c.fill();
  c.fillStyle = "rgba(255, 207, 63, 0.35)";
  c.beginPath();
  c.ellipse(0, 0, r * 0.45, r * 0.6, 0, 0, TAU);
  c.fill();
};

const bubble: Draw = (c, p) => {
  const r = p.size / 2;
  c.strokeStyle = p.color;
  c.lineWidth = Math.max(1, r / 6);
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.stroke();
  c.fillStyle = p.color;
  c.beginPath();
  c.arc(-r * 0.35, -r * 0.35, r * 0.2, 0, TAU);
  c.fill();
};

const glyph: Draw = (c, p) => {
  c.fillStyle = p.color;
  c.font = `700 ${p.size}px ui-rounded, "Comic Sans MS", system-ui, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(String.fromCharCode(p.target), 0, 0);
};

const pencil: Draw = (c, p) => {
  const l = p.size;
  c.fillStyle = "#ffc72c";
  c.fillRect(-l / 2, -l / 10, l * 0.8, l / 5);
  c.fillStyle = "#f2c9a5";
  c.beginPath();
  c.moveTo(l * 0.3, -l / 10);
  c.lineTo(l / 2, 0);
  c.lineTo(l * 0.3, l / 10);
  c.fill();
  c.fillStyle = "#e88";
  c.fillRect(-l / 2 - l * 0.08, -l / 10, l * 0.1, l / 5);
};

// ---------------------------------------------------------------------------
// Sprites
// ---------------------------------------------------------------------------

/** Draws the i-th frame of a rasterised sprite, mirrored when moving left. */
function sprite(name: string, height: number, frameSeconds = 0.18): Draw {
  return (c, p, t) => {
    const frames = SPRITES.get(name);
    if (!frames?.length) return;
    const img = frames[Math.floor((t + p.phase) / frameSeconds) % frames.length];
    const w = (img.width / img.height) * height;
    if (p.vx < 0) c.scale(-1, 1);
    c.drawImage(img, -w / 2, -height / 2, w, height);
  };
}

/**
 * Rasterised sprites, shared by every engine on the page and kept for its
 * life. The art is the same everywhere, so there is nothing to tear down.
 */
const SPRITES = new Map<string, HTMLCanvasElement[]>();

const SPRITE_SOURCES: Partial<Record<EffectKind, Record<string, string[]>>> = {
  snow: { reindeer: [REINDEER_A, REINDEER_B], sleigh: [SLEIGH] },
  lunar: { dragon: [DRAGON_HEAD], lionBody: [LION_BODY_A, LION_BODY_B], lionHead: [LION_HEAD] },
  school: { plane: [PAPER_PLANE] },
  halloween: { bat: [BAT_A, BAT_B] },
};

/** Rasterise an SVG once, at the size it will be drawn at, times the DPR. */
function loadSprite(svgText: string, height: number): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ratio = img.naturalWidth / img.naturalHeight || 1;
      canvas.height = Math.max(1, Math.round(height));
      canvas.width = Math.max(1, Math.round(height * ratio));
      const c = canvas.getContext("2d");
      if (!c) return resolve(null);
      c.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  });
}

/** Where the sky band is: just under the header's garland, above the hero headline. */
function skyBand(h: number, ctx: Ctx): [number, number] {
  let top = 0;
  if (ctx.scope === "page") {
    const header = document.querySelector(".site-header");
    const bottom = header ? header.getBoundingClientRect().bottom : 0;
    top = Math.max(0, bottom) + 34;
  } else {
    top = h * 0.24;
  }
  const bottom = Math.max(top + 20, Math.min(h * 0.32, top + 120));
  return [top, bottom];
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

function fallFrom(w: number, h: number, initial: boolean, p: Partial<Particle> & Pick<Particle, "draw">): Particle {
  return base({
    mode: "fall",
    x: rand(0, w),
    y: initial ? rand(0, h) : rand(-40, -10),
    ...p,
  });
}

function riseFrom(w: number, h: number, initial: boolean, p: Partial<Particle> & Pick<Particle, "draw">): Particle {
  return base({
    mode: "rise",
    x: rand(0, w),
    y: initial ? rand(0, h) : h + rand(10, 40),
    ...p,
  });
}

function spray(
  x: number,
  y: number,
  n: number,
  make: () => Partial<Particle> & Pick<Particle, "draw">,
  speed = 220,
  up = 0.6,
): Particle[] {
  return Array.from({ length: n }, () => {
    const a = rand(0, TAU);
    const v = rand(speed * 0.4, speed);
    return base({
      mode: "ballistic",
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - speed * up,
      gravity: 260,
      drag: 0.35,
      ttl: rand(0.9, 1.6),
      life: 1.6,
      vr: rand(-6, 6),
      ...make(),
    });
  });
}

const CONFETTI = ["#ffd60a", "#e63946", "#2a9d8f", "#f4a261", "#7b2cbf", "#fbf6ec"];
const PH = ["#0038a8", "#ce1126", "#fcd116", "#fbfbfd"];

function rocket(x: number, fromY: number, toY: number, colors: readonly string[]): Particle {
  return base({
    mode: "rocket",
    x,
    y: fromY,
    vy: -rand(380, 480),
    vx: rand(-20, 20),
    target: toY,
    size: 3,
    color: "#fff1b8",
    colors,
    draw: dot,
  });
}

const EFFECTS: Record<Exclude<EffectKind, "none">, Effect> = {
  snow: {
    density: 55,
    min: 18,
    max: 90,
    repel: 1.2,
    ambient: (w, h, initial) =>
      fallFrom(w, h, initial, {
        draw: flake,
        size: rand(3, 9),
        vy: rand(18, 42),
        sway: rand(6, 18),
        vr: rand(-0.5, 0.5),
        alpha: rand(0.45, 0.85),
        color: "#ffffff",
      }),
    burst: (x, y) => spray(x, y, 18, () => ({ draw: flake, size: rand(3, 8), color: "#ffffff", alpha: 0.9 }), 160, 0.4),
    every: {
      min: 22,
      max: 34,
      solo: true,
      spawn: (w, h, ctx) => {
        const [top, bottom] = skyBand(h, ctx);
        const right = Math.random() < 0.5;
        const height = ctx.mobile ? 34 : 62;
        const speed = ctx.mobile ? 100 : 150;
        const team = height * 4.2;
        return [
          base({
            mode: "fly",
            draw: sleighTeam(height),
            x: right ? -height * 1.4 : w + height * 1.4,
            baseY: rand(top + height / 2, Math.max(top + height / 2, bottom - height / 2)),
            vx: right ? speed : -speed,
            size: height,
            len: team + height * 1.5,
            sway: height * 0.25,
            alpha: 1,
          }),
        ];
      },
    },
  },
  hearts: {
    density: 26,
    min: 8,
    max: 36,
    repel: 1,
    ambient: (w, h, initial) =>
      riseFrom(w, h, initial, {
        draw: heartShape,
        size: rand(8, 18),
        vy: rand(14, 30),
        sway: rand(10, 24),
        alpha: rand(0.25, 0.5),
        color: pick(["#e0315b", "#ff8fab", "#ffc2d1"]),
      }),
    burst: (x, y) =>
      spray(x, y, 14, () => ({ draw: heartShape, size: rand(8, 16), color: pick(["#e0315b", "#ff8fab"]) }), 180, 0.8),
  },
  fireworks: {
    density: 30,
    min: 10,
    max: 40,
    repel: 0,
    trails: true,
    ambient: (w, h) =>
      base({
        mode: "still",
        draw: star,
        x: rand(0, w),
        y: rand(0, h * 0.7),
        size: rand(2, 5),
        alpha: rand(0.25, 0.6),
        color: pick(["#f5d06f", "#fff1b8", "#ffffff"]),
      }),
    burst: (x, y, h) => [rocket(x, h + 10, y, ["#f5d06f", "#ff6b6b", "#7bdff2", "#ffffff"])],
    every: {
      min: 2.5,
      max: 5.5,
      spawn: (w, h) => [rocket(rand(w * 0.1, w * 0.9), h + 10, rand(h * 0.15, h * 0.45), pick([
        ["#f5d06f", "#fff1b8"],
        ["#ff6b6b", "#ffd6a5"],
        ["#7bdff2", "#ffffff"],
        ["#b388ff", "#f5d06f"],
      ]))],
    },
  },
  sinulog: {
    density: 40,
    min: 12,
    max: 60,
    repel: 0.8,
    ambient: (w, h, initial) =>
      Math.random() < 0.2
        ? fallFrom(w, h, initial, { draw: ribbon, size: rand(10, 16), vy: rand(20, 36), sway: rand(10, 20), alpha: 0.5, color: pick(CONFETTI) })
        : fallFrom(w, h, initial, {
            draw: rect,
            size: rand(5, 10),
            vy: rand(26, 48),
            sway: rand(10, 26),
            vr: rand(-3, 3),
            alpha: rand(0.45, 0.75),
            color: pick(CONFETTI),
          }),
    burst: (x, y) => spray(x, y, 22, () => ({ draw: rect, size: rand(5, 9), color: pick(CONFETTI) }), 240),
  },
  lunar: {
    density: 30,
    min: 10,
    max: 44,
    repel: 0.8,
    ambient: (w, h, initial) => {
      const r = Math.random();
      if (r < 0.15)
        return riseFrom(w, h, initial, { draw: lantern, size: rand(12, 20), vy: rand(10, 18), sway: rand(6, 12), alpha: 0.45 });
      if (r < 0.4)
        return fallFrom(w, h, initial, { draw: coin, size: rand(7, 11), vy: rand(30, 50), sway: 6, vr: rand(1, 3), alpha: 0.7 });
      return fallFrom(w, h, initial, {
        draw: blossom,
        size: rand(7, 12),
        vy: rand(16, 30),
        sway: rand(10, 22),
        vr: rand(-1, 1),
        alpha: rand(0.45, 0.75),
        color: pick(["#ffb7c5", "#ffd1dc", "#fff0f3"]),
      });
    },
    burst: (x, y) => spray(x, y, 26, () => ({ draw: dot, size: rand(2, 4), color: pick(["#ffcf3f", "#ff4d4d", "#fff1b8"]) }), 300, 0.3),
    every: {
      min: 12,
      max: 20,
      solo: true,
      spawn: (w, h, ctx) => {
        ctx.turn += 1;
        const right = Math.random() < 0.5;
        if (ctx.turn % 2) {
          const [top, bottom] = skyBand(h, ctx);
          const size = ctx.mobile ? 34 : 56;
          const speed = ctx.mobile ? 100 : 140;
          return [
            base({
              mode: "fly",
              draw: dragon(size),
              x: right ? -size : w + size,
              baseY: rand(top + size, Math.max(top + size, bottom)),
              vx: right ? speed : -speed,
              size,
              len: size * 8,
              sway: size * 0.3,
            }),
          ];
        }
        const size = ctx.mobile ? 46 : 68;
        return [
          base({
            mode: "prance",
            draw: lionDance(size),
            x: right ? -size : w + size,
            y: h - size * 0.55,
            baseY: h - size * 0.55,
            vx: right ? 90 : -90,
            size,
            len: size * 1.6,
          }),
        ];
      },
    },
  },
  summer: {
    density: 28,
    min: 10,
    max: 40,
    repel: 1.4,
    ambient: (w, h, initial) =>
      riseFrom(w, h, initial, {
        draw: bubble,
        size: rand(6, 18),
        vy: rand(14, 30),
        sway: rand(8, 18),
        alpha: rand(0.3, 0.55),
        color: pick(["#ffffff", "#fff4dc", "#a2dbdc"]),
      }),
    burst: (x, y) => spray(x, y, 18, () => ({ draw: dot, size: rand(3, 6), color: pick(["#ffffff", "#a2dbdc"]) }), 220, 0.9),
  },
  independence: {
    density: 30,
    min: 10,
    max: 44,
    repel: 0.8,
    ambient: (w, h, initial) =>
      fallFrom(w, h, initial, {
        draw: Math.random() < 0.4 ? sun : star,
        size: rand(6, 12),
        vy: rand(18, 34),
        sway: rand(8, 18),
        vr: rand(-1, 1),
        alpha: rand(0.45, 0.75),
        color: pick(PH),
      }),
    burst: (x, y) => spray(x, y, 18, () => ({ draw: star, size: rand(5, 9), color: pick(PH) }), 220),
  },
  school: {
    density: 26,
    min: 8,
    max: 36,
    repel: 0.8,
    ambient: (w, h, initial) =>
      Math.random() < 0.18
        ? fallFrom(w, h, initial, { draw: pencil, size: rand(16, 24), vy: rand(20, 34), sway: 8, vr: rand(-0.6, 0.6), alpha: 0.6 })
        : fallFrom(w, h, initial, {
            draw: glyph,
            target: pick("ABC123+=xyz".split("")).charCodeAt(0),
            size: rand(12, 20),
            vy: rand(16, 30),
            sway: rand(6, 14),
            vr: rand(-0.6, 0.6),
            alpha: rand(0.3, 0.5),
            color: "#fbfaf5",
          }),
    burst: (x, y) =>
      spray(x, y, 12, () => ({ draw: glyph, target: pick("ABC123".split("")).charCodeAt(0), size: rand(12, 18), color: "#fbfaf5" }), 200),
    every: {
      min: 14,
      max: 26,
      solo: true,
      spawn: (w, h, ctx) => {
        const [top, bottom] = skyBand(h, ctx);
        const right = Math.random() < 0.5;
        const size = ctx.mobile ? 24 : 34;
        return [
          base({
            mode: "fly",
            draw: sprite("plane", size),
            x: right ? -size : w + size,
            baseY: rand(top + size, Math.max(top + size, bottom)),
            vx: right ? 130 : -130,
            size,
            len: size * 2,
            sway: size * 0.6,
          }),
        ];
      },
    },
  },
  halloween: {
    density: 28,
    min: 10,
    max: 40,
    repel: 1,
    ambient: (w, h, initial) =>
      fallFrom(w, h, initial, {
        draw: leaf,
        size: rand(8, 14),
        vy: rand(22, 40),
        sway: rand(16, 34),
        vr: rand(-2.5, 2.5),
        alpha: rand(0.45, 0.75),
        color: pick(["#ff8c1a", "#c2410c", "#ffd36b", "#7c2d12"]),
      }),
    burst: (x, y) => spray(x, y, 16, () => ({ draw: leaf, size: rand(8, 13), color: pick(["#ff8c1a", "#ffd36b"]) }), 220),
    every: {
      min: 12,
      max: 22,
      spawn: (w, h, ctx) => {
        const [top, bottom] = skyBand(h, ctx);
        const right = Math.random() < 0.5;
        const size = ctx.mobile ? 20 : 28;
        const y0 = rand(top + size, Math.max(top + size, bottom));
        return Array.from({ length: 3 }, (_, i) =>
          base({
            mode: "fly",
            draw: sprite("bat", size * (1 - i * 0.15), 0.12),
            x: (right ? -size : w + size) - (right ? 1 : -1) * i * size * 1.6,
            baseY: y0 + rand(-size, size),
            vx: (right ? 1 : -1) * rand(150, 190),
            size,
            len: size,
            sway: size * 0.8,
          }),
        );
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Composite figures
// ---------------------------------------------------------------------------

/** Santa's sleigh with three reindeer ahead of it, galloping out of step. */
function sleighTeam(height: number): Draw {
  const deer = sprite("reindeer", height * 0.62, 0.16);
  const sleigh = sprite("sleigh", height);
  return (c, p, t) => {
    const dir = p.vx < 0 ? -1 : 1;
    for (let i = 0; i < 3; i++) {
      c.save();
      c.translate(dir * height * (1.3 + i * 0.95), -height * 0.12 + Math.sin(t * 9 + i) * 2);
      deer(c, { ...p, phase: p.phase + i * 0.08 }, t);
      c.restore();
    }
    c.strokeStyle = "rgba(244, 197, 66, 0.7)";
    c.lineWidth = Math.max(1, height / 50);
    c.beginPath();
    c.moveTo(dir * height * 0.35, -height * 0.05);
    c.lineTo(dir * height * 1.1, -height * 0.15);
    c.stroke();
    sleigh(c, p, t);
  };
}

/**
 * A dance dragon chasing its pearl.
 *
 * The body is painted every frame as one continuous curve rather than a row of
 * beads, which is what made the first version read as a centipede: it tapers
 * from the neck to the tail, ripples in a travelling wave, carries a gold
 * crest of spikes along its back, a darker scaled saddle, two pairs of clawed
 * legs that paddle, and a flame tuft on the tail. Only the head is a picture
 * (DRAGON_HEAD), so the ripple stays smooth at any size. Drawn facing right
 * and mirrored for a crossing the other way.
 */
function dragon(size: number): Draw {
  const N = 44;
  const xs = new Float32Array(N + 1);
  const ys = new Float32Array(N + 1);
  // Slim at the neck so it disappears under the mane, fullest a little way
  // back, then tapering to the tail.
  const radius = (i: number) => {
    const s = i / N;
    const shape = s < 0.14 ? 0.55 + 0.45 * (s / 0.14) : 1 - 0.82 * ((s - 0.14) / 0.86);
    return size * 0.3 * shape + size * 0.025;
  };
  /** The point k radii off the spine toward the back (k > 0) or the belly (k < 0). */
  const edge = (i: number, k: number): [number, number] => {
    const a = Math.max(0, i - 1);
    const b = Math.min(N, i + 1);
    const dx = xs[b] - xs[a];
    const dy = ys[b] - ys[a];
    const len = Math.hypot(dx, dy) || 1;
    // The spine runs toward the tail (negative x), so (-dy, dx) points up.
    const nx = -dy / len;
    const ny = dx / len;
    const r = radius(i) * k;
    return [xs[i] + nx * r, ys[i] + ny * r];
  };
  const band = (c: CanvasRenderingContext2D, outer: (i: number) => number, inner: number) => {
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      const [x, y] = edge(i, outer(i));
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    for (let i = N; i >= 0; i--) {
      const [x, y] = edge(i, inner);
      c.lineTo(x, y);
    }
    c.closePath();
    c.fill();
  };

  return (c, p, t) => {
    const dir = p.vx < 0 ? -1 : 1;
    const L = size * 6.2;
    const amp = size * 0.75;
    const phase = t * 3 + p.phase;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      xs[i] = -size * 0.2 - s * L;
      // The neck is steadier than the tail, as a dancer carrying the head is.
      ys[i] = Math.sin(phase - s * Math.PI * 2) * amp * (0.2 + 0.8 * Math.min(1, s * 1.6));
    }

    c.save();
    c.scale(dir, 1);

    // Legs first, so the body overlaps their tops.
    for (const [at, off] of [
      [0.2, 0],
      [0.26, 1.6],
      [0.6, 0.8],
      [0.66, 2.4],
    ] as const) {
      const i = Math.round(at * N);
      const [bx, by] = edge(i, -0.7);
      const swing = Math.sin(t * 6 + off) * 0.5;
      const lx = bx + Math.sin(swing + 0.5) * size * 0.32;
      const ly = by + Math.cos(swing + 0.5) * size * 0.32;
      c.strokeStyle = "#c4141d";
      c.lineWidth = size * 0.11;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(bx, by);
      c.lineTo(lx, ly);
      c.stroke();
      c.strokeStyle = "#ffb300";
      c.lineWidth = size * 0.04;
      c.beginPath();
      for (const a of [-0.5, 0, 0.5]) {
        c.moveTo(lx, ly);
        c.lineTo(lx + Math.sin(a + 0.6) * size * 0.1, ly + Math.cos(a + 0.6) * size * 0.1);
      }
      c.stroke();
    }

    // The crest: gold spikes standing off the back.
    c.fillStyle = "#ffb020";
    band(c, (i) => (i % 2 ? 1.75 : 0.9), 0.5);

    // The body.
    c.fillStyle = "#e3262d";
    band(c, () => 1, -1);

    // The darker saddle along the back, and its gold scales.
    c.fillStyle = "#b8121c";
    band(c, () => 0.95, 0.05);
    c.strokeStyle = "#ffd84a";
    c.lineWidth = Math.max(1, size * 0.035);
    for (let i = 2; i < N - 2; i += 3) {
      const [x, y] = edge(i, 0.5);
      const r = radius(i) * 0.28;
      c.beginPath();
      c.arc(x, y + r * 0.6, r, Math.PI * 1.15, Math.PI * 1.85);
      c.stroke();
    }

    // The tail's flame tuft, fanned the way the tail points.
    const ang = Math.atan2(ys[N] - ys[N - 2], xs[N] - xs[N - 2]);
    c.fillStyle = "#ffb020";
    for (const spread of [-0.7, -0.35, 0, 0.35, 0.7]) {
      const a = ang + spread;
      const l = size * (0.42 - Math.abs(spread) * 0.2);
      c.beginPath();
      c.moveTo(xs[N] + Math.cos(a + 1.4) * size * 0.05, ys[N] + Math.sin(a + 1.4) * size * 0.05);
      c.lineTo(xs[N] + Math.cos(a) * l, ys[N] + Math.sin(a) * l);
      c.lineTo(xs[N] + Math.cos(a - 1.4) * size * 0.05, ys[N] + Math.sin(a - 1.4) * size * 0.05);
      c.fill();
    }

    // The pearl it never quite catches.
    const px = size * 1.55;
    const py = ys[0] + Math.sin(t * 2.2) * size * 0.18;
    const glow = c.createRadialGradient(px, py, 0, px, py, size * 0.36);
    glow.addColorStop(0, "rgba(255, 241, 184, 0.95)");
    glow.addColorStop(0.45, "rgba(255, 216, 74, 0.8)");
    glow.addColorStop(1, "rgba(255, 207, 63, 0)");
    c.fillStyle = glow;
    c.beginPath();
    c.arc(px, py, size * 0.36, 0, TAU);
    c.fill();

    // The head, its neck on the body's first point, nodding with the wave.
    const head = SPRITES.get("dragon")?.[0];
    if (head) {
      const hs = size / 96;
      const tilt = Math.max(-0.35, Math.min(0.35, Math.atan2(ys[0] - ys[3], xs[0] - xs[3]) * 0.8));
      c.translate(xs[0] + size * 0.05, ys[0]);
      c.rotate(tilt);
      c.drawImage(head, -14 * hs, -54 * hs, 132 * hs, 96 * hs);
    }
    c.restore();
  };
}

/**
 * A lion dance trotting along the bottom edge. Body and head are separate
 * pictures so the head can do the dancing: it bobs as the lion trots, and when
 * the lion stops mid screen the head rears up, shakes and sweeps, the way the
 * front dancer lifts it. Drawn facing right and mirrored for the other way.
 */
function lionDance(size: number): Draw {
  return (c, p, t) => {
    const body = SPRITES.get("lionBody");
    const head = SPRITES.get("lionHead")?.[0];
    if (!body?.length || !head) return;
    const dir = p.vx < 0 ? -1 : 1;
    const dancing = p.pause > 0;
    const frame = body[Math.floor(t / (dancing ? 0.13 : 0.2)) % body.length];
    const bw = (size * 112) / 72;

    c.save();
    c.scale(dir, 1);
    c.drawImage(frame, -bw / 2, -size / 2, bw, size);

    // Lift eases from 0 to 1 over the dance's first half second and back.
    const lift = dancing ? Math.min(1, Math.min(2.6 - p.pause, p.pause) / 0.5) : 0;
    const hs = size;
    const hx = bw * 0.36;
    const hy = -size * 0.28 - lift * size * 0.45;
    const tilt = dancing ? -0.45 * lift + Math.sin(p.age * 10) * 0.16 : Math.sin(t * 8 + p.phase) * 0.06;
    c.translate(hx, hy);
    c.rotate(tilt);
    c.drawImage(head, -hs * 0.3, -hs * 0.62, hs, hs);
    c.restore();
  };
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

export type EngineOptions = {
  canvas: HTMLCanvasElement;
  kind: EffectKind;
  scope: "page" | "box";
  still: boolean;
};

const FORM_FIELD = "input, textarea, select, [contenteditable], [contenteditable='true']";

export function startEngine({ canvas, kind, scope, still }: EngineOptions): { destroy(): void } | null {
  if (kind === "none") return null;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const effect = EFFECTS[kind];
  const host = scope === "box" ? canvas.parentElement : null;

  const ctx: Ctx = { scope, host, turn: 0, born: [], mobile: false };

  let w = 0;
  let h = 0;
  let dpr = 1;
  let budget = typeof navigator !== "undefined" && (navigator.hardwareConcurrency ?? 8) <= 4 ? 0.6 : 1;
  const ambient: Particle[] = [];
  let extras: Particle[] = [];
  let raf = 0;
  let last = 0;
  let clock = 0;
  let nextHero = 0;
  let heroBusy = false;
  let lastBurst = 0;
  let slow = 0;
  let frames = 0;
  let destroyed = false;
  const pointer = { x: -9999, y: -9999 };

  function target(): number {
    const area = (w * h) / 1_000_000;
    const density = effect.density * (w < 640 ? 0.6 : 1);
    const n = Math.min(effect.max, Math.max(effect.min, density * area));
    return Math.max(1, Math.round(n * budget * (still ? 0.5 : 1)));
  }

  function resize() {
    if (host) {
      w = host.clientWidth;
      h = host.clientHeight;
    } else {
      w = document.documentElement.clientWidth;
      h = window.innerHeight;
    }
    ctx.mobile = w < 640;
    dpr = Math.min(window.devicePixelRatio || 1, ctx.mobile ? 1.5 : 2);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const want = target();
    while (ambient.length < want) ambient.push(effect.ambient(w, h, true));
    if (ambient.length > want) ambient.length = want;
  }

  async function loadSprites() {
    const sources = SPRITE_SOURCES[kind];
    if (!sources) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    for (const [name, list] of Object.entries(sources)) {
      if (SPRITES.has(name)) continue;
      // Drawn at up to 70px tall on a desktop; rasterise with headroom.
      const frames = await Promise.all(list.map((s) => loadSprite(s, 80 * scale)));
      if (destroyed) return;
      SPRITES.set(name, frames.filter((f): f is HTMLCanvasElement => f !== null));
    }
  }

  function drawParticle(p: Particle) {
    if (p.alpha <= 0.01) return;
    g!.save();
    g!.globalAlpha = Math.min(1, p.alpha);
    g!.translate(p.x, p.y);
    if (p.rot) g!.rotate(p.rot);
    p.draw(g!, p, clock);
    g!.restore();
  }

  function step(p: Particle, dt: number): boolean {
    p.age += dt;
    switch (p.mode) {
      case "fall":
      case "rise": {
        const dir = p.mode === "fall" ? 1 : -1;
        p.y += dir * p.vy * dt;
        p.x += p.vx * dt + Math.sin(clock * 1.3 + p.phase) * p.sway * dt;
        p.rot += p.vr * dt;
        if (effect.repel) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const d = Math.hypot(dx, dy);
          if (d < 110 && d > 0.1) {
            const push = effect.repel * (1 - d / 110) * 60 * dt;
            p.x += (dx / d) * push;
            p.y += (dy / d) * push;
          }
        }
        return dir > 0 ? p.y < h + p.size * 2 : p.y > -p.size * 2;
      }
      case "ballistic": {
        const k = Math.pow(p.drag, dt);
        p.vx *= k;
        p.vy = p.vy * k + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.ttl -= dt;
        p.alpha = Math.max(0, Math.min(1, p.ttl / (p.life * 0.6)));
        return p.ttl > 0;
      }
      case "fly": {
        p.x += p.vx * dt;
        p.y = p.baseY + Math.sin(p.age * 1.4 + p.phase) * p.sway;
        if (kind === "snow") {
          // Stardust from the runners, every ~45ms.
          p.emit -= dt;
          if (p.emit <= 0) {
            p.emit = 0.045;
            ctx.born.push(
              base({
                mode: "ballistic",
                draw: dot,
                x: p.x - Math.sign(p.vx) * p.size * 0.4,
                y: p.y + p.size * 0.38,
                vx: -p.vx * 0.1 + rand(-14, 14),
                vy: rand(4, 26),
                gravity: 20,
                drag: 0.5,
                ttl: rand(0.6, 1.2),
                life: 1.2,
                size: rand(1.5, 3),
                color: pick(["#ffe08a", "#ffffff", "#f4c542"]),
              }),
            );
          }
        }
        return p.vx > 0 ? p.x - p.len < w : p.x + p.len > 0;
      }
      case "prance": {
        if (p.pause > 0) {
          p.pause -= dt;
          p.y = p.baseY - Math.abs(Math.sin(p.age * 7)) * p.size * 0.18;
          // The dance is in the head (see lionDance); the body only sways.
          p.rot = Math.sin(p.age * 5) * 0.04;
        } else {
          p.x += p.vx * dt;
          p.y = p.baseY - Math.abs(Math.sin(p.age * 9)) * p.size * 0.05;
          p.rot = 0;
          if (!p.danced && Math.abs(p.x - w / 2) < Math.abs(p.vx) * dt * 1.5) {
            p.danced = true;
            p.pause = 2.6;
          }
        }
        return p.vx > 0 ? p.x - p.len < w : p.x + p.len > 0;
      }
      case "rocket": {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy *= Math.pow(0.6, dt);
        if (p.y <= p.target || p.vy > -60) {
          const n = Math.round(28 * budget) + 8;
          for (let i = 0; i < n; i++) {
            const a = (TAU / n) * i + rand(-0.1, 0.1);
            const v = rand(90, 170);
            ctx.born.push(
              base({
                mode: "ballistic",
                draw: dot,
                x: p.x,
                y: p.y,
                vx: Math.cos(a) * v,
                vy: Math.sin(a) * v,
                gravity: 70,
                drag: 0.25,
                ttl: rand(1, 1.7),
                life: 1.7,
                size: rand(2, 3.4),
                color: pick(p.colors.length ? p.colors : ["#fff"]),
              }),
            );
          }
          return false;
        }
        return true;
      }
      case "still":
        // sway holds the resting alpha, captured on the first frame.
        if (!p.sway) p.sway = p.alpha;
        p.alpha = p.sway * (0.55 + 0.45 * Math.sin(clock * 1.6 + p.phase * 3));
        return true;
    }
  }

  function frame(now: number) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const realDt = last ? (now - last) / 1000 : 0;
    last = now;
    const dt = Math.min(realDt, 0.05);
    clock += dt;

    // Adaptive budget: every 90 frames, if more than half were slow, shed load.
    frames += 1;
    if (realDt > 0.025) slow += 1;
    if (frames >= 90) {
      if (slow > 45) {
        budget = Math.max(0.3, budget * 0.7);
        const want = target();
        if (ambient.length > want) ambient.length = want;
      }
      frames = 0;
      slow = 0;
    }

    // Hero sprites run on real time, not the capped physics clock.
    if (effect.every) {
      nextHero -= realDt;
      heroBusy = effect.every.solo ? extras.some((p) => p.mode === "fly" || p.mode === "prance") : false;
      if (nextHero <= 0 && !heroBusy) {
        extras.push(...effect.every.spawn(w, h, ctx));
        nextHero = rand(effect.every.min, effect.every.max);
      }
    }

    g!.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (effect.trails) {
      g!.globalCompositeOperation = "destination-out";
      g!.fillStyle = "rgba(0, 0, 0, 0.22)";
      g!.fillRect(0, 0, w, h);
      g!.globalCompositeOperation = "source-over";
    } else {
      g!.clearRect(0, 0, w, h);
    }

    for (let i = 0; i < ambient.length; i++) {
      const p = ambient[i];
      if (!step(p, dt)) {
        // Recycle the slot rather than allocating a new one each time.
        Object.assign(p, effect.ambient(w, h, false));
      }
      drawParticle(p);
    }

    // Particles spawned while filtering go into `born` and are appended after
    // the pass. Pushing onto `extras` mid filter would lose them.
    extras = extras.filter((p) => {
      const alive = step(p, dt);
      if (alive) drawParticle(p);
      return alive;
    });
    if (ctx.born.length) {
      extras.push(...ctx.born);
      ctx.born.length = 0;
    }
  }

  // ---- Still frame ----------------------------------------------------------
  resize();
  if (still) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const p of ambient) drawParticle(p);
    return {
      destroy() {
        destroyed = true;
        g.clearRect(0, 0, canvas.width, canvas.height);
      },
    };
  }

  // ---- Listeners -------------------------------------------------------------
  const listenOn: Window | HTMLElement = host ?? window;

  function local(e: PointerEvent): [number, number] {
    if (!host) return [e.clientX, e.clientY];
    const r = host.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  const onMove = (e: Event) => {
    const [x, y] = local(e as PointerEvent);
    pointer.x = x;
    pointer.y = y;
  };
  const onLeave = () => {
    pointer.x = -9999;
    pointer.y = -9999;
  };
  const onDown = (e: Event) => {
    const ev = e as PointerEvent;
    const t = ev.target as Element | null;
    if (t?.closest?.(FORM_FIELD)) return;
    const now = performance.now();
    if (now - lastBurst < 250 || extras.length > 140) return;
    lastBurst = now;
    const [x, y] = local(ev);
    extras.push(...effect.burst(x, y, h));
  };

  let resizeQueued = 0;
  const queueResize = () => {
    if (resizeQueued) return;
    resizeQueued = requestAnimationFrame(() => {
      resizeQueued = 0;
      resize();
    });
  };
  const observer = host && "ResizeObserver" in window ? new ResizeObserver(queueResize) : null;
  if (observer && host) observer.observe(host);
  else window.addEventListener("resize", queueResize);

  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf && !destroyed) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  };

  listenOn.addEventListener("pointermove", onMove, { passive: true });
  listenOn.addEventListener("pointerdown", onDown, { passive: true });
  (host ?? document.documentElement).addEventListener("pointerleave", onLeave);
  document.addEventListener("visibilitychange", onVisibility);

  void loadSprites();
  // The first figure arrives a little after the page settles, not on load.
  nextHero = effect.every ? rand(3, 6) : 0;
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      if (resizeQueued) cancelAnimationFrame(resizeQueued);
      listenOn.removeEventListener("pointermove", onMove);
      listenOn.removeEventListener("pointerdown", onDown);
      (host ?? document.documentElement).removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
      window.removeEventListener("resize", queueResize);
    },
  };
}
