import { describe, expect, it } from "vitest";
import { BONE, PALETTES } from "@/lib/themes/palettes";

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Every pair the storefront prints, per theme, at AA. If a palette fails here,
 * change the palette; do not loosen the threshold.
 */
describe("seasonal palettes meet AA on every pair the storefront prints", () => {
  for (const [id, p] of Object.entries(PALETTES)) {
    const pairs: [string, string, string][] = [
      ["ink on accent (button label)", p.ink, p.accent],
      ["ink on accent hover", p.ink, p.accentLit],
      ["accent on card (price)", p.accent, p.charcoal],
      ["bone on card", BONE, p.charcoal],
      ["bone on raised card", BONE, p.graphite],
      ["signal on ink", p.signal, p.ink],
      ["signal on card", p.signal, p.charcoal],
      ["ink on cream chrome", p.ink, p.cream],
      ["ink on deep chrome", p.ink, p.parchmentDeep],
      ...p.ground.map((g, i): [string, string, string] => [`ink on ground stop ${i + 1}`, p.ink, g]),
    ];
    for (const [label, fg, bg] of pairs) {
      it(`${id}: ${label}`, () => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
