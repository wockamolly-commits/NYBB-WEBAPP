import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { MURAL_MOTIFS } from "@/lib/mural/assets";

export const alt =
  "New York Buffalo Brad's Hot Wings. The store's hand drawn marquee on a New York street corner, over the brand's warm amber ground.";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The share image.
 *
 * WHY THERE IS ALMOST NO TYPE ON IT. A share card is usually seen at a few
 * hundred pixels wide in a chat window, and the brand's own marquee is already
 * the most legible object it owns: the drawing carries "NEW YORK BUFFALO
 * BRAD'S HOT WINGS" in heavy marker letters, at billboard scale, in the
 * artwork. Setting the same words again in Anton beside it would be the same
 * statement twice, and it would be the smaller of the two.
 *
 * The only lettering added is the store's tagline in the store's script, which
 * is the one job that face has anywhere on this site.
 *
 * WHY THE INK IS BAKED HERE, AND WHY THAT IS NOT THE THING THE RULES FORBID.
 * Everywhere on the site a mural asset inherits its colour, because the same
 * file has to serve char on amber and bone on charcoal. This is not the site.
 * It is a PNG rendered once, at a fixed size, on a ground this file chooses, and
 * a PNG has no surface to inherit from. The rule exists so a drawing cannot
 * arrive as a white box on the amber ground; here there is no box, because the
 * ground is painted first and the drawing is composited into it.
 *
 * Satori lays this out, so everything is flexbox. There is no grid, no gap
 * shorthand on some versions, and every element that holds children needs an
 * explicit display value.
 */
export default async function OpengraphImage() {
  const [scene, script] = await Promise.all([
    readFile(path.join(process.cwd(), "public", MURAL_MOTIFS.storefront.src), "utf8"),
    readFile(path.join(process.cwd(), "app", "fonts", "DaughterOfFortune.ttf")),
  ]);

  const inked = scene.replace('fill="currentColor"', 'fill="#0b0b0c"');
  const sceneUri = `data:image/svg+xml;base64,${Buffer.from(inked).toString("base64")}`;

  // The five stops, quoted rather than derived. Same swatches as everywhere
  // else the ramp appears, which is the whole point of it being five fixed
  // values instead of a gradient function.
  const heat = ["#f9ee18", "#f7c115", "#f47621", "#ef4a17", "#ee2329"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#f7a70f",
          backgroundImage:
            "linear-gradient(160deg, #f2860f 0%, #f7a70f 30%, #f9c614 66%, #fae51a 100%)",
        }}
      >
        <div style={{ display: "flex", flex: 1, alignItems: "center", overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "0 0 0 64px",
              // Held to 470px of text measure. The script runs wide and Satori
              // will overflow a line rather than break inside a word, so the
              // second line ran straight into the drawing at the first size
              // tried. The column is sized to the longest line, not guessed.
              width: 500,
            }}
          >
            <div
              style={{
                fontFamily: "Daughter of Fortune",
                fontSize: 46,
                color: "#0b0b0c",
                lineHeight: 1.18,
                maxWidth: 420,
              }}
            >
              #Your All Time Favorite Chicken Wings
            </div>
          </div>

          {/* Bled off the right and bottom edges on purpose: a drawing that
              stops short of the edge with amber all round reads as a sticker
              placed on the card, and this one is meant to read as printed into
              it. */}
          <div style={{ display: "flex", flex: 1, height: "100%", position: "relative" }}>
            {/* A plain img on purpose. This tree is never mounted in a
                browser: Satori rasterizes it on the server into the PNG, and
                next/image would render markup Satori does not implement. The
                card's alt text is the exported `alt` above, which is what ends
                up in og:image:alt, so the element's own alt is empty. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sceneUri}
              alt=""
              width={720}
              height={920}
              style={{ position: "absolute", right: -40, top: -108 }}
            />
          </div>
        </div>

        <div style={{ display: "flex", width: "100%", height: 16 }}>
          {heat.map((stop) => (
            <div key={stop} style={{ flex: 1, backgroundColor: stop }} />
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Daughter of Fortune", data: script, style: "normal", weight: 400 }],
    },
  );
}
