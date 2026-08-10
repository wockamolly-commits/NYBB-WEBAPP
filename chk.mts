import { readFileSync } from "node:fs";
import { MURAL_MOTIFS } from "./lib/mural/assets";

// Parse the path data and find the real ink bounding box, then compare it with
// the declared viewBox. Dead margin inside the viewBox is dead margin inside
// every mask that uses it.
for (const [slug, m] of Object.entries(MURAL_MOTIFS)) {
  const svg = readFileSync("public" + m.src, "utf8");
  const d = svg.slice(svg.indexOf('d="') + 3, svg.indexOf('"/></svg>'));

  let x = 0;
  let y = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const tokens = d.match(/[MmHhVvLlZz][^MmHhVvLlZz]*/g) ?? [];
  for (const t of tokens) {
    const cmd = t[0];
    const nums = (t.slice(1).match(/-?\d*\.?\d+/g) ?? []).map(Number);
    if (cmd === "M") {
      x = nums[0];
      y = nums[1];
    } else if (cmd === "h") x += nums[0];
    else if (cmd === "v") y += nums[0];
    else if (cmd === "l") {
      x += nums[0];
      y += nums[1];
    } else continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const padTop = minY;
  const padBottom = m.height - maxY;
  const padLeft = minX;
  const padRight = m.width - maxX;
  const flag =
    Math.max(padTop, padBottom, padLeft, padRight) > 2 ? "   <-- DEAD MARGIN" : "";
  console.log(
    `${slug.padEnd(18)} viewBox ${m.width}x${m.height}  ink ${Math.round(minX)},${Math.round(minY)} -> ${Math.round(maxX)},${Math.round(maxY)}` +
      `  pad L${Math.round(padLeft)} R${Math.round(padRight)} T${Math.round(padTop)} B${Math.round(padBottom)}${flag}`,
  );
}
