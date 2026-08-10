import { MuralArt } from "@/components/mural/MuralArt";
import type { MuralMotifName } from "@/lib/mural/assets";
import { cn } from "@/lib/utils";

/**
 * The tile for an item with no usable photograph.
 *
 * Roughly a dozen items on the seeded menu have none: the iced coffee line and
 * the waffle posters have the headline burned into the pixels, which makes them
 * advertisements rather than product shots, and a handful of sides were never
 * photographed at all.
 *
 * The rule is that this must look designed, not broken. It carries the brand
 * ground, the item name in the display face, and now a motif from the store's
 * own wall rather than a repeating diagonal ruling. A grey box or a broken-image
 * glyph would read as a bug on a CEO demo.
 *
 * WHY THE DRAWING IS FAINT RATHER THAN FULL STRENGTH. The name sits on top of
 * it, and ink type over a full strength drawing is unreadable wherever a marker
 * stroke lands behind a letter. So the motif is ink at low alpha on the orange,
 * which darkens the ground rather than lightening it and reads as something
 * printed into the tile. That is the buffalo mark's treatment applied at a
 * smaller size, not a new idea. The alpha is measured, not guessed: it is the
 * value at which ink on the darkened orange still clears 4.5:1 in the worst
 * case, which is a solid stroke sitting directly behind a letter.
 *
 * WHY THE MOTIF VARIES. A dozen of these can land in one grid, and a dozen
 * copies of one drawing reads as a bug rather than as a pattern. The variant is
 * derived from the item name, so it is stable: the same item gets the same
 * drawing on the server, on the client, and on the next deploy. Random would
 * reshuffle on every render and hydrate differently from the server.
 *
 * The rotation is a few degrees rather than a quarter turn. These are motifs
 * with a horizon in them, so a car stood on its nose does not read as variety,
 * it reads as a broken asset. Mirroring does most of the work and the small
 * angle does the rest.
 */

const TILE_MOTIFS = [
  "tile-car",
  "tile-crowd",
  "tile-signal",
] as const satisfies readonly MuralMotifName[];

const ANGLES = [-5, -2, 2, 5] as const;

function variantFor(name: string) {
  // FNV-ish, and deliberately not a hash import. All this has to do is spread
  // a dozen names across three motifs without clustering.
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return {
    motif: TILE_MOTIFS[hash % TILE_MOTIFS.length],
    mirrored: ((hash >>> 8) & 1) === 1,
    angle: ANGLES[(hash >>> 12) % ANGLES.length],
  };
}

export function NoPhotoTile({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const { motif, mirrored, angle } = variantFor(name);

  return (
    <div
      className={cn(
        "tile-orange relative flex aspect-square items-center justify-center overflow-hidden",
        className,
      )}
    >
      {/* `cover` rather than `contain`: this is the tile's ground, so it fills
          the square and is cropped by it. The scale keeps the corners covered
          once the drawing is turned. */}
      <MuralArt
        motif={motif}
        fit="cover"
        className="text-nybb-ink absolute inset-0 h-full w-full opacity-[0.14]"
        style={{
          transform: `scale(1.25) rotate(${angle}deg)${mirrored ? " scaleX(-1)" : ""}`,
        }}
      />

      <span className="font-display relative px-5 text-center text-lg leading-[0.95] text-nybb-ink sm:text-xl">
        {name}
      </span>
    </div>
  );
}
