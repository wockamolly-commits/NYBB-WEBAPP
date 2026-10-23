/**
 * Extract the footer skyline as a single stroked line.
 *
 * Source: the designer's "Silhouette_traced building copy.png", a 3118x203
 * transparent PNG holding one continuous stepped hairline, the top edge of a
 * city and nothing else.
 *
 * WHY A CENTRELINE AND NOT A TRACE. Potrace (scripts/trace-mural.ts) turns
 * ink into filled shapes, so a hairline comes out as a thin filled ribbon
 * whose weight scales with the drawing. The footer shows this band at every
 * width from 360px to a wide desktop, a ratio of more than five, so a ribbon
 * that reads at 1920 is a hairline that vanishes on a phone. A centreline
 * drawn with `vector-effect: non-scaling-stroke` keeps one line weight at
 * every width, which is what the artwork is: a pen line, not a shape.
 *
 * Method. For every column, the topmost ink pixel marks the top edge of the
 * stroke, and half the stroke weight below it is the centre. A jump between
 * neighbouring columns is a wall, emitted as an exact vertical. The walls are
 * then nudged by half a stroke, because the topmost ink in a wall's columns
 * belongs to the roof it climbs to, which otherwise widens every building by
 * one stroke. Finally Ramer-Douglas-Peucker collapses the per-column points
 * into the drawing's own straight runs and diagonals.
 *
 * Run `npm run build:skyline`. Writes lib/mural/skyline-outline.ts.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DESIGNS =
  process.env.NYBB_DESIGNS_DIR ??
  "C:/Users/Steven/Downloads/NYBB_DESIGNS-20260807T033848Z-1-001/NYBB_DESIGNS";
const SOURCE = path.join(DESIGNS, "Silhouette_traced building copy.png");
const OUT = path.join(process.cwd(), "lib", "mural", "skyline-outline.ts");

/** Alpha above this is ink. */
const INK = 128;
/** A vertical jump bigger than this between columns is a wall. */
const WALL = 3;
/** Simplification tolerance, in source pixels. */
const EPSILON = 0.9;

type Point = [number, number];

function rdp(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const length = Math.hypot(bx - ax, by - ay) || 1;
  let worst = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const distance = Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / length;
    if (distance > worst) {
      worst = distance;
      index = i;
    }
  }
  if (worst <= epsilon) return [points[0], points[points.length - 1]];
  const left = rdp(points.slice(0, index + 1), epsilon);
  const right = rdp(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

/** The most common vertical run length, which is the pen's weight. */
function strokeWeight(alpha: Buffer, width: number, height: number): number {
  const counts = new Map<number, number>();
  for (let x = 0; x < width; x++) {
    let run = 0;
    for (let y = 0; y < height; y++) {
      if (alpha[y * width + x] > INK) run++;
      else if (run) break;
    }
    if (run) counts.set(run, (counts.get(run) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

async function main() {
  const { data, info } = await sharp(SOURCE)
    .extractChannel("alpha")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const weight = strokeWeight(data, width, height);
  const half = weight / 2;

  const centre: number[] = [];
  for (let x = 0; x < width; x++) {
    let top = -1;
    for (let y = 0; y < height; y++) {
      if (data[y * width + x] > INK) {
        top = y;
        break;
      }
    }
    if (top < 0) throw new Error(`Column ${x} has no ink: the outline is not continuous.`);
    centre.push(top + half);
  }

  // Split into runs at every wall, simplify each run on its own so a wall is
  // never smoothed into a slope, then join the runs with exact verticals.
  const runs: { from: number; to: number }[] = [];
  let start = 0;
  for (let x = 1; x < width; x++) {
    if (Math.abs(centre[x] - centre[x - 1]) > WALL) {
      runs.push({ from: start, to: x - 1 });
      start = x;
    }
  }
  runs.push({ from: start, to: width - 1 });

  const walls = runs.slice(1).map((run, i) => {
    const before = centre[runs[i].to];
    const after = centre[run.from];
    // Climbing (y decreasing): the wall's columns read as the higher roof, so
    // the true centre is half a stroke to the right. Descending, to the left.
    return run.from - 0.5 + (after < before ? half : -half);
  });

  const points: Point[] = [];
  runs.forEach((run, i) => {
    const left = i === 0 ? 0 : walls[i - 1];
    const right = i === runs.length - 1 ? width : walls[i];
    const raw: Point[] = [[left, centre[run.from]]];
    for (let x = run.from; x <= run.to; x++) {
      if (x + 0.5 > left && x + 0.5 < right) raw.push([x + 0.5, centre[x]]);
    }
    raw.push([right, centre[run.to]]);
    points.push(...rdp(raw, EPSILON));
  });

  const round = (n: number) => Math.round(n * 10) / 10;
  const d =
    "M" +
    points
      .filter(
        (p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1],
      )
      .map(([x, y]) => `${round(x)} ${round(y)}`)
      .join("L");

  const ground = Math.max(...centre);

  const file = `/**
 * GENERATED by scripts/trace-skyline-outline.ts. Do not edit.
 *
 * Run \`npm run build:skyline\` to regenerate. The centreline of the designer's
 * traced skyline, "Silhouette_traced building copy.png", in that file's own
 * pixel space. Draw it as a stroke, never a fill.
 */

export const SKYLINE_OUTLINE = {
  /** Source width, and the viewBox width. */
  width: ${width},
  /** Source height. */
  height: ${height},
  /** The lowest point of the line, where the buildings meet the ground. */
  ground: ${round(ground)},
  /** The pen weight in the source, in source pixels. */
  weight: ${weight},
  d: "${d}",
} as const;
`;
  await writeFile(OUT, file);
  console.log(
    `weight ${weight}px, ${points.length} points, ${d.length} bytes, ground ${ground}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
