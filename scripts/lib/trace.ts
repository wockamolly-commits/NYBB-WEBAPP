/**
 * Raster to SVG tracing, for the store's mural artwork.
 *
 * Everything the designer delivered is a flat picture. There are no live paths
 * anywhere in the handover, so a tracing step sits between the delivered JPEGs
 * and anything the site can use. This is that step.
 *
 * WHY CRACK FOLLOWING AND NOT MARCHING SQUARES.
 * ================================================================
 * The obvious tracer is marching squares at the 0.5 isolevel, and it is wrong
 * here. That contour runs through pixel centres, so it erodes half a pixel off
 * each side of every stroke: a two pixel hatching line comes out at one, and
 * the three stroke weights the mural is built from start collapsing towards
 * each other. DESIGN.md's ink layer rules require those weights to survive, so
 * the tracer follows the cracks *between* pixels instead. That boundary is
 * exact: the traced area equals the inked area, and a stroke keeps the width it
 * was drawn at.
 *
 * The cost is rectilinear staircases on every diagonal, which is what the
 * Douglas-Peucker pass afterwards is for. At a tolerance near one working pixel
 * a staircase collapses back to the straight line it was approximating, while a
 * genuine corner is further than that from any chord and survives.
 *
 * WHY LOOPS AND NOT SHAPES.
 * ================================================================
 * Every closed loop is emitted into one path with `fill-rule="evenodd"`, so a
 * loop inside another loop is a hole without anyone having to work out which
 * loops are holes. That matters more than it sounds: the mural is full of
 * counters (the O in BUFFALO, the gaps inside the traffic signal hoods) and
 * nesting can run three deep.
 */

export type Point = readonly [number, number];

export type TraceOptions = {
  /** Below this luminance a pixel is ink. The art is near bimodal, so the
   *  exact value barely matters between about 100 and 180. */
  threshold?: number;
  /** Douglas-Peucker tolerance, in working pixels. */
  simplify?: number;
  /** Loops enclosing less than this many working pixels are dropped. This is
   *  what removes scanner specks and the pinholes inside a brush stroke. It
   *  applies to holes too, because a loop is a loop. */
  minArea?: number;
  /** Coordinate decimals in the emitted path. Two is past the point of visible
   *  difference and costs real bytes, so the default is one. */
  decimals?: number;
};

const DEFAULTS = {
  threshold: 128,
  simplify: 0.8,
  minArea: 6,
  decimals: 1,
} satisfies Required<TraceOptions>;

export type TraceResult = {
  d: string;
  width: number;
  height: number;
  loops: number;
  points: number;
};

/**
 * Trace a greyscale bitmap into a single SVG path.
 *
 * `grey` is one byte per pixel, row major, as sharp's `.greyscale().raw()`
 * hands it over.
 */
export function traceBitmap(
  grey: Uint8Array | Buffer,
  width: number,
  height: number,
  options: TraceOptions = {},
): TraceResult {
  // Resolved field by field with `??` rather than by spreading over DEFAULTS.
  // A caller passing `{ threshold: motif.threshold }` for a motif that does not
  // set one spreads an explicit `undefined`, which beats the default: every
  // comparison against it is false, the ink mask comes out empty, and the trace
  // silently yields nothing. That cost a run to find.
  const threshold = options.threshold ?? DEFAULTS.threshold;
  const simplify = options.simplify ?? DEFAULTS.simplify;
  const minArea = options.minArea ?? DEFAULTS.minArea;
  const decimals = options.decimals ?? DEFAULTS.decimals;

  const ink = new Uint8Array(width * height);
  for (let i = 0; i < ink.length; i++) ink[i] = grey[i] < threshold ? 1 : 0;

  const loops = followCracks(ink, width, height);

  const parts: string[] = [];
  let kept = 0;
  let points = 0;

  for (const loop of loops) {
    if (Math.abs(signedArea(loop)) < minArea) continue;

    const simplified = douglasPeucker(loop, simplify);
    // Three points is the smallest thing that encloses any area at all.
    if (simplified.length < 3) continue;

    kept++;
    points += simplified.length;
    parts.push(toPathData(simplified, decimals));
  }

  return { d: parts.join(""), width, height, loops: kept, points };
}

/**
 * Walk the boundary between ink and everything else.
 *
 * Each inked pixel contributes one directed edge per side that faces a
 * non-inked neighbour, wound clockwise in screen coordinates so that ink is
 * consistently on one side. Those edges then chain head to tail into closed
 * loops. Coordinates are integer pixel corners throughout, so the chaining is
 * exact rather than tolerance based.
 */
function followCracks(ink: Uint8Array, width: number, height: number): Point[][] {
  const stride = width + 1;
  const key = (x: number, y: number) => y * stride + x;

  // One bucket per corner, holding the edges that leave it. A corner can carry
  // two outgoing edges where two diagonally touching runs of ink meet, which is
  // why this is a list rather than a single slot.
  const outgoing = new Map<number, number[]>();
  const edgeTo: number[] = [];
  const used: boolean[] = [];

  const addEdge = (ax: number, ay: number, bx: number, by: number) => {
    const from = key(ax, ay);
    const id = edgeTo.length;
    edgeTo.push(key(bx, by));
    used.push(false);
    const bucket = outgoing.get(from);
    if (bucket) bucket.push(id);
    else outgoing.set(from, [id]);
  };

  const isInk = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && ink[y * width + x] === 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isInk(x, y)) continue;
      if (!isInk(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!isInk(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!isInk(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!isInk(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }

  const loops: Point[][] = [];

  for (let start = 0; start < edgeTo.length; start++) {
    if (used[start]) continue;

    const loop: Point[] = [];
    let edge = start;

    for (;;) {
      used[edge] = true;
      const to = edgeTo[edge];
      loop.push([to % stride, (to - (to % stride)) / stride]);

      const bucket = outgoing.get(to);
      if (!bucket) break;

      const next = bucket.find((candidate) => !used[candidate]);
      if (next === undefined) break;
      edge = next;
    }

    if (loop.length >= 3) loops.push(loop);
  }

  return loops;
}

/** Twice the enclosed area, by the shoelace formula. Sign is orientation, which
 *  evenodd makes irrelevant, so callers take the absolute value. */
function signedArea(loop: Point[]): number {
  let sum = 0;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    sum += (loop[j][0] - loop[i][0]) * (loop[j][1] + loop[i][1]);
  }
  return sum / 2;
}

/**
 * Douglas-Peucker, run on a closed ring.
 *
 * A ring has no natural endpoints, so it is split at the two points furthest
 * apart and each half is simplified as an open chain. Anchoring at an arbitrary
 * index instead leaves a visible kink at that index on smooth curves.
 */
function douglasPeucker(loop: Point[], tolerance: number): Point[] {
  if (loop.length < 4) return loop;

  let b = 0;
  let best = -1;
  for (let i = 1; i < loop.length; i++) {
    const d = squaredDistance(loop[0], loop[i]);
    if (d > best) {
      best = d;
      b = i;
    }
  }
  if (b === 0) return loop;

  const first = loop.slice(0, b + 1);
  const second = loop.slice(b).concat([loop[0]]);

  const simplifiedFirst = simplifyChain(first, tolerance);
  const simplifiedSecond = simplifyChain(second, tolerance);

  // Both halves carry the shared join points, so drop the duplicates.
  return simplifiedFirst.slice(0, -1).concat(simplifiedSecond.slice(0, -1));
}

function simplifyChain(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const toleranceSq = tolerance * tolerance;
  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end - start < 2) continue;

    let furthest = -1;
    let furthestDistance = -1;

    for (let i = start + 1; i < end; i++) {
      const d = squaredPerpendicular(points[i], points[start], points[end]);
      if (d > furthestDistance) {
        furthestDistance = d;
        furthest = i;
      }
    }

    if (furthestDistance > toleranceSq && furthest > 0) {
      keep[furthest] = 1;
      stack.push([start, furthest], [furthest, end]);
    }
  }

  return points.filter((_, i) => keep[i] === 1);
}

function squaredDistance(a: Point, b: Point): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function squaredPerpendicular(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];

  if (dx === 0 && dy === 0) return squaredDistance(point, a);

  const t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = a[0] + clamped * dx;
  const py = a[1] + clamped * dy;

  return squaredDistance(point, [px, py]);
}

/**
 * One subpath, with relative line commands.
 *
 * Relative is worth real bytes here: an absolute coordinate in a 1200 unit
 * viewBox is four or five characters, and the step between two traced points is
 * almost always one or two.
 */
function toPathData(loop: Point[], decimals: number): string {
  const round = (value: number) => {
    const fixed = value.toFixed(decimals);
    // "12.0" and "-0.0" are bytes nobody needs.
    return fixed.replace(/\.0+$/, "").replace(/^-0$/, "0");
  };

  let d = `M${round(loop[0][0])} ${round(loop[0][1])}`;
  let previous = loop[0];

  for (let i = 1; i < loop.length; i++) {
    const dx = loop[i][0] - previous[0];
    const dy = loop[i][1] - previous[1];

    if (dy === 0) d += `h${round(dx)}`;
    else if (dx === 0) d += `v${round(dy)}`;
    else d += `l${round(dx)} ${round(dy)}`;

    previous = loop[i];
  }

  return `${d}z`;
}

/**
 * Wrap traced path data as a standalone SVG file.
 *
 * `fill="currentColor"` is the whole point of this pipeline and is not
 * negotiable. The same file has to render as char on the amber ground, bone on
 * a charcoal card, and orange where a graphic accent is wanted, so the colour
 * cannot live in the file. There is no width or height attribute either: the
 * viewBox alone lets a caller scale it from a 64px tile to a full page scene.
 */
export function wrapSvg(result: TraceResult, options: { title?: string } = {}): string {
  const title = options.title
    ? `<title>${options.title.replace(/[<>&]/g, "")}</title>`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${result.width} ${result.height}" fill="currentColor" fill-rule="evenodd">`,
    title,
    `<path d="${result.d}"/>`,
    `</svg>`,
  ].join("");
}
